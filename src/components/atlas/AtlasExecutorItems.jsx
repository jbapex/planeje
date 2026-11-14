import React, { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { validateExecutorAnswers, validateExecutorQuestion } from '@/lib/atlasExecutorForms';
import './AtlasExecutor.css';

const APPS = { crm: 'CRM IA', cs: 'CS IA', gestor: 'Gestor IA', atlas: 'Atlas' };
const STATES = { awaiting_input: 'Aguardando resposta', proposed: 'Aguardando aprovação', executing: 'Executando etapas aprovadas', completed: 'Concluído', rejected: 'Recusado', cancelled: 'Cancelado', conflict: 'Dados alterados', failed: 'Falha', uncertain: 'Resultado não confirmado' };
const displayValue = value => value === null || value === undefined ? 'Não definido' : typeof value === 'boolean' ? value ? 'Sim' : 'Não' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
const errorMessage = error => typeof error === 'string' ? error : error?.message || 'Não foi possível registrar sua resposta. Tente novamente.';
const FIELD_LABELS = { nome: 'Nome', name: 'Nome', status: 'Situação', content: 'Conhecimento', body: 'Mensagem', title: 'Título', instructions: 'Instruções', instrucoes: 'Instruções', objetivo: 'Objetivo', tom: 'Tom', ativo: 'Ativo', auto_responder: 'Responder automaticamente', modelo: 'Modelo', pipeline_id: 'Funil', stage_id: 'Etapa', stage_ids: 'Etapas', base_ids: 'Bases de conhecimento', owner_id: 'Responsável', assigned_to: 'Responsável', contact_id: 'Contato', channel_id: 'Canal', start_at: 'Início', end_at: 'Fim', notes: 'Observações', data: 'Configuração', section: 'Área', enabled: 'Habilitado', reading_enabled: 'Leitura habilitada', transcription_enabled: 'Transcrição de áudio', include_audio: 'Incluir áudio', p_enabled: 'Habilitado', daily_budget: 'Orçamento diário', lifetime_budget: 'Orçamento total', currency: 'Moeda', account_id: 'Conta de anúncios', adAccountId: 'Conta de anúncios', objectId: 'Anúncio, conjunto ou campanha', configured_status: 'Situação configurada', kind: 'Tipo', mode: 'Modo' };
const fieldLabel = key => FIELD_LABELS[key] || FIELD_LABELS[key.replace(/^p_/, '')] || key.replace(/^p_/, '').replace(/_/g, ' ').replace(/^./, letter => letter.toLocaleUpperCase('pt-BR'));
const metadata = /^(?:expected(?:_|$)|revision$|updated_at$|created_at$|expectedVersion$|p_version$|executor_revision$)/;

function officialHref(value, conversationId) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const origin = globalThis.location?.origin || 'https://planeje.invalid';
    const url = new URL(value, origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) return null;
    if (url.hash) return url.hash.startsWith('#/') ? url.hash : null;
    if (conversationId && url.pathname === '/assistant/atlas' && url.searchParams.get('view') === 'conversation' && ['memory','knowledge'].includes(url.searchParams.get('tab'))) url.searchParams.set('conversation', conversationId);
    return '#' + url.pathname + url.search;
  } catch { return null; }
}

function Values({ value, depth = 0 }) {
  if (value === null || typeof value !== 'object' || depth >= 6) return <span>{displayValue(value)}</span>;
  if (Array.isArray(value)) return value.length ? <ul>{value.map((entry, index) => <li key={index}><Values value={entry} depth={depth + 1} /></li>)}</ul> : <span>Nenhum</span>;
  const entries = Object.entries(value).filter(([key]) => !metadata.test(key));
  return entries.length ? <dl>{entries.map(([key, entry]) => <div key={key}><dt>{fieldLabel(key)}</dt><dd><Values value={entry} depth={depth + 1} /></dd></div>)}</dl> : <span>Sem campos adicionais</span>;
}
function DataView({ title, value }) {
  return <div className="atlas-executor-data"><h4>{title}</h4><Values value={value} /></div>;
}

