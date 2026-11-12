import React, { useEffect, useRef, useState } from 'react';
import { CalendarClock, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { Switch } from '@/components/ui/switch';
import GestorIaDrawer from './GestorIaDrawer';
import { date, readingTime } from './GestorIaContext';
import { goalAccountId } from './gestorIaMediaGoalData';
import { GESTOR_AGENDA_AI_ENABLED, loadAgendaAiStatus } from './gestorIaAgendaAiData';

const days = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const fullDays = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];
const categories = [
  ['escala', 'Oportunidade de escala', 'Custo abaixo da meta com volume medido.'],
  ['criativo', 'Fadiga de criativo', 'Frequência diária alta e queda no CTR de link.'],
  ['custo', 'Custo por resultado subindo', 'Compara dois recortes de três dias.'],
  ['verba', 'Ritmo da verba', 'Acompanha risco de excesso ou sobra na meta geral da conta.'],
];
const defaults = { enabled: false, run_time: '06:30', weekdays: [1, 3, 5], categories: categories.map(([key]) => key) };
const stateLabels = { no_data: 'Histórico recente insuficiente', no_signals: 'Nenhum aviso nas medidas disponíveis', unchanged: 'Avisos já registrados' };
const aiLabels = { queued: 'Na fila', reserved: 'Em análise', empty: 'Análise concluída sem novas sugestões', failed: 'Análise indisponível',
  limited: 'Teto diário atingido', account_used: 'Análise do dia já usada nesta conta', superseded: 'A leitura ou a autorização mudou' };
const columns = 'id,client_id,account_id,enabled,run_time,weekdays,categories,revision,last_day,last_run_at,last_state,last_count';

function ScheduleFields({ clientId, accountId, record, onSaved }) {
  const [draft, setDraft] = useState(() => record ? { ...record, run_time: record.run_time.slice(0, 5) } : defaults);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = useRef(false);
  const labelId = React.useId();
  const patch = (field, value) => setDraft((current) => ({ ...current, [field]: value }));
  const toggle = (field, item) => setDraft((current) => ({ ...current, [field]: current[field].includes(item)
    ? current[field].filter((value) => value !== item) : [...current[field], item].sort() }));

  async function submit(event) {
    event.preventDefault();
    if (!draft.weekdays.length || !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.run_time) || locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      const { data, error: problem } = await supabase.rpc('gestor_ia_configurar_agenda', {
        p_client_id: clientId, p_account_id: goalAccountId(accountId), p_enabled: draft.enabled, p_run_time: draft.run_time,
        p_weekdays: draft.weekdays, p_categories: draft.categories, p_revision: record?.revision ?? null,
      });
      if (problem?.code === '40001') throw new Error('A agenda mudou em outra tela. Reabra e confira.');
      if (problem || data?.client_id !== clientId || data.account_id !== goalAccountId(accountId)) throw new Error('Não foi possível salvar a agenda.');
      onSaved(data);
    } catch (failure) { setError(failure.message); }
    finally { locked.current = false; setBusy(false); }
  }

  return <form className="gia-stack gia-decision-form gia-agenda-form" onSubmit={submit}>
    <div className="gia-agenda-switch"><div><label htmlFor={labelId}>Ativar leitura programada</label><p className="gia-caption">Gera avisos no quadro para revisão.</p></div>
      <Switch id={labelId} checked={draft.enabled} disabled={busy} onCheckedChange={(value) => patch('enabled', value)} /></div>
    <div className="gia-agenda-schedule">
      <label>Horário de Brasília<input type="time" required value={draft.run_time} disabled={busy} onChange={(event) => patch('run_time', event.target.value)} /></label>
      <fieldset disabled={busy}><legend>Dias dos avisos adicionais</legend><div className="gia-agenda-days">
        {days.map((day, index) => <button key={day} className="gia-action-link" type="button" aria-label={fullDays[index]} aria-pressed={draft.weekdays.includes(index + 1)}
          onClick={() => toggle('weekdays', index + 1)}>{day}</button>)}
      </div></fieldset>
    </div>
    <fieldset className="gia-agenda-categories" disabled={busy}>
      <legend>Tipos de aviso</legend>
      <label><input type="checkbox" checked disabled /><span><strong>Gasto sem resultado e candidatas a corte</strong><small>Verificados diariamente enquanto a agenda estiver ativa.</small></span></label>
      {categories.map(([key, title, description]) => <label key={key}>
        <input type="checkbox" checked={draft.categories.includes(key)} onChange={() => toggle('categories', key)} />
        <span><strong>{title}</strong><small>{description}</small></span>
      </label>)}
    </fieldset>
    {GESTOR_AGENDA_AI_ENABLED && <><label className="gia-agenda-ai"><input type="checkbox" checked={draft.categories.includes('ia')} disabled={busy}
      onChange={() => toggle('categories', 'ia')} /><span><strong>Preparar planos com IA</strong>
      <small>Usa os novos avisos para sugerir o que conferir.</small></span></label>
      <label className="gia-agenda-ai"><input type="checkbox" checked={draft.categories.includes('descoberta')} disabled={busy}
        onChange={() => toggle('categories', 'descoberta')} /><span><strong>Buscar oportunidades com IA</strong>
        <small>Usa os dados salvos para sugerir revisões de volume, custo, escala, criativo e verba conforme os tipos escolhidos.</small></span></label>
      <p className="gia-caption">Nos dias escolhidos, as duas opções compartilham uma análise por conta. A OpenAI recebe métricas salvas e trechos autorizados na Memória.</p></>}
    {error && <p className="gia-notice" role="alert">{error}</p>}
    {!draft.weekdays.length && <p className="gia-caption" role="status">Escolha ao menos um dia.</p>}
    <div className="gia-header-actions"><button type="submit" className="gia-action-link gia-primary-action" disabled={busy || !draft.weekdays.length || !draft.run_time}>
      {busy ? 'Salvando…' : 'Salvar agenda'}</button></div>
  </form>;
}

