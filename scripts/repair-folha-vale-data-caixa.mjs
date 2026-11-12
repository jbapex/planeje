/**
 * Recalcula data_caixa dos lançamentos de Vale (folha) previstos:
 * competência do mês + 1, no dia_vale do contrato (regra dataPrevistaValeFolha).
 * Só postgres (produção). Não mexe em vales já pagos.
 *
 * Uso: node scripts/repair-folha-vale-data-caixa.mjs        # prévia
 *      node scripts/repair-folha-vale-data-caixa.mjs --apply
 */
import { spawnSync } from 'node:child_process';

const APPLY = process.argv.includes('--apply');

function psql(sql) {
  const res = spawnSync(
    'docker',
    ['exec', '-i', 'supabase-db', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
    { input: sql, encoding: 'utf8' },
  );
  if (res.status !== 0) {
    throw new Error(res.stderr || res.stdout || 'psql falhou');
  }
  return res.stdout;
}

const db = spawnSync(
  'docker',
  ['exec', '-i', 'supabase-db', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-c', 'SELECT current_database();'],
  { encoding: 'utf8' },
);
if (db.stdout.trim() !== 'postgres') {
  console.error('Abortado: use apenas no banco postgres de produção.');
  process.exit(1);
}

const previewSql = `
SELECT l.id,
       l.data_caixa AS antes,
       (
         (date_trunc('month', f.competencia::timestamp) + interval '1 month')::date
         + (LEAST(GREATEST(COALESCE(c.dia_vale, 5), 1), 28) - 1) * interval '1 day'
       )::date AS depois,
       l.descricao
FROM public.agencia_fin_folha f
JOIN public.agencia_fin_lancamentos l ON l.id = f.vale_lancamento_id
LEFT JOIN public.agencia_fin_contratos c ON c.profile_id = f.profile_id AND c.ativo IS NOT FALSE
WHERE f.vale_status = 'previsto'
  AND l.status = 'previsto'
  AND l.origem = 'folha'
  AND l.descricao LIKE 'Vale —%'
  AND l.data_caixa IS DISTINCT FROM (
    (date_trunc('month', f.competencia::timestamp) + interval '1 month')::date
    + (LEAST(GREATEST(COALESCE(c.dia_vale, 5), 1), 28) - 1) * interval '1 day'
  )::date
ORDER BY f.competencia, l.descricao;
`;

console.log(APPLY ? 'Aplicando correção…' : 'Prévia (sem gravar):');
console.log(psql(previewSql));

if (!APPLY) {
  console.log('\nNenhuma linha alterada. Rode com --apply para gravar.');
  process.exit(0);
}

const updateSql = `
UPDATE public.agencia_fin_lancamentos l
SET data_caixa = sub.novo
FROM (
  SELECT l.id AS lanc_id,
         (
           (date_trunc('month', f.competencia::timestamp) + interval '1 month')::date
           + (LEAST(GREATEST(COALESCE(c.dia_vale, 5), 1), 28) - 1) * interval '1 day'
         )::date AS novo
  FROM public.agencia_fin_folha f
  JOIN public.agencia_fin_lancamentos l ON l.id = f.vale_lancamento_id
  LEFT JOIN public.agencia_fin_contratos c ON c.profile_id = f.profile_id AND c.ativo IS NOT FALSE
  WHERE f.vale_status = 'previsto'
    AND l.status = 'previsto'
    AND l.origem = 'folha'
    AND l.descricao LIKE 'Vale —%'
) sub
WHERE l.id = sub.lanc_id
  AND l.data_caixa IS DISTINCT FROM sub.novo;
`;

console.log(psql(updateSql));
console.log('Concluído.');
