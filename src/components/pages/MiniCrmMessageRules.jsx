import { mergeMessageSources } from '../../../supabase/functions/_shared/ingressMessageSource.js';
import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { normalizeMessageRules, parseMessageAppointment, messageStatusAllowed, validateMessageRules } from '../../../supabase/functions/_shared/miniCrmMessageRules.js';
import { isAppointmentDateColumn } from '@/lib/miniCrm';
import './MiniCrmMessageRules.css';

const INPUT = 'mini-rules-input';
function Channels({ title, channels, value, onChange }) {
  return <fieldset className="mini-rules-channels"><legend>{title}</legend>
    <p>Sem seleção, a regra vale em todos os canais.</p>
    <div>{channels.map((channel) => <label key={channel.id}><input type="checkbox" checked={value.includes(channel.id)} onChange={(event) => onChange(event.target.checked ? [...value, channel.id] : value.filter((id) => id !== channel.id))} />{channel.name || 'WhatsApp'}</label>)}</div>
    {value.filter((id) => !channels.some((channel) => channel.id === id)).map((id) => <label key={id}><input type="checkbox" checked onChange={() => onChange(value.filter((key) => key !== id))} />Canal indisponível</label>)}
  </fieldset>;
}
function Stage({ label, value, onChange, statuses }) {
  return <label>{label}<select className={INPUT} value={value} onChange={(event) => onChange(event.target.value)}><option value="">Escolha uma etapa</option>{statuses.map((status) => <option value={status.key} key={status.key}>{status.label}</option>)}</select></label>;
}
export default function MiniCrmMessageRules({ clienteId, statuses, columns, onSaved }) {
  const { toast } = useToast();
  const [rules, setRules] = useState(normalizeMessageRules());
  const [version, setVersion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [channels, setChannels] = useState([]);
  const [history, setHistory] = useState([]);
  const [sample, setSample] = useState('Agendada dia 13/11 às 15hrs');
  const available = useMemo(() => statuses.filter((status) => messageStatusAllowed(status.key)), [statuses]);
  const dates = useMemo(() => columns.filter(isAppointmentDateColumn), [columns]);
  const preview = useMemo(() => parseMessageAppointment(sample, new Date().toISOString(), rules.appointmentWords), [sample, rules.appointmentWords]);
  const change = (patch) => setRules((current) => ({ ...current, ...patch }));
  useEffect(() => {
    let cancelled = false;
    setLoading(true);setError('');
    Promise.all([
      supabase.from('mini_crm_message_rules').select('settings,updated_at').eq('cliente_id', clienteId).maybeSingle(),
      supabase.from('cliente_whatsapp_config').select('id,name,provider').eq('cliente_id', clienteId).is('archived_at', null).order('created_at'),
      supabase.from('mini_crm_message_sources').select('id,name,phone').eq('cliente_id', clienteId).order('name'),
      supabase.from('mini_crm_message_history').select('id,status,previous_status,reason,message_at,appointment_day,appointment_time').eq('cliente_id', clienteId).order('created_at', { ascending: false }).limit(10),
    ]).then(([stored, channelRead, sources, log]) => {
      if (cancelled) return;
      if (stored.error || channelRead.error || sources.error || log.error) {setError('Não foi possível carregar as regras. Reabra esta aba para tentar novamente.');return;}
      const defaults = normalizeMessageRules(stored.data?.settings);
      if (!stored.data) {
        const find = (pattern, fallback) => available.find((status) => pattern.test(status.label.toLowerCase()))?.key || fallback;
        defaults.entryStatus = find(/novo|aguardando/, available[0]?.key || '');
        defaults.workingStatus = find(/atendimento/, available[1]?.key || available[0]?.key || '');
        defaults.appointmentStatus = find(/agend/, '');
        defaults.appointmentField = dates[0]?.key || '';
      }
      setRules(defaults);setVersion(stored.data?.updated_at || null);setChannels(mergeMessageSources(channelRead.data || [], sources.data || []));setHistory(log.data || []);
    }).catch(() => !cancelled && setError('Não foi possível carregar as regras.')).finally(() => !cancelled && setLoading(false));
    return () => {cancelled = true;};
  }, [clienteId]);
  async function save(event) {
    event.preventDefault();if (saving || loading || error) return;
    const normalized = normalizeMessageRules(rules);
    const errors = validateMessageRules(normalized, { statuses, columns: dates });
    if (errors.length) {toast({ variant: 'destructive', title: 'Confira as regras', description: errors[0] });return;}
    setSaving(true);
    try {
      let query;
      if (version) query = supabase.from('mini_crm_message_rules').update({ settings: normalized }).eq('cliente_id', clienteId).eq('updated_at', version);
      else query = supabase.from('mini_crm_message_rules').insert({ cliente_id: clienteId, settings: normalized });
      const { data, error: saveError } = await query.select('updated_at').maybeSingle();
      if (saveError || !data) throw new Error(saveError?.code === '23505' || !data ? 'As regras mudaram em outra tela. Reabra a aba antes de salvar.' : saveError.message);
      setVersion(data.updated_at);setRules(normalized);onSaved?.(normalized.enabled);
      toast({ title: normalized.enabled ? 'Automação ativada' : 'Regras salvas e desligadas', description: 'A configuração vale para as próximas mensagens recebidas pelo sistema.' });
    } catch (failure) {toast({ variant: 'destructive', title: 'Não salvou as regras', description: failure.message });}
    finally {setSaving(false);}
  }
  if (loading) return <p className="mini-rules-state">Carregando automação…</p>;
  if (error) return <p role="alert" className="mini-rules-state">{error}</p>;
  return <form className="mini-rules" onSubmit={save}>
    <header className="mini-rules-card mini-rules-header"><div><h2>Status por mensagem <span>{rules.enabled ? 'Ligada' : 'Desligada'}</span></h2><p>As mensagens movem o contato entre as etapas que você escolher.</p></div><div><label className="mini-rules-toggle"><input type="checkbox" checked={rules.enabled} onChange={(event) => change({ enabled: event.target.checked })} />Ativar automação</label><button type="submit" className="mini-crm-primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar regras'}</button></div></header>
    <section className="mini-rules-card"><h3>Chegada e primeira resposta</h3><p>O contato chega como novo lead. Quando a equipe responde, segue para atendimento, sem voltar de uma etapa mais avançada.</p><div className="mini-rules-grid"><Stage label="Sem resposta da equipe" value={rules.entryStatus} onChange={(entryStatus) => change({ entryStatus })} statuses={available} /><Stage label="Equipe respondeu" value={rules.workingStatus} onChange={(workingStatus) => change({ workingStatus })} statuses={available} /></div><Channels title="Canais desta regra" channels={channels} value={rules.arrivalChannels} onChange={(arrivalChannels) => change({ arrivalChannels })} /></section>
    <section className="mini-rules-card"><div className="mini-rules-section-title"><h3>Agendamento na mensagem</h3><label className="mini-rules-toggle"><input type="checkbox" checked={rules.appointmentEnabled} onChange={(event) => change({ appointmentEnabled: event.target.checked })} />Reconhecer agendamento</label></div><p>Uma confirmação enviada pela equipe, com uma única data, atualiza a etapa e o agendamento. O horário é preenchido quando estiver na mensagem.</p><div className="mini-rules-grid"><Stage label="Etapa de agendamento" value={rules.appointmentStatus} onChange={(appointmentStatus) => change({ appointmentStatus })} statuses={available} /><label>Coluna de agendamento<select className={INPUT} value={rules.appointmentField} onChange={(event) => change({ appointmentField: event.target.value })}><option value="">Escolha uma coluna de data</option>{dates.map((column) => <option key={column.key} value={column.key}>{column.label}</option>)}</select></label></div><label>Outras palavras de confirmação<input className={INPUT} value={rules.appointmentWords} onChange={(event) => change({ appointmentWords: event.target.value })} placeholder="Ex.: reserva confirmada, prova marcada" maxLength={2000} /></label><Channels title="Canais do agendamento" channels={channels} value={rules.appointmentChannels} onChange={(appointmentChannels) => change({ appointmentChannels })} /><div className="mini-rules-preview"><label>Teste uma frase<input className={INPUT} value={sample} onChange={(event) => setSample(event.target.value)} maxLength={5000} /></label><output aria-live="polite" className={preview.ok ? 'is-valid' : ''}>{preview.ok ? preview.label : preview.reason}</output><p>A prévia não altera contatos. Datas sem ano usam o calendário de São Paulo; datas antigas há mais de sete dias passam para o próximo ano.</p></div></section>
    <section className="mini-rules-card"><div className="mini-rules-section-title"><h3>Palavras na mensagem</h3><button type="button" className="mini-crm-secondary" disabled={rules.keywords.length >= 30} onClick={() => change({ keywords: [...rules.keywords, { id: crypto.randomUUID(), words: '', status: '', sender: 'lead', channels: [] }] })}><Plus size={15} /> Palavra</button></div><p>Separe palavras ou frases por vírgula. A primeira regra que combinar vence. O agendamento confirmado tem prioridade.</p>{!rules.keywords.length && <p className="mini-rules-empty">Nenhuma palavra configurada.</p>}{rules.keywords.map((rule, index) => {
      const patch = (value) => change({ keywords: rules.keywords.map((item, n) => n === index ? { ...item, ...value } : item) });
      return <fieldset className="mini-rules-keyword" key={rule.id}><legend>Regra {index + 1}</legend><div className="mini-rules-section-title"><label>Palavras ou frases<input className={INPUT} value={rule.words} maxLength={2000} onChange={(event) => patch({ words: event.target.value })} placeholder="Ex.: tenho interesse, quero visitar" /></label><button type="button" className="mini-crm-icon" aria-label={`Remover regra ${index + 1}`} onClick={() => change({ keywords: rules.keywords.filter((_, n) => n !== index) })}><Trash2 size={17} /></button></div><div className="mini-rules-grid"><label>Quem enviou<select className={INPUT} value={rule.sender} onChange={(event) => patch({ sender: event.target.value })}><option value="lead">Cliente</option><option value="team">Equipe</option><option value="any">Qualquer um</option></select></label><Stage label={`Etapa da regra ${index + 1}`} value={rule.status} onChange={(status) => patch({ status })} statuses={available} /></div><Channels title={`Canais da regra ${index + 1}`} channels={channels} value={rule.channels} onChange={(channelIds) => patch({ channels: channelIds })} /></fieldset>;
    })}</section>
    <section className="mini-rules-card mini-rules-note"><h3>Controle da equipe</h3><p>Marcar uma etapa manualmente pausa a automação daquele contato. Use “Retomar automação” na ficha do Mini CRM para liberar novamente. Venda, qualificação e cadências continuam nas ações próprias do CRM.</p><p>São consideradas apenas as próximas mensagens de conversas individuais recebidas pelo webhook. Não são relidos históricos nem conversas de grupo.</p></section>
    <section className="mini-rules-card"><h3>Últimas alterações automáticas</h3>{!history.length ? <p>Nenhuma alteração automática registrada.</p> : <ul className="mini-rules-history">{history.map((item) => <li key={item.id}><span>{statuses.find((status) => status.key === item.previous_status)?.label || item.previous_status || 'Sem etapa'} → <strong>{statuses.find((s) => s.key === item.status)?.label || item.status}</strong>{item.appointment_day ? ` · ${item.appointment_day.split('-').reverse().join('/')}${item.appointment_time ? ` às ${item.appointment_time}` : ''}` : ''}</span><time>{new Date(item.message_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</time></li>)}</ul>}</section>
  </form>;
}
