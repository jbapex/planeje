import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, Plus, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { newTaskHref } from '@/components/traffic/operacao/TrafegoOperacaoBits';
import { buildGestorAtlasDraft, GESTOR_ATLAS_CONVERSATION } from '@/lib/gestorIaAtlasDraft';
import { date, periodLabel, readingTime } from './GestorIaContext';
import { formatMetric } from './gestorIaMetricModel';
import GestorIaDrawer from './GestorIaDrawer';
import { clientPage } from './gestorIaClientModel';
import { prepareGestorDecisionAnalysis } from './gestorIaData';
import { goalAccountId } from './gestorIaMediaGoalData';
import { useGestorAtlasContext } from './useGestorAtlas';
import { loadDecisionMemoryChoices } from './gestorIaMemoryData';
import { MAX_DECISION_MEMORIES } from '../../../supabase/functions/gestor-ia-decisions/memory.js';

export const decisionKind = { desperdicio: 'Desperdício', custo: 'Custo', medicao: 'Medição', oportunidade: 'Oportunidade', corte: 'Corte', criativo: 'Criativo',
  entrega: 'Volume', escala: 'Escala', verba: 'Orçamento' };
const evidenceLabel = { spend: 'Investimento', leads: 'Leads', messages: 'Conversas', purchases: 'Compras na Meta', impressions: 'Impressões', clicks: 'Cliques',
  landingPageViews: 'Visitas à página', postEngagements: 'Interações', cost: 'Custo por resultado', target: 'Custo alvo' };
const monetary = new Set(['spend', 'cost', 'target']);
const previewMetrics = ['spend', 'leads', 'messages', 'purchases', 'landingPageViews', 'postEngagements', 'cost', 'target'];