function AgendaAccount({ clientId, accountId }) {
  const [reading, setReading] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const agendaId = reading?.record?.id;
  const revision = reading?.record?.revision;
  const showAi = GESTOR_AGENDA_AI_ENABLED && agendaId && reading.record.categories.some((key) => key === 'ia' || key === 'descoberta');
  useEffect(() => {
    let active = true;
    supabase.from('gestor_ia_agendas').select(columns).eq('client_id', clientId).eq('account_id', goalAccountId(accountId)).maybeSingle()
      .then(({ data, error }) => { if (active) setReading(error ? { error: true } : { record: data }); },
        () => { if (active) setReading({ error: true }); });
    return () => { active = false; };
  }, [clientId, accountId, attempt]);
  useEffect(() => {
    if (!showAi) return undefined;
    let active = true;
    loadAgendaAiStatus(supabase, agendaId).then((result) => { if (active) setAnalysis({ result }); })
      .catch(() => { if (active) setAnalysis({ error: true }); });
    return () => { active = false; };
  }, [agendaId, revision, showAi]);

  if (!reading) return <p className="gia-caption" role="status">Consultando agenda…</p>;
  if (reading.error) return <div><p className="gia-notice" role="alert">Não foi possível consultar a agenda.</p>
    <button type="button" className="gia-action-link" onClick={() => { setReading(null); setAttempt((value) => value + 1); }}>Tentar novamente</button></div>;
  const { record } = reading;
  const last = record?.last_run_at && readingTime(record.last_run_at);
  const description = record?.last_state === 'published' ? `${record.last_count} ${record.last_count === 1 ? 'aviso novo' : 'avisos novos'}` : stateLabels[record?.last_state];
  const ai = analysis?.result;
  const aiDescription = analysis?.error ? 'Consulta indisponível' : ai?.state === 'ready'
    ? `${ai.discoveries} ${ai.discoveries === 1 ? 'descoberta' : 'descobertas'} · ${ai.plans} ${ai.plans === 1 ? 'plano' : 'planos'} em avisos`
    : ai ? aiLabels[ai.state] : analysis ? 'Aguardando a primeira análise' : 'Consultando…';
  return <>
    <div className="gia-agenda-status"><CalendarClock aria-hidden="true" />
      <div><strong>{last ? `Última leitura em ${last}` : 'Aguardando a primeira leitura'}</strong>{description && <p className="gia-caption">{description}</p>}</div></div>
    {showAi && <div className="gia-agenda-status"><Sparkles aria-hidden="true" /><div><strong>{ai?.day ? `Análise da IA em ${date(ai.day)}` : 'Análise da IA'}</strong>
      <p className="gia-caption" role="status">{aiDescription}</p></div></div>}
    {notice && <p className="gia-caption" role="status">{notice}</p>}
    <ScheduleFields key={record?.revision ?? 0} record={record} clientId={clientId} accountId={accountId} onSaved={(saved) => {
      setReading({ record: saved });
      setNotice(saved.enabled ? 'Agenda salva.' : 'Agenda pausada.');
    }} />
  </>;
}

export default function GestorIaDecisionAgenda({ clients, initialId, close }) {
  const [id, setId] = useState(initialId || (clients.length === 1 ? clients[0].id : ''));
  const [selectedAccount, setSelectedAccount] = useState('');
  const accounts = clients.find((item) => item.id === id)?.metaAccounts || [];
  const accountId = selectedAccount || (accounts.length === 1 ? accounts[0].meta_account_id : '');
  return <GestorIaDrawer label="Decisões" title="Agenda de decisões" close={close}>
    <p className="gia-caption">A leitura usa o histórico salvo da Meta. Os avisos entram em Esperando decisão.</p>
    <div className="gia-agenda-scope gia-decision-form">
      <label>Cliente<select value={id} onChange={(event) => { setId(event.target.value); setSelectedAccount(''); }}>
        <option value="">Selecionar cliente</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.empresa}</option>)}
      </select></label>
      <label>Conta Meta<select value={accountId} disabled={!accounts.length} onChange={(event) => setSelectedAccount(event.target.value)}>
        <option value="">Selecionar conta</option>{accounts.map(({ meta_account_id, meta_account_name }) => <option key={meta_account_id} value={meta_account_id}>{meta_account_name || meta_account_id}</option>)}
      </select></label>
    </div>
    {accountId && <AgendaAccount key={`${id}:${accountId}`} clientId={id} accountId={accountId} />}
  </GestorIaDrawer>;
}
