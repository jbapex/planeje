import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Check, Clock3, HelpCircle, RefreshCw, ShieldCheck, Sparkles, X } from 'lucide-react';
import { CrmIaField } from './CrmIaPrimitives';
import { crmIaConciergeRules } from '../../../supabase/functions/_shared/crmIaConcierge';
import './CrmIaConcierge.css';

const OPERATIONS = [['appointment_confirm', 'Permitir confirmação de presença'], ['appointment_reschedule', 'Permitir remarcação'], ['appointment_cancel', 'Permitir cancelamento']];
const initialDraft = config => {
  const saved = config.data.concierge || {}, rules = crmIaConciergeRules(saved);
  const { calendar: _calendar, ...flags } = rules;
  return { no_show_delay_minutes: 60, no_show_expire_hours: 168, ...saved, ...flags, handoff_phrases: Array.isArray(saved.handoff_phrases) ? saved.handoff_phrases : [] };
};
function Toggle({ label, checked, onChange, children }) {
  return <div className="crm-ia-concierge-toggle"><CrmIaField label={label} type="checkbox" role="switch" aria-checked={checked} value={checked} onChange={onChange} />{children && <p>{children}</p>}</div>;
}

export default function CrmIaConcierge({ workspace, mutate, canManage, active }) {
  const [source, setSource] = useState(() => workspace.config);
  const [draft, setDraft] = useState(() => initialDraft(workspace.config));
  const [phrase, setPhrase] = useState(''), [pending, setPending] = useState(false), [error, setError] = useState('');
  const [saved, setSaved] = useState(false), [discarding, setDiscarding] = useState(false);
  const busy = useRef(false), permission = useRef(canManage), account = useRef(workspace.client.id), mounted = useRef(true);
  const confirmed = useRef(new Set([workspace.config.revision]));
  const identity = workspace.client.id;
  permission.current = canManage;account.current = identity;
  useEffect(() => { mounted.current = true;return () => { mounted.current = false; }; }, []);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initialDraft(source));
  const sourceChanged = !confirmed.current.has(workspace.config.revision);
  const rules = crmIaConciergeRules(draft), calendarCount = OPERATIONS.filter(([key]) => rules[key]).length;
  const capabilities = Number(rules.faq_enabled) + Number(rules.calendar) + Number(rules.no_show_recovery);
  const defaultBase = workspace.config.data.knowledge?.concierge_base_id;
  const effectiveBase = workspace.bases.find(base => base.id === (draft.base_id || defaultBase));
  function change(key, value) {
    if (!permission.current || busy.current) return;
    setDraft(previous => ({ ...previous, [key]: value }));setSaved(false);
  }
  function addPhrase() {
    if (!permission.current || busy.current || !phrase.trim()) return;
    if (phrase.trim().length < 3) { setError('Use pelo menos três caracteres na frase de repasse.');return; }
    change('handoff_phrases', [...new Set([...draft.handoff_phrases, phrase.trim()])]);setPhrase('');
  }
  function reload() {
    if (busy.current) return;
    const next = sourceChanged ? workspace.config : source;
    confirmed.current.add(next.revision);setSource(next);setDraft(initialDraft(next));setPhrase('');setError('');setSaved(false);setDiscarding(false);
  }
  async function save(event) {
    event.preventDefault();
    if (busy.current || !permission.current || !dirty) return;
    busy.current = true;setPending(true);setError('');setSaved(false);
    try {
      if (rules.faq_enabled && !effectiveBase) throw Error('Vincule uma base de conhecimento ou desligue as dúvidas frequentes para continuar.');
      if (!rules.mode || rules.human_wait_minutes === null) throw Error('Confira o modo de atuação e a espera após atendimento humano.');
      for (const [key, min, max] of [['no_show_delay_minutes', 0, 10080], ['no_show_expire_hours', 1, 720]]) {
        if (!Number.isInteger(draft[key]) || draft[key] < min || draft[key] > max) throw Error(`Confira o prazo de recuperação: informe um valor entre ${min} e ${max}.`);
      }
      const result = await mutate('save_config', { section: 'concierge', data: draft, revision: source.revision });
      if (!mounted.current || account.current !== identity) return;
      if (!result?.revision || !result.data?.concierge) throw Error('Não foi possível conferir o recibo. Recarregue a configuração antes de salvar novamente.');
      confirmed.current.add(result.revision);setSource(result);setDraft(initialDraft(result));setSaved(true);
    } catch (failure) { if (mounted.current && account.current === identity) setError(failure.message || 'Não foi possível salvar. Seu rascunho continua aqui.'); }
    finally { busy.current = false;if (mounted.current && account.current === identity) setPending(false); }
  }
  return <section className="crm-ia-concierge" hidden={!active}>
    <header className="crm-ia-concierge-heading"><span className="crm-ia-concierge-mark"><Sparkles size={21} aria-hidden="true" /></span><div><h2>Seu atendimento continua, mesmo entre os turnos</h2><p>O Concierge cuida das dúvidas e dos compromissos quando os agentes precisam de apoio.</p></div><span className="crm-ia-badge">{rules.enabled ? 'Autorizado' : 'Desligado'}</span></header>
    <form className="crm-ia-concierge-form" onSubmit={save}>
      <fieldset disabled={pending || !canManage}>
        <div className="crm-ia-concierge-layout"><div className="crm-ia-concierge-main">
          <section className="crm-ia-card crm-ia-concierge-activation"><Toggle label="Autorizar Concierge" checked={rules.enabled} onChange={value => change('enabled', value)}>Complemente os agentes disponíveis no mesmo funil, respeitando a pausa humana.</Toggle>{workspace.config.data.attendance?.auto_send !== true && <small>O atendimento automático desta conta está desligado.</small>}</section>
          <section className="crm-ia-card crm-ia-concierge-capabilities"><header><div><h3>Como ele pode ajudar</h3><p>Escolha as capacidades para este atendimento.</p></div><span>{capabilities} de 3</span></header>
            <article><HelpCircle size={19} aria-hidden="true" /><div><Toggle label="Responder dúvidas frequentes" checked={rules.faq_enabled} onChange={value => change('faq_enabled', value)}>Respostas apoiadas somente na base de conhecimento do Concierge.</Toggle><CrmIaField label="Base do Concierge" value={draft.base_id || ''} onChange={value => change('base_id', value || null)} options={[{ value: '', label: defaultBase ? `Padrão: ${workspace.bases.find(base => base.id === defaultBase)?.nome || 'base indisponível'}` : 'Usar o padrão da conta' }, ...workspace.bases]} />
              <p className={!effectiveBase && rules.faq_enabled ? 'crm-ia-error' : 'crm-ia-muted'}>{effectiveBase ? `Conhecimento: ${effectiveBase.nome}` : 'Vincule uma base de conhecimento para responder dúvidas.'} <Link to={`/crm-ia/configuracoes?cliente=${encodeURIComponent(identity)}&aba=knowledge`}>Ver vínculos</Link></p></div></article>
            <article><CalendarDays size={19} aria-hidden="true" /><div><Toggle label="Cuidar da agenda" checked={rules.calendar} onChange={value => {
              if (!permission.current || busy.current) return;
              setDraft(previous => ({ ...previous, ...Object.fromEntries(OPERATIONS.map(([key]) => [key, value])) }));setSaved(false);
            }}>Confirme presença, remarque ou cancele compromissos existentes.</Toggle>
              <details className="crm-ia-concierge-details"><summary>{calendarCount === 1 || calendarCount === 2 ? `Parcial · ${calendarCount} de 3 operações` : 'Escolher operações da agenda'}</summary>{OPERATIONS.map(([key, label]) => <CrmIaField key={key} label={label} type="checkbox" value={rules[key]} onChange={value => change(key, value)} />)}<p>Uma alteração exige confirmação explícita do contato e, com Google Agenda, o recibo de sincronização.</p></details></div></article>
            <article><RefreshCw size={19} aria-hidden="true" /><div><Toggle label="Recuperar não comparecimento" checked={rules.no_show_recovery} onChange={value => change('no_show_recovery', value)}>Retome uma vez após a equipe registrar a ausência.</Toggle><details className="crm-ia-concierge-details"><summary>Prazos da recuperação</summary><CrmIaField label="Atraso após marcar ausência, em minutos" type="number" min={0} max={10080} value={draft.no_show_delay_minutes} onChange={value => change('no_show_delay_minutes', value === '' ? '' : Number(value))} /><CrmIaField label="Prazo da recuperação, em horas" type="number" min={1} max={720} value={draft.no_show_expire_hours} onChange={value => change('no_show_expire_hours', value === '' ? '' : Number(value))} /><p>A equipe marca a ausência após o término. Silêncio não registra não comparecimento.</p></details></div></article>
          </section>
          <section className="crm-ia-card crm-ia-concierge-handoff"><Toggle label="Permitir repasse humano" checked={rules.handoff_enabled} onChange={value => change('handoff_enabled', value)}>Encaminhe o atendimento quando a pessoa pedir ajuda da equipe.</Toggle><div className="crm-ia-concierge-phrases" aria-label="Frases de repasse">{draft.handoff_phrases.map(item => <span key={item}>{item}<button type="button" aria-label={`Remover frase ${item}`} onClick={() => change('handoff_phrases', draft.handoff_phrases.filter(value => value !== item))}><X size={13} aria-hidden="true" /></button></span>)}</div>
            <div className="crm-ia-concierge-add-phrase"><CrmIaField label="Nova frase de repasse" value={phrase} maxLength={100} onChange={value => { if (permission.current && !busy.current) setPhrase(value); }} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent?.isComposing) { event.preventDefault();addPhrase(); } }} /><button type="button" disabled={!phrase.trim()} onClick={addPhrase}>Adicionar frase</button></div><CrmIaField label="Mensagem de repasse" type="textarea" maxLength={300} value={draft.handoff_message || ''} placeholder="Vou encaminhar seu atendimento para a equipe." onChange={value => change('handoff_message', value)} /></section>
        </div><aside className="crm-ia-concierge-aside">
          <section className="crm-ia-card"><h3><Clock3 size={17} aria-hidden="true" />Disponibilidade</h3><CrmIaField label="Quando atuar" value={rules.mode || ''} onChange={value => change('mode', value)} options={[...(!rules.mode ? [{ value: '', label: 'Escolha quando atuar' }] : []), { value: 'outside_hours', label: 'Fora do horário da equipe' }, { value: 'always', label: 'Sempre' }]} /><CrmIaField label="Espera depois de atendimento humano, em minutos" type="number" min={0} max={10080} value={draft.human_wait_minutes ?? ''} onChange={value => change('human_wait_minutes', value === '' ? '' : Number(value))} /><p>Um agente regular disponível tem prioridade. O horário da equipe vem da Agenda.</p><Link to={`/crm-ia/agenda?cliente=${encodeURIComponent(identity)}`}>Conferir horários da equipe</Link></section>
          <section className="crm-ia-card"><h3><Sparkles size={17} aria-hidden="true" />Jeito de atender</h3><CrmIaField label="Instruções extras" type="textarea" maxLength={500} value={draft.instructions || ''} onChange={value => change('instructions', value)} /><small>{(draft.instructions || '').length}/500 caracteres</small></section>
          <p className="crm-ia-concierge-safety"><ShieldCheck size={17} aria-hidden="true" />O Concierge respeita a pausa humana e as permissões de cada conversa.</p>
        </aside></div>
      </fieldset>
      {sourceChanged && <p className="crm-ia-error" role="status">A configuração mudou em outra sessão. Seu rascunho foi preservado. {!dirty && <button type="button" disabled={pending} onClick={reload}>Recarregar configuração</button>}</p>}
      {error && <p className="crm-ia-error" role="alert">{error}</p>}
      {discarding && <div className="crm-ia-concierge-discard" role="group" aria-label="Confirmar descarte"><p>Descartar as alterações deste Concierge?</p><button type="button" disabled={pending} onClick={() => setDiscarding(false)}>Continuar editando</button><button type="button" disabled={pending} onClick={reload}>Descartar e recarregar</button></div>}
      <footer className="crm-ia-concierge-footer"><span role="status">{saved ? <><Check size={15} aria-hidden="true" />Salvo</> : dirty ? 'Alterações pendentes' : 'Nada para salvar'}</span><div>{dirty && canManage && <button type="button" disabled={pending} onClick={() => setDiscarding(true)}>Descartar alterações</button>}<button className="crm-ia-primary" type="submit" disabled={pending || !canManage || !dirty}>{pending ? 'Salvando…' : 'Salvar Concierge'}</button></div></footer>
    </form>
  </section>;
}
