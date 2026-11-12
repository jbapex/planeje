/**
 * Valida a migração do financeiro no banco isolado planeje_fin_teste.
 * Recusa outro banco. A transação termina em ROLLBACK.
 * Não apaga nem grava lançamento de produção.
 */
import { spawnSync } from 'node:child_process';
import {
  efeitoCaixaLiquidacao,
  ocorrenciasAEmitir,
  resumoCaixaPeriodo,
  saldoPendenteCents,
  shouldGenerateMensalidade,
  validarLiquidacao,
} from '../src/lib/agenciaFinanceiro.js';

const BANCO = 'planeje_fin_teste';

function psql(banco, sql) {
  const res = spawnSync(
    'docker',
    ['exec', '-i', 'supabase-db', 'psql', '-U', 'postgres', '-d', banco, '-v', 'ON_ERROR_STOP=1', '-t', '-A'],
    { input: sql, encoding: 'utf8' },
  );
  if (res.status !== 0) {
    throw new Error(res.stderr || res.stdout || `psql ${banco} falhou`);
  }
  return res.stdout.trim();
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const nome = psql(BANCO, 'SELECT current_database();');
assert(nome === BANCO, `banco inesperado: ${nome}`);

const producaoAntes = psql('postgres', "SELECT count(*) FROM agencia_fin_lancamentos;");

assert(shouldGenerateMensalidade({ etapa: 'closed', valor: 2500 }) === false, 'etapa fechada não emite');

const clienteId = '11111111-1111-4111-8111-111111111111';
const rascunhoId = '22222222-2222-4222-8222-222222222222';
const servicoId = '33333333-3333-4333-8333-333333333333';
const rascunho = {
  id: rascunhoId,
  cliente_id: clienteId,
  descricao: 'Rascunho teste',
  estado: 'rascunho',
  modo: 'recorrente',
  valor: 2500,
  inicio: '2026-10-01',
  periodicidade: 'mensal',
  dia_cobranca: 10,
};
const ativo = {
  ...rascunho,
  id: servicoId,
  descricao: 'Mensalidade teste',
  estado: 'ativo',
};
const primeira = ocorrenciasAEmitir({ servicos: [rascunho, ativo], existentes: [], mesRef: '2026-10-01' });
assert(primeira.length === 1, `emissão esperada 1, veio ${primeira.length}`);
assert(primeira[0].chave === `${servicoId}:2026-10-01`, 'chave da competência');
assert(primeira[0].vencimento === '2026-10-10', 'vencimento no dia 10');
assert(primeira[0].valor === 2500, 'valor integral na competência');
const segunda = ocorrenciasAEmitir({
  servicos: [ativo],
  existentes: [{ chave: primeira[0].chave, status: 'previsto' }],
  mesRef: '2026-10-01',
});
assert(segunda.length === 0, 'a segunda emissão da mesma chave vem vazia');

const titulo = { bruto: 2500, desconto: 0, acrescimos: 0 };
const parcial = validarLiquidacao(titulo, [], 1000);
assert(parcial.ok && parcial.quita === false && parcial.saldoDepoisCents === 150000, 'parcial de 1000');
const quita = validarLiquidacao(titulo, [{ valor_obrigacao: 1000, status: 'valido' }], 1500);
assert(quita.ok && quita.quita === true, '1500 quita o saldo');
const demais = validarLiquidacao(titulo, [{ valor_obrigacao: 1000, status: 'valido' }], 1500.01);
assert(demais.ok === false, 'valor acima do saldo é recusado');
const taxa = efeitoCaixaLiquidacao({ valorObrigacao: 1000, taxaRetida: 30 });
assert(taxa.quitaCents === 100000 && taxa.entraCaixaCents === 97000 && taxa.taxaCents === 3000, 'taxa retida');
const caixa = resumoCaixaPeriodo({ saldoAbertura: 1000, entradas: 970, saidas: 0 });
assert(caixa.saldoFinal === 1970, 'saldo inicial entra no caixa');

const sql = `
BEGIN;
INSERT INTO clientes (id, empresa, etapa, valor) VALUES ('${clienteId}', 'Loja teste', 'closed', 2500);
INSERT INTO agencia_fin_servicos (
  id, cliente_id, descricao, estado, modo, valor, inicio, periodicidade, dia_cobranca, competencia_inicial
) VALUES
  ('${rascunhoId}', '${clienteId}', 'Rascunho teste', 'rascunho', 'recorrente', 2500, '2026-10-01', 'mensal', 10, '2026-10-01'),
  ('${servicoId}', '${clienteId}', 'Mensalidade teste', 'ativo', 'recorrente', 2500, '2026-10-01', 'mensal', 10, '2026-10-01');

INSERT INTO agencia_fin_lancamentos (
  competencia, grupo, categoria_id, cliente_id, servico_id, descricao, valor, origem, status, chave, vencimento, data_caixa
)
SELECT '2026-10-01', 'receita', id, '${clienteId}', '${servicoId}', 'Mensalidade teste', 2500, 'manual', 'previsto',
       '${primeira[0].chave}', '2026-10-10', NULL
FROM agencia_fin_categorias WHERE nome = 'Mensalidade' AND grupo = 'receita';

DO $$
BEGIN
  IF (SELECT count(*) FROM agencia_fin_lancamentos WHERE cliente_id = '${clienteId}' AND origem = 'mensalidade') <> 0 THEN
    RAISE EXCEPTION 'cliente fechado ganhou mensalidade';
  END IF;
  IF (SELECT count(*) FROM agencia_fin_lancamentos WHERE chave = '${primeira[0].chave}') <> 1 THEN
    RAISE EXCEPTION 'emissão não gravou uma linha';
  END IF;
  IF (SELECT vencimento FROM agencia_fin_lancamentos WHERE chave = '${primeira[0].chave}') <> DATE '2026-10-10' THEN
    RAISE EXCEPTION 'vencimento divergente';
  END IF;
  IF (SELECT data_caixa FROM agencia_fin_lancamentos WHERE chave = '${primeira[0].chave}') IS NOT NULL THEN
    RAISE EXCEPTION 'data de caixa preenchida na emissão';
  END IF;
  BEGIN
    INSERT INTO agencia_fin_lancamentos (
      competencia, grupo, categoria_id, cliente_id, servico_id, descricao, valor, origem, status, chave, vencimento
    )
    SELECT competencia, grupo, categoria_id, cliente_id, servico_id, descricao, valor, origem, status, chave, vencimento
    FROM agencia_fin_lancamentos WHERE chave = '${primeira[0].chave}';
    RAISE EXCEPTION 'chave duplicada foi aceita';
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;
END $$;

WITH titulo AS (
  SELECT id FROM agencia_fin_lancamentos WHERE chave = '${primeira[0].chave}'
)
INSERT INTO agencia_fin_liquidacoes (lancamento_id, valor_obrigacao, valor_caixa, taxa, data_caixa, status, chave_idempotencia)
SELECT id, 1000, 970, 30, '2026-10-03', 'valido', 'liq-1'
FROM titulo;

DO $$
DECLARE
  titulo_id uuid;
BEGIN
  SELECT id INTO titulo_id FROM agencia_fin_lancamentos WHERE chave = '${primeira[0].chave}';
  IF (SELECT status FROM agencia_fin_lancamentos WHERE id = titulo_id) <> 'previsto' THEN
    RAISE EXCEPTION 'parcial não pode quitar o título';
  END IF;
  IF (SELECT coalesce(sum(valor_obrigacao), 0) FROM agencia_fin_liquidacoes WHERE lancamento_id = titulo_id AND status = 'valido') <> 1000 THEN
    RAISE EXCEPTION 'parcial não gravou 1000';
  END IF;
  BEGIN
    INSERT INTO agencia_fin_liquidacoes (lancamento_id, valor_obrigacao, valor_caixa, taxa, data_caixa, chave_idempotencia)
    VALUES (titulo_id, 1000, 970, 30, '2026-10-03', 'liq-1');
    RAISE EXCEPTION 'liquidação duplicada foi aceita';
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;
  INSERT INTO agencia_fin_liquidacoes (lancamento_id, valor_obrigacao, valor_caixa, taxa, data_caixa, chave_idempotencia)
  VALUES (titulo_id, 1500, 1500, 0, '2026-10-20', 'liq-2');
  UPDATE agencia_fin_lancamentos
     SET status = 'recebido', data_caixa = '2026-10-20'
   WHERE id = titulo_id;
  IF (SELECT vencimento FROM agencia_fin_lancamentos WHERE id = titulo_id) <> DATE '2026-10-10' THEN
    RAISE EXCEPTION 'receber mudou o vencimento';
  END IF;
  UPDATE agencia_fin_liquidacoes SET status = 'estornado' WHERE chave_idempotencia = 'liq-2';
  UPDATE agencia_fin_lancamentos SET status = 'previsto', data_caixa = NULL WHERE id = titulo_id;
  IF (SELECT status FROM agencia_fin_lancamentos WHERE id = titulo_id) <> 'previsto' THEN
    RAISE EXCEPTION 'estorno não reabriu';
  END IF;
END $$;

INSERT INTO agencia_fin_contas (nome, saldo_abertura, data_abertura)
VALUES ('Caixa teste', 1000, '2026-10-01');

SELECT 'ok' ;
ROLLBACK;
`;

const saida = psql(BANCO, sql);
assert(saida.split('\n').includes('ok'), `fluxo no banco não concluiu: ${saida}`);
const restos = psql(BANCO, "SELECT count(*) FROM agencia_fin_lancamentos;");
assert(restos === '0', `o teste deixou lançamento no banco de teste: ${restos}`);
const producaoDepois = psql('postgres', "SELECT count(*) FROM agencia_fin_lancamentos;");
assert(producaoAntes === producaoDepois, `produção mudou de ${producaoAntes} para ${producaoDepois}`);
const tabelasNovas = psql('postgres', "SELECT to_regclass('public.agencia_fin_servicos') IS NULL;");
assert(tabelasNovas === 't', 'a migração nova apareceu no banco de produção');

console.log(JSON.stringify({
  banco: BANCO,
  emissao: primeira.length,
  segundaEmissao: segunda.length,
  saldoParcial: saldoPendenteCents(titulo, [{ valor_obrigacao: 1000, status: 'valido' }]),
  producaoLancamentos: Number(producaoDepois),
  testeLancamentos: Number(restos),
}));