export function DecisionAnalysisPicker({ clients, initialId, initialAccountId, initialMemoryId, onAnalyze, close, readStore }) {
  const { profile } = useAuth();
  const [id, setId] = useState(initialId || '');
  const [choice, setChoice] = useState(initialAccountId || '');
  const [checked, setChecked] = useState(null);
  const [memoryOpen, setMemoryOpen] = useState(Boolean(initialMemoryId));
  const [memory, setMemory] = useState(null);
  const [selected, setSelected] = useState(initialMemoryId ? [initialMemoryId] : []);
  const client = clients.find((item) => item.id === id);
  const accounts = client?.metaAccounts || [];
  const linked = accounts.length > 0;
  const detailed = ['admin', 'superadmin'].includes(profile?.role);
  const account = detailed ? (accounts.length === 1 ? accounts[0] : accounts.find(({ meta_account_id }) => meta_account_id === choice)) : null;
  const accountId = account?.meta_account_id;
  const ownerId = useGestorAtlasContext(linked ? id : null, readStore)?.ownerId;
  const memoryIds = ownerId && memoryOpen && memory?.notes ? selected.filter((id) => memory.notes.some((note) => note.id === id)) : [];
  const memoryMissing = memoryOpen && memory?.notes && memoryIds.length !== selected.length;
  const contextKey = JSON.stringify([id, accountId, memoryIds]);
  const context = linked && checked?.key === contextKey ? checked : null;
  const ready = context?.data;
  useEffect(() => {
    if (!memoryOpen || !ownerId || (detailed && !accountId)) return;
    let active = true;
    loadDecisionMemoryChoices(supabase, { clientId: id, ownerId, accountId }).then((notes) => {
      if (active) setMemory({ notes });
    }).catch(() => {
      if (active) setMemory({ error: true });
    });
    return () => { active = false; };
  }, [memoryOpen, id, ownerId, accountId, detailed]);

  function openMemory(open) {
    setChecked(null);
    setMemoryOpen(open);
    setSelected([]);
    setMemory(null);
  }

  async function prepare() {
    const request = { key: contextKey, pending: true };
    setChecked(request);
    try {
      const data = await prepareGestorDecisionAnalysis(supabase, id, memoryIds, accountId);
      setChecked((current) => current === request ? { key: contextKey, data } : current);
    } catch (error) {
      setChecked((current) => current === request ? { key: contextKey, error } : current);
    }
  }

  return <GestorIaDrawer label="Decisões" title="Analisar com IA" close={close}>
    {clients.length > 1 && <label className="gia-stack"><span>Cliente para análise</span>
      <select className="gia-toolbar-select" aria-label="Cliente para análise" value={id} onChange={(event) => { setId(event.target.value); setChoice(''); openMemory(false); }}>
        <option value="" disabled>Selecionar cliente</option>
        {clients.map((item) => <option key={item.id} value={item.id}>{item.empresa}</option>)}
      </select></label>}
    {client && <div className="gia-panel"><h3>{client.empresa}</h3>
      {!linked ? <p className="gia-caption">Nenhuma conta Meta disponível para análise.</p>
        : !detailed ? <p className="gia-caption">A análise usa o resumo salvo do cliente.</p>
          : accounts.length === 1 && <p className="gia-caption">{account.meta_account_name || accountId}</p>}
    </div>}
    {detailed && accounts.length > 1 && <label className="gia-stack">Conta para análise
      <select className="gia-toolbar-select" value={accountId || ''} onChange={(event) => {
        setChoice(event.target.value); setMemory(null); setSelected([]); setChecked(null);
      }}>
        <option value="" disabled>Selecionar conta Meta</option>
        {accounts.map(({ meta_account_id, meta_account_name }) => <option key={meta_account_id} value={meta_account_id}>{meta_account_name || meta_account_id}</option>)}
      </select></label>}
    {ownerId && <div className="gia-stack gia-decision-memory-choice">
      <button className="gia-action-link" type="button" aria-expanded={memoryOpen} onClick={() => openMemory(!memoryOpen)}>
        {memoryOpen ? 'Retirar aprendizados da análise' : 'Incluir aprendizados da Memória'}</button>
      {memoryOpen && <fieldset>
        <legend>Aprendizados confirmados</legend>
        <p className="gia-caption">Escolha até {MAX_DECISION_MEMORIES} trechos para enviar à OpenAI junto com as métricas salvas.</p>
        {memoryMissing && <p className="gia-caption" role="alert">A versão indicada está indisponível neste recorte. Retire a seleção para continuar.</p>}
        {detailed && !accountId ? <p className="gia-caption">Selecione uma conta para consultar os aprendizados.</p>
          : !memory ? <p className="gia-caption" role="status">Consultando a Memória do cliente…</p>
          : memory.error ? <p className="gia-caption" role="alert">Não foi possível consultar as anotações.</p>
            : memory.notes.length === 0 ? <p className="gia-caption">Nenhuma anotação confirmada para este cliente.</p>
              : <div className="gia-decision-memory-list">{memory.notes.map((note) => <label key={note.id}>
                <input type="checkbox" checked={selected.includes(note.id)} disabled={selected.length >= MAX_DECISION_MEMORIES && !selected.includes(note.id)}
                  onChange={(event) => {
                    setSelected(event.target.checked ? [...selected, note.id] : selected.filter((id) => id !== note.id));
                    setChecked(null);
                  }} />
                <span>{note.excerpt}<small>{note.source?.accountId ? 'Desta conta · ' : ''}Confirmada em {date(note.confirmedAt)}</small></span>
              </label>)}</div>}
      </fieldset>}
    </div>}
    {!ownerId && memoryOpen && selected.length > 0 && <button className="gia-action-link" type="button" onClick={() => openMemory(false)}>Continuar sem anotação</button>}
    {context?.error && <div className="gia-notice" role="alert">{context.error.message}
      {context.error.code === 'NO_ACCOUNT_DATA' && accountId && <Link className="gia-row-link"
        to={{ ...clientPage(id, '', 'contas'), search: new URLSearchParams({ tab: 'contas', conta: accountId }).toString() }}>Contas e BM</Link>}</div>}
    {context?.pending && <p className="gia-caption" role="status">Conferindo a leitura e a disponibilidade do piloto…</p>}
    {ready && <section className="gia-panel gia-decision-context" aria-label="Contexto da análise" role="status">
      <h3><Check aria-hidden="true" />Contexto conferido</h3>
      <p>{ready.source === 'account' ? 'Histórico salvo da conta' : 'Resumo salvo do cliente'} · {periodLabel(ready.period)}</p>
      <small className="gia-caption">Leitura de {readingTime(ready.syncedAt)} · {ready.campaignCount} {ready.campaignCount === 1 ? 'campanha' : 'campanhas'}
        {ready.targetCount > 0 && ` · ${ready.targetCount} ${ready.targetCount === 1 ? 'custo com alvo' : 'custos com alvo'}`}
        {' · '}{ready.memoryIncluded} {ready.memoryIncluded === 1 ? 'trecho da Memória' : 'trechos da Memória'}</small>
      <dl className="gia-context-grid">
        {previewMetrics.filter((key) => Object.hasOwn(ready.metrics, key)).map((key) => <div key={key}><dt>{evidenceLabel[key]}</dt>
          <dd>{formatMetric(ready.metrics[key], monetary.has(key) ? { unit: 'money' } : null, ready.currency)}</dd></div>)}
      </dl>
    </section>}
    <div className="gia-header-actions">
      {ready ? <button className="gia-action-link gia-primary-action" type="button"
        onClick={() => void onAnalyze(client, memoryIds, { accountId, context: ready.context })}><Sparkles aria-hidden="true" />Gerar sugestões</button>
        : <button className="gia-action-link gia-primary-action" type="button"
          disabled={!linked || (detailed && !accountId) || context?.pending || (memoryOpen && selected.length !== memoryIds.length)}
          onClick={() => void prepare()}>Conferir contexto</button>}
      {ready && <small className="gia-caption">Gerar sugestões usa a tentativa do piloto.</small>}
    </div>
  </GestorIaDrawer>;
}

