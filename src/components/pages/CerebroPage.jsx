import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Brain, History, MessageSquare, Shield, Users } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import WorkspacePageHeader from '@/components/layout/WorkspacePageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { AGENTES_SEGUINTES, ESTADO_LABEL, formatStamp } from '@/lib/cerebroCore';
import {
  carregarBase,
  consultarCerebro,
  corrigirMemoria,
  enviarDecisaoParaCaixa,
  revogarMemoria,
  salvarMemoria,
  salvarPiloto,
} from '@/lib/cerebroApi';

const PERGUNTAS = [
  'O que precisa da minha decisão hoje?',
  'O que combinamos com este cliente que ainda não virou tarefa?',
  'Quem está bloqueado e qual é o próximo passo?',
  'O que falta para cumprir as entregas previstas do cliente?',
  'Por que você sugeriu essa ação e onde está a informação?',
];

function Estado({ valor }) {
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
      {ESTADO_LABEL[valor] || valor || 'Inativo'}
    </span>
  );
}

export default function CerebroPage() {
  const { user, profile } = useAuth();
  const [params] = useSearchParams();
  const missaoId = params.get('missao');
  const admin = profile?.role === 'admin' || profile?.role === 'superadmin';
  const [base, setBase] = useState(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [consultando, setConsultando] = useState(false);
  const [clienteId, setClienteId] = useState('');
  const [pergunta, setPergunta] = useState(PERGUNTAS[1]);
  const [nota, setNota] = useState('');
  const [resultado, setResultado] = useState(null);
  const [runId, setRunId] = useState(missaoId || '');
  const [pilotoIds, setPilotoIds] = useState([]);
  const [memoriaTexto, setMemoriaTexto] = useState('Reservar três dias úteis para aprovação deste cliente.');
  const [correcaoId, setCorrecaoId] = useState('');
  const [correcaoTexto, setCorrecaoTexto] = useState('');
  const [motivo, setMotivo] = useState('');

  const recarregar = useCallback(async () => {
    if (!user) return;
    setCarregando(true);
    setErro('');
    try {
      const dados = await carregarBase(user, profile);
      setBase(dados);
      setPilotoIds(dados.settings?.piloto_cliente_ids || []);
    } catch (error) {
      setErro(error.message || 'Não foi possível ler o Cérebro.');
    } finally {
      setCarregando(false);
    }
  }, [user, profile]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  const clienteNome = useMemo(() => {
    return base?.clientes?.find((cliente) => cliente.id === clienteId)?.empresa || '';
  }, [base, clienteId]);

  async function perguntar(event) {
    event?.preventDefault();
    if (!user || !pergunta.trim()) return;
    setConsultando(true);
    setErro('');
    try {
      const resposta = await consultarCerebro({
        user,
        profile,
        clienteId: clienteId || null,
        pergunta,
        nota,
        base,
      });
      setResultado(resposta);
      setRunId(resposta.runId || '');
      if (resposta.gravado) await recarregar();
    } catch (error) {
      setErro(error.message || 'A consulta não foi concluída.');
    } finally {
      setConsultando(false);
    }
  }

  async function gravarRegra(event) {
    event.preventDefault();
    if (!clienteId) {
      setErro('Escolha o cliente da regra.');
      return;
    }
    setErro('');
    try {
      const salvo = await salvarMemoria({
        user,
        profile,
        memorias: base?.memorias || [],
        draft: {
          tipo: 'regra',
          escopo: 'cliente',
          cliente_id: clienteId,
          chave: 'aprovacao_dias_uteis',
          resumo: memoriaTexto.trim(),
          conteudo: {
            dias: 3,
            calendario: 'segunda_a_sexta_sem_feriado',
            texto: memoriaTexto.trim(),
          },
          fonte: { tipo: 'instrucao', id: user.id, titulo: profile?.full_name || 'Usuário' },
          visibilidade: 'equipe',
          substituir: false,
        },
      });
      if (!salvo.ok) {
        setErro(salvo.erro);
        return;
      }
      await recarregar();
    } catch (error) {
      setErro(error.message || 'A regra não foi gravada.');
    }
  }

  async function aplicarCorrecao(event) {
    event.preventDefault();
    setErro('');
    try {
      const salvo = await corrigirMemoria({
        user,
        profile,
        memorias: base?.memorias || [],
        memoriaId: correcaoId,
        correcao: {
          motivo,
          resumo: correcaoTexto,
          conteudo: { texto: correcaoTexto, dias: Number(correcaoTexto.match(/\d+/)?.[0] || 3), calendario: 'segunda_a_sexta_sem_feriado' },
        },
      });
      if (!salvo.ok) {
        setErro(salvo.erro);
        return;
      }
      setCorrecaoId('');
      setMotivo('');
      await recarregar();
    } catch (error) {
      setErro(error.message || 'A correção não foi gravada.');
    }
  }

  async function gravarPiloto(ativo, incluirCliente) {
    const ids = !clienteId || incluirCliente == null
      ? pilotoIds
      : (incluirCliente ? [...new Set([...pilotoIds, clienteId])] : pilotoIds.filter((id) => id !== clienteId));
    setPilotoIds(ids);
    setErro('');
    try {
      const settings = await salvarPiloto({ user, ativo: Boolean(ativo), pilotoClienteIds: ids });
      setBase((atual) => (atual ? { ...atual, settings, agentes: (atual.agentes || []).map((agente) => ({ ...agente, ativo: Boolean(ativo) })) } : atual));
    } catch (error) {
      setErro(error.message || 'O piloto não foi alterado.');
    }
  }

  async function ligarPiloto(ativo) {
    await gravarPiloto(ativo, null);
  }

  const missao = resultado?.mission;
  const memoriasVigentes = (base?.memorias || []).filter((memoria) => memoria.estado === 'vigente');
  const ultimaDoAgente = (agenteId) => (base?.historico || []).find((run) => (run.agentes || []).includes(agenteId));

  return (
    <div className="mx-auto min-h-full max-w-6xl px-1">
      <WorkspacePageHeader
        className="mb-4"
        title="Cérebro IA"
        label="Piloto"
        description="Consulta e proposta. Tarefas e projetos continuam no Planeje."
        help="O coordenador chama só Clientes ou Operação, conforme a pergunta. A resposta traz a fonte, o horário da consulta e o próximo passo. Nada é criado na tarefa nesta versão."
      />

      {erro ? <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{erro}</p> : null}

      {!carregando && base && !base.disponivel ? (
        <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          A migração do Cérebro ainda não está aplicada. O piloto permanece desligado e nenhuma missão é gravada.
        </p>
      ) : null}

      {base?.disponivel ? (
        <Card className="mb-4 border-slate-200">
          <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-900">Ativação do piloto</p>
              <p className="text-xs text-slate-500">
                {base.settings?.ativo ? 'Ligado para os clientes marcados. Lista vazia não amplia sozinha.' : 'Desligado. Nenhuma missão roda.'}
              </p>
            </div>
            {admin ? (
              <Switch checked={Boolean(base.settings?.ativo)} onCheckedChange={ligarPiloto} aria-label="Ligar piloto do Cérebro" />
            ) : (
              <Estado valor={base.settings?.ativo ? 'concluido' : 'inativo'} />
            )}
          </CardContent>
        </Card>
      ) : null}

      <Tabs defaultValue="conversa">
        <TabsList className="mb-4 flex h-auto flex-wrap justify-start">
          <TabsTrigger value="conversa"><MessageSquare className="mr-1 h-4 w-4" />Conversa</TabsTrigger>
          <TabsTrigger value="agentes"><Users className="mr-1 h-4 w-4" />Agentes</TabsTrigger>
          <TabsTrigger value="memoria"><Brain className="mr-1 h-4 w-4" />Memória</TabsTrigger>
          <TabsTrigger value="historico"><History className="mr-1 h-4 w-4" />Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="conversa">
          <form onSubmit={perguntar} className="grid gap-3">
            <label className="grid gap-1 text-sm">
              Cliente
              <select
                className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={clienteId}
                onChange={(event) => setClienteId(event.target.value)}
              >
                <option value="">Escolher quando a pergunta for de um cliente</option>
                {(base?.clientes || []).map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>{cliente.empresa}</option>
                ))}
              </select>
            </label>
            {admin && base?.disponivel ? (
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={pilotoIds.includes(clienteId) && Boolean(clienteId)}
                  disabled={!clienteId}
                  onChange={(event) => { gravarPiloto(base.settings?.ativo, event.target.checked); }}
                />
                Incluir {clienteNome || 'este cliente'} no piloto
              </label>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {PERGUNTAS.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="rounded-full border border-slate-200 px-3 py-1 text-left text-xs text-slate-700 hover:bg-slate-50"
                  onClick={() => setPergunta(item)}
                >
                  {item}
                </button>
              ))}
            </div>
            <Textarea value={pergunta} onChange={(event) => setPergunta(event.target.value)} rows={3} />
            <label className="grid gap-1 text-sm">
              Nota de alinhamento
              <Textarea
                value={nota}
                onChange={(event) => setNota(event.target.value)}
                rows={5}
                placeholder={'Fonte opcional, uma linha por compromisso.\nAprovado: Vídeo depoimentos\nIdeia: Vídeo surpresa'}
              />
            </label>
            <Button type="submit" disabled={consultando || carregando}>
              {consultando ? 'Consultando registros…' : 'Consultar'}
            </Button>
          </form>

          {missao ? (
            <Card className="mt-4 border-slate-200">
              <CardContent className="grid gap-3 p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Estado valor={missao.estado} />
                  <span className="text-slate-500">{missao.agentes.join(', ') || 'nenhum agente'}</span>
                  <span className="text-slate-500">{missao.etapas} etapas</span>
                </div>
                <p className="leading-6 text-slate-800">{missao.resposta.informacao}</p>
                <p><strong>Consulta:</strong> {formatStamp(missao.resposta.consultadoEm)}</p>
                <p><strong>Próximo passo:</strong> {missao.resposta.proximoPasso}</p>
                {missao.instrucaoIgnorada ? <p>Uma instrução de permissão dentro da mensagem foi ignorada.</p> : null}
                {missao.efeitoAplicado ? null : <p className="text-slate-500">Nenhuma tarefa, comentário ou mensagem foi gravado por esta consulta.</p>}
                {(missao.resposta.fontes || []).length ? (
                  <ul className="grid gap-1">
                    {missao.resposta.fontes.map((fonte) => (
                      <li key={`${fonte.tipo}-${fonte.id}`} className="text-slate-600">
                        Fonte: {fonte.titulo} ({fonte.id}) {fonte.registradaEm ? `· ${formatStamp(fonte.registradaEm)}` : ''}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {(missao.resposta.pendencias || []).length ? (
                  <ul className="grid gap-1">
                    {missao.resposta.pendencias.map((item) => (
                      <li key={`${item.campo}-${item.motivo}`} className="rounded-lg bg-amber-50 px-2 py-1">
                        Pendente — {item.campo}: {item.motivo}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {(missao.propostas || []).map((proposta) => (
                  <div key={proposta.id} className="rounded-xl border border-slate-200 p-3">
                    <p className="font-medium">{proposta.argumentos?.titulo}</p>
                    <p className="text-slate-600">{proposta.justificativa}</p>
                    <p className="text-xs text-slate-500">Agente {proposta.executor_agente_id}. Autorizador ainda não definido.</p>
                    {admin && resultado?.runId ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-2"
                        onClick={async () => {
                          try {
                            await enviarDecisaoParaCaixa({
                              user,
                              profile,
                              proposta,
                              runId: resultado.runId,
                              ownerId: base?.settings?.decision_owner_id || user.id,
                            });
                            await recarregar();
                          } catch (error) {
                            setErro(error.message || 'O aviso não entrou na Minha caixa.');
                          }
                        }}
                      >
                        Enviar decisão para a Minha caixa
                      </Button>
                    ) : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="agentes">
          <ul className="grid gap-3">
            {(base?.agentes || []).map((agente) => {
              const ultima = ultimaDoAgente(agente.id);
              return (
                <li key={agente.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold capitalize">{agente.id}</h2>
                    <Estado valor={agente.ativo && base?.settings?.ativo ? (ultima?.estado || 'inativo') : 'inativo'} />
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{agente.funcao}</p>
                  <p className="mt-2 text-xs text-slate-500">Ferramentas: {(agente.ferramentas || []).join(', ')}. Instruções {agente.instrucoes_versao}. Nível {agente.nivel}.</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {ultima ? `Última missão em ${formatStamp(ultima.created_at)}: ${ultima.pergunta}` : 'Sem missão registrada.'}
                  </p>
                </li>
              );
            })}
            {AGENTES_SEGUINTES.map((agente) => (
              <li key={agente.id} className="rounded-2xl border border-dashed border-slate-200 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold capitalize">{agente.id}</h2>
                  <Estado valor="inativo" />
                </div>
                <p className="mt-1 text-sm text-slate-600">{agente.funcao} Entra na sequência. Não há execução.</p>
              </li>
            ))}
          </ul>
        </TabsContent>

        <TabsContent value="memoria">
          <form onSubmit={gravarRegra} className="mb-4 grid gap-2 rounded-2xl border border-slate-200 p-4">
            <p className="text-sm font-medium">Confirmar regra do cliente selecionado</p>
            <Input value={memoriaTexto} onChange={(event) => setMemoriaTexto(event.target.value)} />
            <Button type="submit" variant="outline" disabled={!base?.disponivel}>Confirmar regra</Button>
            <p className="text-xs text-slate-500">A confirmação grava a versão. Uma regra do cliente A não entra na consulta do cliente B.</p>
          </form>
          <ul className="grid gap-2">
            {memoriasVigentes.map((memoria) => (
              <li key={memoria.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                <p className="font-medium">{memoria.resumo}</p>
                <p className="text-xs text-slate-500">
                  {memoria.tipo} · {memoria.escopo} · versão {memoria.versao}
                  {memoria.cliente_id ? ` · cliente ${memoria.cliente_id}` : ''}
                </p>
                <button type="button" className="mt-2 text-xs text-slate-700 underline" onClick={() => { setCorrecaoId(memoria.id); setCorrecaoTexto(memoria.resumo); }}>
                  Corrigir
                </button>
                <button
                  type="button"
                  className="ml-3 mt-2 text-xs text-slate-700 underline"
                  onClick={async () => {
                    const texto = window.prompt('Motivo da revogação');
                    if (!texto) return;
                    try {
                      const salvo = await revogarMemoria({ user, profile, memorias: base.memorias, memoriaId: memoria.id, motivo: texto });
                      if (!salvo.ok) setErro(salvo.erro);
                      else await recarregar();
                    } catch (error) {
                      setErro(error.message || 'A memória não foi revogada.');
                    }
                  }}
                >
                  Revogar
                </button>
              </li>
            ))}
            {!memoriasVigentes.length ? <li className="text-sm text-slate-500">Nenhuma memória vigente nesta consulta.</li> : null}
          </ul>
          {correcaoId ? (
            <form onSubmit={aplicarCorrecao} className="mt-3 grid gap-2">
              <Input value={correcaoTexto} onChange={(event) => setCorrecaoTexto(event.target.value)} />
              <Input value={motivo} onChange={(event) => setMotivo(event.target.value)} placeholder="Motivo da correção" />
              <Button type="submit" variant="outline">Gravar correção</Button>
            </form>
          ) : null}
        </TabsContent>

        <TabsContent value="historico">
          <ul className="grid gap-2">
            {(base?.historico || []).map((run) => (
              <li key={run.id} className={`rounded-xl border p-3 text-sm ${run.id === (runId || missaoId) ? 'border-slate-900' : 'border-slate-200'}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <Estado valor={run.estado} />
                  <span className="text-xs text-slate-500">{formatStamp(run.created_at)}</span>
                </div>
                <p className="mt-1">{run.pergunta}</p>
                <p className="text-xs text-slate-500">{run.proximo_passo}</p>
                <p className="text-xs text-slate-500">Agentes: {(run.agentes || []).join(', ') || '—'}. Etapas: {run.etapas}.</p>
              </li>
            ))}
            {!base?.historico?.length ? <li className="text-sm text-slate-500">O histórico aparece depois da primeira consulta gravada.</li> : null}
          </ul>
        </TabsContent>
      </Tabs>
      <p className="mt-6 flex items-center gap-2 text-xs text-slate-400">
        <Shield className="h-3.5 w-3.5" />
        Credencial de modelo permanece no servidor. Esta entrega não chama o modelo para decidir prazo ou responsável.
      </p>
    </div>
  );
}