function QuestionField({ field, value, onChange, inputRef, id, error, errorId, disabled }) {
  const helpId = field.description ? id + '-help' : undefined;
  const describedBy = [helpId, error && errorId].filter(Boolean).join(' ') || undefined;
  const props = { id, ref: inputRef, disabled, required: field.required, 'aria-describedby': describedBy, 'aria-invalid': Boolean(error) };
  const label = <>{field.label}{!field.required && <small> (opcional)</small>}</>;
  let control;
  if (field.type === 'boolean' || field.type === 'multiselect') {
    const options = field.type === 'boolean' ? [{ value: true, label: 'Sim' }, { value: false, label: 'Não' }] : field.options;
    control = <fieldset className="atlas-executor-options" disabled={disabled} aria-describedby={describedBy}><legend>{label}</legend>{options.map((option, index) => <label key={String(option.value)} htmlFor={id + '-' + index}>
      <input id={id + '-' + index} ref={index === 0 ? inputRef : undefined} type={field.type === 'boolean' ? 'radio' : 'checkbox'} name={id} value={String(option.value)}
        checked={field.type === 'boolean' ? value === option.value : Array.isArray(value) && value.includes(option.value)}
        aria-invalid={Boolean(error)} onChange={event => onChange(field.type === 'boolean' ? option.value : event.target.checked ? [...(value || []), option.value] : (value || []).filter(entry => entry !== option.value))} />
      <span>{option.label}</span>
    </label>)}</fieldset>;
  } else {
    control = <><label htmlFor={id}>{label}</label>{field.type === 'textarea'
      ? <Textarea {...props} maxLength={field.maxLength} value={value ?? ''} onChange={event => onChange(event.target.value)} />
      : field.type === 'select'
        ? <select {...props} value={value ?? ''} onChange={event => onChange(event.target.value)}><option value="">Selecione uma opção</option>{field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
        : <Input {...props} type={field.type} min={field.min} max={field.max} maxLength={field.maxLength} value={value ?? ''}
          onChange={event => onChange(field.type === 'number' && event.target.value !== '' ? Number(event.target.value) : event.target.value)} />}</>;
  }
  return <div className="atlas-executor-field">{control}{field.description && <p id={helpId}>{field.description}</p>}</div>;
}

function ExecutorItem({ item, busy, onRespond, onReconcile, onPreferText, textMode }) {
  const [answers, setAnswers] = useState(() => item.answers || {});
  const [step, setStep] = useState(0);
  const [freeText, setFreeText] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const inFlight = useRef(false);
  const inputRef = useRef(null);
  const prefix = useId();
  const actionable = item.kind === 'question' ? item.state === 'awaiting_input' : item.kind === 'proposal' && item.state === 'proposed';
  const disabled = busy || pending || submitted || !onRespond;
  let question; let schemaError;
  if (item.kind === 'question') {
    try { question = validateExecutorQuestion({ title: item.title, fields: item.fields, ...(item.description ? { description: item.description } : {}) }); }
    catch (failure) { schemaError = errorMessage(failure); }
  }
  const field = question?.fields[step];

  useEffect(() => { if (actionable && !textMode) inputRef.current?.focus(); }, [step, freeText, actionable, textMode]);

  async function respond(decision, values = {}) {
    if (disabled || inFlight.current) return;
    inFlight.current = true;
    setPending(true); setError('');
    try {
      await onRespond({ id: item.id, revision: item.revision, decision, ...values });
      setSubmitted(true);
    } catch (failure) { setError(errorMessage(failure)); }
    finally { inFlight.current = false; setPending(false); }
  }

  async function reconcile() {
    if (busy || pending || inFlight.current || !onReconcile) return;
    inFlight.current = true; setPending(true); setError('');
    try { await onReconcile(item.id); }
    catch (failure) { setError(errorMessage(failure)); }
    finally { inFlight.current = false; setPending(false); }
  }

  function advance() {
    if (disabled) return;
    try {
      validateExecutorAnswers({ title: question.title, fields: [field] }, Object.prototype.hasOwnProperty.call(answers, field.id) ? { [field.id]: answers[field.id] } : {});
      if (step < question.fields.length - 1) { setStep(step + 1); setError(''); }
      else void respond('answer', { answers: validateExecutorAnswers(question, answers) });
    } catch (failure) { setError(errorMessage(failure)); inputRef.current?.focus(); }
  }

  const officialLinks = (Array.isArray(item.links) ? item.links : []).map(link => ({ href: officialHref(link?.href || link?.url, item.conversation_id), label: link?.label || link?.title || 'Abrir registro' })).filter(link => link.href);
  return <article className="atlas-executor-card" id={'atlas-executor-item-' + item.id} data-state={item.state} data-kind={item.kind} onKeyDown={event => {
    if (item.kind === 'question' && actionable && !freeText && !disabled && event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && ['INPUT', 'TEXTAREA'].includes(event.target.tagName) && !['checkbox', 'radio'].includes(event.target.type)) {
      event.preventDefault(); advance();
    }
  }} aria-labelledby={prefix + '-title'}>
    <header className="atlas-executor-card-header"><div><p>{APPS[item.app] || 'Atlas'}{item.client_id && <> · {item.client_name || 'Cliente selecionado'}</>}</p><h3 id={prefix + '-title'}>{item.title || 'Revisão do Atlas'}</h3></div><span className="atlas-executor-state">{item.kind === 'question' && actionable && question ? `Etapa ${step + 1} de ${question.fields.length}` : STATES[item.state] || 'Registrado'}</span></header>
    {item.description && <p className="atlas-executor-description">{item.description}</p>}
    {item.kind === 'question' && actionable && <>
      {schemaError ? <p role="alert" className="atlas-executor-error">{schemaError}</p> : freeText ? <div className="atlas-executor-field">
        <label htmlFor={prefix + '-text'}>Sua resposta</label><Textarea id={prefix + '-text'} ref={inputRef} disabled={disabled} maxLength={12000} value={text} aria-invalid={Boolean(error)} aria-describedby={error ? prefix + '-error' : undefined} onChange={event => { setText(event.target.value); setError(''); }} />
        <p>O texto responde à pergunta. Uma execução continuará exigindo a revisão da proposta.</p>
        <Button type="button" disabled={disabled} onClick={() => { if (!text.trim()) setError('Escreva sua resposta.'); else void respond('text', { text: text.trim() }); }}>Enviar texto</Button>
      </div> : <>
        <div className="atlas-executor-progress"><progress className="sr-only" value={step + 1} max={question.fields.length} aria-label="Progresso das perguntas" /><div className="atlas-question-segments" aria-hidden="true">{question.fields.map((entry, index) => <span key={entry.id} data-complete={index <= step} />)}</div></div>
        <QuestionField field={field} id={prefix + '-field-' + field.id} inputRef={inputRef} value={answers[field.id]} disabled={disabled} error={error} errorId={prefix + '-error'}
          onChange={value => { setAnswers(previous => ({ ...previous, [field.id]: value })); setError(''); }} />
        <div className="atlas-executor-actions atlas-question-actions"><Button type="button" variant="outline" disabled={disabled || step === 0} onClick={() => { setStep(step - 1); setError(''); }}>Voltar</Button><Button type="button" variant="ghost" disabled={disabled} onClick={() => { if (onPreferText) onPreferText(item); else setFreeText(true); setError(''); }}>Prefiro escrever</Button><Button type="button" variant="dark" disabled={disabled} onClick={advance}>{step === question.fields.length - 1 ? 'Enviar respostas' : 'Avançar'}</Button></div>
      </>}
      <div className="atlas-executor-actions">{question && freeText && <Button type="button" variant="ghost" disabled={disabled} onClick={() => { if (onPreferText) onPreferText(item); else setFreeText(value => !value); setError(''); }}>{freeText ? 'Responder por etapas' : 'Prefiro escrever'}</Button>}<Button type="button" variant="ghost" disabled={disabled} onClick={() => void respond('cancel')}>Cancelar</Button></div>
    </>}
    {item.kind === 'proposal' && <>
      <div className="atlas-executor-preview"><DataView title="Antes" value={item.preview?.before ?? item.before} /><DataView title="Depois" value={item.preview?.after ?? item.payload} /></div>
      <div className="atlas-executor-effects"><strong>Efeitos da ação</strong><p>{item.action === 'save_automation' ? 'Salva a definição da automação. Executar agora e ativar são ações separadas.' : item.effect?.external ? 'Esta ação produz efeito fora do Planeje.' : 'Esta ação altera registros no Planeje.'}</p>{item.effect?.enables_autonomy && <p>Ativa autonomia para execuções automáticas.</p>}{item.effect?.cost !== undefined && <p>Custo informado: {displayValue(item.effect.cost)}</p>}</div>
      {actionable && <div className="atlas-executor-actions"><Button type="button" disabled={disabled} onClick={() => void respond('approve')}>{item.action === 'save_automation' ? 'Confirmar salvamento' : 'Aprovar e executar'}</Button><Button type="button" variant="outline" disabled={disabled} onClick={() => void respond('reject')}>Recusar</Button></div>}
    </>}
    {item.kind === 'question' && !actionable && item.answers && <DataView title="Respostas registradas" value={Object.fromEntries(Object.entries(item.answers).map(([key, value]) => {
      const schema = question?.fields.find(entry => entry.id === key);
      const option = entry => schema?.options?.find(candidate => candidate.value === entry)?.label || entry;
      return [schema?.label || (key === 'text' ? 'Sua resposta' : fieldLabel(key)), Array.isArray(value) ? value.map(option) : option(value)];
    }))} />}
    {item.state === 'conflict' && <p className="atlas-executor-notice">Os dados mudaram. Uma nova leitura e revisão são necessárias antes de executar.</p>}
    {item.state === 'uncertain' && <p className="atlas-executor-notice">O resultado ainda não foi confirmado. Confira o estado no aplicativo antes de repetir a ação.</p>}
    {['executing', 'uncertain'].includes(item.state) && <div className="atlas-executor-actions">
      {onReconcile && <Button type="button" variant="outline" disabled={busy || pending} onClick={() => void reconcile()}>Conferir resultado</Button>}
      {item.state === 'executing' && item.action === 'create_meta_campaign' && <Button type="button" disabled={disabled} onClick={() => void respond('approve')}>Continuar etapas aprovadas</Button>}
      {pending && <p role="status">Conferindo a operação aprovada…</p>}
    </div>}
    {item.result && <DataView title="Recibo" value={item.result.summary ?? item.result.message ?? item.result} />}
    {(error || item.error) && <p role="alert" id={prefix + '-error'} className="atlas-executor-error">{error || errorMessage(item.error)}</p>}
    {actionable && (pending || submitted) && <p role="status" className="atlas-executor-notice">{pending ? 'Registrando sua decisão…' : 'Decisão enviada. Aguardando confirmação no histórico.'}</p>}
    {officialLinks.length > 0 && <nav className="atlas-executor-links" aria-label="Registros da execução">{officialLinks.map((link, index) => <a key={index} href={link.href}>{link.label}</a>)}</nav>}
  </article>;
}

export default function AtlasExecutorItems({ items = [], clients = [], busy = false, onRespond, onReconcile, onPreferText, textModeId }) {
  if (!items.length) return null;
  return <section className="atlas-executor-items" aria-label="Perguntas e decisões do Atlas">{items.map(item => <ExecutorItem key={item.id + ':' + item.revision} item={{ ...item, client_name: clients.find(client => client.id === item.client_id)?.empresa || item.client_name }} busy={busy} onRespond={onRespond} onReconcile={onReconcile} onPreferText={onPreferText} textMode={textModeId === item.id} />)}</section>;
}