export function DecisionMemoryEvidence({ references, clientId }) {
  const [params] = useSearchParams();
  if (!Array.isArray(references) || !references.length) return null;
  return <section className="gia-panel">
    <h3>Aprendizados considerados</h3>
    <p className="gia-caption">{references.length} {references.length === 1 ? 'anotação confirmada' : 'anotações confirmadas'}</p>
    <ul className="gia-memory-citations">{references.map(({ memoryId, confirmedAt, version }, index) => {
      if (!memoryId || !clientId) return <li key={index} className="gia-caption">{date(confirmedAt)}</li>;
      const path = clientPage(clientId, params, 'memoria');
      const query = new URLSearchParams(path.search);
      query.set('versao_memoria', memoryId);
      return <li key={index}><Link className="gia-action-link" aria-haspopup="dialog" to={{ ...path, search: query.toString() }}>
        Ver versão {version} · {date(confirmedAt)}</Link></li>;
    })}</ul>
  </section>;
}

export function DecisionAtlasLink({ clientId, decision, readStore, label = 'Montar plano de ação' }) {
  const { canViewField } = useAuth();
  const scope = useGestorAtlasContext(clientId, readStore);
  const state = scope && buildGestorAtlasDraft({ ...scope, purpose: 'decision', decision, canSeeSpend: canViewField?.('valor') === true });
  return state ? <Link className="gia-action-link" to={GESTOR_ATLAS_CONVERSATION} state={state}><Sparkles aria-hidden="true" />{label}</Link> : null;
}

export function DecisionAnalysisReading({ client, suggestion, analysis, close, dismiss, canUseTasks, readStore }) {
  const { profile } = useAuth();
  const account = client.metaAccounts?.find(({ meta_account_id }) => goalAccountId(meta_account_id) === suggestion.measurement?.accountId);
  const description = [
    `Plano sugerido pelo Gestor IA · ${periodLabel(analysis.period)}`,
    ...suggestion.steps.map((step, index) => `${index + 1}. ${step}`),
    `Em ${suggestion.days} dias após a ação: ${suggestion.verification}`,
  ].join('\n');
  const state = { gestorIa: true, backOnClose: true, draftOwnerId: profile?.id, draftClientId: client.id,
    draftDecision: { title: suggestion.title, description } };
  return <GestorIaDrawer label={`Sugestão da IA · ${decisionKind[suggestion.kind]}`} title={suggestion.title} close={close}>
    <p className="gia-caption">{[client.empresa, account && (account.meta_account_name || account.meta_account_id), suggestion.source].filter(Boolean).join(' · ')}</p>
    <section><h3>Por quê</h3><p>{suggestion.why}</p></section>
    <section className="gia-panel"><h3>O que a IA olhou</h3><p className="gia-caption">{periodLabel(analysis.period)} · Leitura de {date(analysis.syncedAt)}</p>
      <dl className="gia-context-grid">
        {suggestion.evidence.map(({ key, value }) => <div key={key}><dt>{evidenceLabel[key]}</dt><dd>{formatMetric(value, monetary.has(key) ? { unit: 'money' } : null, analysis.currency)}</dd></div>)}
      </dl>
      {!analysis.currency && suggestion.evidence.some(({ key }) => monetary.has(key)) && <p className="gia-caption">Moeda indisponível na leitura.</p>}
    </section>
    <DecisionMemoryEvidence references={suggestion.memoryEvidence} clientId={client.id} />
    <section><h3>Plano de ação</h3><ol className="gia-decision-steps">{suggestion.steps.map((step, index) => <li key={index}>{step}</li>)}</ol></section>
    <section><h3>Como verificar</h3><p>Em {suggestion.days} dias após a ação: {suggestion.verification}</p></section>
    <div className="gia-header-actions">
      {canUseTasks && <Link className="gia-action-link gia-primary-action" to={newTaskHref(client.id)} state={state}><Plus aria-hidden="true" />Preparar tarefa</Link>}
      <DecisionAtlasLink clientId={client.id} readStore={readStore} decision={{ title: suggestion.title, source: suggestion.source, detail: suggestion.why, period: analysis.period }} />
      <button type="button" className="gia-action-link" onClick={dismiss}>Dispensar nesta leitura</button>
    </div>
  </GestorIaDrawer>;
}
