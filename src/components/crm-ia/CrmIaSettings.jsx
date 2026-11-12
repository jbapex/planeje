import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { BookOpen, CalendarDays, CalendarRange, Check, ClipboardList, Gauge, GitBranch, Inbox, ListFilter, MessageSquare, ShieldCheck, Sparkles } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Switch } from '@/components/ui/switch';
import { CrmIaEditor, CrmIaField, CrmIaState, useCrmRead } from './CrmIaPrimitives';
import { AGENT_TYPES, count, lines, named } from './crmIaPresentation';
import CrmIaGoogleCalendar from './CrmIaGoogleCalendar';
import './CrmIaSettings.css';

const SETTINGS_GROUPS = [
  { label: 'Equipe e atendimento', items: [
    ['initial', 'Configuração inicial', ClipboardList, 'Confira o que a conta já tem preparado antes de iniciar o atendimento.'],
    ['attendance', 'Atendimento e IA', Sparkles, 'Ajuste pausas, identificação da equipe e regras de retorno.'],
    ['availability', 'Disponibilidade', CalendarRange, 'Defina os responsáveis, horários e exceções da equipe.'],
    ['google_calendar', 'Google Agenda', CalendarDays, 'Conecte sua agenda e acompanhe a sincronização dos compromissos.'],
    ['quick_replies', 'Respostas rápidas', MessageSquare, 'Prepare textos que a equipe pode revisar e usar durante uma conversa.'],
  ] },
  { label: 'Leads e canais', items: [
    ['distribution', 'Distribuição', GitBranch, 'Escolha como os novos leads chegam aos responsáveis da equipe.'],
    ['entry', 'Entrada de leads', Inbox, 'Defina quais entradas capturar e o destino de cada canal.'],
    ['knowledge', 'Conhecimento', BookOpen, 'Vincule as bases de conhecimento aos funis e ao Concierge.'],
  ] },
  { label: 'Dados e controle', items: [
    ['custom_fields', 'Campos personalizados', ListFilter, 'Organize as informações usadas na qualificação dos leads.'],
    ['test_mode', 'Modo de teste', ShieldCheck, 'Restrinja as respostas aos telefones autorizados durante os testes.'],
    ['usage', 'Uso da IA', Gauge, 'Consulte as respostas e os tokens registrados nesta conta.'],
  ] },
];
const SETTINGS = SETTINGS_GROUPS.flatMap(group => group.items.map(([id, label, Icon, description]) => ({ id, label, Icon, description, group: group.label })));
const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const emptyOption = label => ({ value: '', label });
const CONFIG_DEFAULTS = {
  attendance: { auto_send: false, pause_on_human: true, show_attendant_name: false, restart_triage: false, quick_replies: [] },
  availability: { timezone: 'America/Sao_Paulo', duration_minutes: 30, interval_minutes: 30, buffer_before: 0, buffer_after: 0, min_notice_hours: 1, horizon_days: 60, max_per_day: 8, windows: [], exceptions: [] },
  distribution: { enabled: false, strategy: 'round_robin', sources: [], include_unassigned: false, people: [], fallback_owner_id: null },
  entry: { enabled: false, channels: [] }, knowledge: { assignments: [], concierge_base_id: null }, custom_fields: { fields: [] }, test_mode: { enabled: false, phones: [] },
};

export default function CrmIaSettings({ api, mutate, workspace, canManage, revision }) {
  const [params, setParams] = useSearchParams();
  const requestedSection = SETTINGS.some(item => item.id === params.get('aba')) ? params.get('aba') : 'initial';
  const [section, setSection] = useState(requestedSection);
  const configSection = section === 'quick_replies' ? 'attendance' : section;
  const selected = SETTINGS.find(item => item.id === section);
  const Icon = selected.Icon;
  const [draft, setDraft] = useState({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [usageReload, setUsageReload] = useState(0);
  const busy = useRef(false);
  const mounted = useRef(true);
  const permission = useRef(canManage);
  const account = useRef(workspace.client.id);
  permission.current = canManage;
  account.current = workspace.client.id;
  const calendarApi = useCallback(async (action, payload) => {
    if (action !== 'calendar_status' && (!permission.current || account.current !== workspace.client.id)) throw new Error('Você tem acesso somente para consulta.');
    return api(action, payload);
  }, [api, workspace.client.id]);
  const usage = useCrmRead(api, 'usage', {}, `${workspace.client.id}:${revision}:${usageReload}`, section === 'usage');
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (!busy.current) setSection(requestedSection); }, [requestedSection, pending]);
  useEffect(() => { setDraft({ ...CONFIG_DEFAULTS[configSection], ...workspace.config.data[configSection] }); }, [section, configSection, workspace.config]);
  useEffect(() => { setSaved(false); setError(''); }, [section, workspace.config]);
  const set = (key, value) => { if (!permission.current || busy.current) return; setDraft(old => ({ ...old, [key]: value })); setSaved(false); };
  function choose(value) {
    if (busy.current) return;
    setParams(previous => { const next = new URLSearchParams(previous); next.set('aba', value); return next; });
  }
  async function save(event) {
    event.preventDefault(); if (busy.current || !permission.current || account.current !== workspace.client.id) return;
    const clientId = workspace.client.id;
    busy.current = true; setPending(true); setError(''); setSaved(false);
    try {
      if (configSection === 'availability' && !(draft.windows || []).every(row => row.owner_id && row.days?.length && row.start && row.start < row.end)) throw new Error('Confira o responsável, os dias e os horários de cada janela.');
      if (configSection === 'availability') new Intl.DateTimeFormat('pt-BR', { timeZone: draft.timezone }).format();
      if (configSection === 'custom_fields' && (draft.fields || []).some(row => !row.name?.trim() || !/^[a-z][a-z0-9_]*$/.test(row.key))) throw new Error('Informe nome e chave válida em cada campo.');
      if (configSection === 'test_mode' && draft.enabled && !(draft.phones || []).length) throw new Error('Adicione ao menos um telefone autorizado antes de ativar o modo de teste.');
      await mutate('save_config', { section: configSection, data: draft, revision: workspace.config.revision });
      if (mounted.current && account.current === clientId && permission.current) setSaved(true);
    } catch (failure) { if (mounted.current && account.current === clientId && permission.current) setError(failure.message); }
    finally { busy.current = false; if (mounted.current) setPending(false); }
  }
  return <div className="crm-ia-settings-layout">
    <nav className="crm-ia-settings-nav" aria-label="Seções das configurações">
      <label className="crm-ia-settings-mobile-nav"><span>Seção de configuração</span><select aria-label="Seção de configuração" value={section} disabled={pending} onChange={event => choose(event.target.value)}>{SETTINGS_GROUPS.map(group => <optgroup key={group.label} label={group.label}>{group.items.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</optgroup>)}</select></label>
      {SETTINGS_GROUPS.map(group => <div className="crm-ia-settings-nav-group" role="group" aria-label={group.label} key={group.label}><p>{group.label}</p>{group.items.map(([id, label, ItemIcon]) => <button type="button" key={id} aria-pressed={section === id} aria-current={section === id ? 'page' : undefined} aria-controls="crm-ia-settings-panel" disabled={pending} onClick={() => choose(id)}><ItemIcon size={16} aria-hidden="true" /><span>{label}</span></button>)}</div>)}
    </nav>
    <section className="crm-ia-settings-panel" id="crm-ia-settings-panel" aria-labelledby="crm-ia-settings-title" aria-busy={pending}>
      <header className="crm-ia-settings-heading"><Icon size={19} aria-hidden="true" /><div><p className="crm-ia-settings-eyebrow">{selected.group}</p><h2 id="crm-ia-settings-title">{selected.label}</h2><p>{selected.description}</p></div></header>
      {section === 'initial' ? <CrmIaSettingsInitial workspace={workspace} choose={choose} />
        : section === 'usage' ? <CrmIaState read={usage} retry={() => setUsageReload(value => value + 1)}><dl className="crm-ia-facts"><div><dt>Respostas registradas</dt><dd>{count(usage.data?.responses)}</dd></div><div><dt>Tokens registrados</dt><dd>{count(usage.data?.tokens)}</dd></div></dl><p className="crm-ia-muted">Franquia, saldo e preço do provedor não estão disponíveis nesta leitura.</p><ul className="crm-ia-list">{(usage.data?.by_agent || []).map(agent => <li key={agent.id}><strong>{agent.nome}</strong><span>{count(agent.responses)} respostas</span></li>)}</ul></CrmIaState>
          : section === 'google_calendar' ? <fieldset disabled={!canManage}><CrmIaGoogleCalendar key={`${workspace.client.id}:${canManage}`} api={calendarApi} clientId={workspace.client.id} /></fieldset>
            : <form onSubmit={save}>
              {!canManage && <p className="crm-ia-settings-read-only">Somente consulta. O gerenciamento desta conta não está disponível para seu acesso.</p>}
              <fieldset disabled={!canManage || pending}>
                {section === 'attendance' && <>
                  <CrmIaSettingsSection title="Autonomia do atendimento" description="A autonomia geral e a autorização do agente precisam estar ligadas. Novas configurações começam desligadas."><CrmIaPreference label="Autorizar envios automáticos do CRM IA" description="Permite a atuação dos agentes autorizados nos canais desta conta." value={draft.auto_send === true} onChange={value => set('auto_send', value)} /></CrmIaSettingsSection>
                  <CrmIaSettingsSection title="Pausa temporária da IA" description="Responder manualmente assume a conversa. A IA só volta quando o atendimento for devolvido."><CrmIaPreference label="Pausar IA quando uma pessoa responder" description="A pausa humana é compartilhada pelos canais do mesmo contato." value={draft.pause_on_human !== false} onChange={value => set('pause_on_human', value)} /></CrmIaSettingsSection>
                  <CrmIaSettingsSection title="Identificação nas mensagens" description="Ajude o lead a saber com quem está falando quando a equipe compartilha o mesmo número."><CrmIaPreference label="Incluir nome do atendente na mensagem" description="Identifica a pessoa da equipe nas mensagens enviadas." value={draft.show_attendant_name === true} onChange={value => set('show_attendant_name', value)} /></CrmIaSettingsSection>
                  <CrmIaSettingsSection title="Retorno de leads resolvidos" description="Controle a triagem quando um contato inicia um novo atendimento."><CrmIaPreference label="Reiniciar triagem em novo atendimento" description="Aplica a regra de retorno configurada para a conta." value={draft.restart_triage === true} onChange={value => set('restart_triage', value)} /></CrmIaSettingsSection>
                  <p className="crm-ia-muted">Salvar estas regras não envia mensagens.</p>
                </>}
                {section === 'quick_replies' && <CrmIaSettingsSection title="Biblioteca da equipe" description="Os atalhos preenchem o rascunho na conversa. A equipe revisa o texto antes de enviar.">
                  {!(draft.quick_replies || []).length && <p className="crm-ia-settings-empty">Nenhuma resposta rápida cadastrada. Adicione os textos usados com frequência pela equipe.</p>}
                  {(draft.quick_replies || []).map((reply, index) => <div className="crm-ia-settings-record crm-ia-form-grid" key={index}><CrmIaField label={`Atalho ${index + 1}`} value={reply.shortcut} onChange={shortcut => set('quick_replies', draft.quick_replies.map((row, i) => i === index ? { ...row, shortcut } : row))} /><CrmIaField label={`Texto da resposta ${index + 1}`} type="textarea" value={reply.text} onChange={text => set('quick_replies', draft.quick_replies.map((row, i) => i === index ? { ...row, text } : row))} /><button type="button" onClick={() => set('quick_replies', draft.quick_replies.filter((_, i) => i !== index))}>Remover resposta {index + 1}</button></div>)}
                  <button type="button" onClick={() => set('quick_replies', [...(draft.quick_replies || []), { shortcut: '', text: '' }])}>Adicionar resposta rápida</button>
                </CrmIaSettingsSection>}
                {section === 'availability' && <CrmIaAvailability draft={draft} set={set} people={workspace.people} />}
                {section === 'distribution' && <>
                  <CrmIaSettingsSection title="Regras de distribuição"><CrmIaPreference label="Autorizar distribuição automática" description="Distribui as entradas elegíveis entre as pessoas configuradas abaixo." value={draft.enabled === true} onChange={value => set('enabled', value)} /><CrmIaField label="Estratégia de distribuição" value={draft.strategy || 'round_robin'} onChange={value => set('strategy', value)} options={[{ value: 'round_robin', label: 'Rodízio' }, { value: 'least_loaded', label: 'Menos carregado' }]} /></CrmIaSettingsSection>
                  <CrmIaSettingsSection title="Fontes elegíveis"><div className="crm-ia-check-grid">{[['whatsapp', 'WhatsApp'], ['meta', 'Meta'], ['site', 'Site'], ['manual', 'Cadastro manual']].map(([id, label]) => <CrmIaField key={id} label={label} type="checkbox" value={draft.sources?.includes(id)} onChange={checked => set('sources', checked ? [...(draft.sources || []), id] : draft.sources.filter(value => value !== id))} />)}</div><CrmIaPreference label="Incluir leads existentes sem responsável" description="Responsáveis escolhidos explicitamente são preservados. Importação CSV não passa pela distribuição." value={draft.include_unassigned === true} onChange={value => set('include_unassigned', value)} /></CrmIaSettingsSection>
                  <CrmIaSettingsSection title="Pessoas e capacidade">{(draft.people || []).map((person, index) => <div className="crm-ia-settings-record crm-ia-form-grid" key={index}><CrmIaField label={`Pessoa da distribuição ${index + 1}`} value={person.owner_id} onChange={owner_id => set('people', draft.people.map((row, i) => i === index ? { ...row, owner_id } : row))} options={[emptyOption('Selecione'), ...workspace.people]} /><CrmIaField label={`Peso ${index + 1}`} type="number" min="1" max="5" value={person.weight ?? 1} onChange={weight => set('people', draft.people.map((row, i) => i === index ? { ...row, weight: Number(weight) } : row))} /><CrmIaField label={`Limite de leads ${index + 1}`} type="number" min="1" value={person.limit} onChange={limit => set('people', draft.people.map((row, i) => i === index ? { ...row, limit: limit ? Number(limit) : null } : row))} /><button type="button" onClick={() => set('people', draft.people.filter((_, i) => i !== index))}>Remover pessoa {index + 1}</button></div>)}<button type="button" onClick={() => set('people', [...(draft.people || []), { owner_id: '', weight: 1, limit: null }])}>Adicionar pessoa</button><CrmIaField label="Responsável de fallback" value={draft.fallback_owner_id} onChange={value => set('fallback_owner_id', value || null)} options={[emptyOption('Sem fallback'), ...workspace.people]} /></CrmIaSettingsSection>
                </>}
                {section === 'entry' && <>
                  <CrmIaSettingsSection title="Captura de entradas"><CrmIaPreference label="Autorizar captura de novas entradas" description="Cada número precisa de um destino explícito. Entradas Meta, sites e portais são configuradas nos conectores já disponíveis." value={draft.enabled === true} onChange={value => set('enabled', value)} /></CrmIaSettingsSection>
                  <CrmIaSettingsSection title="Canais e destinos">{workspace.channels.map(channel => { const entry = (draft.channels || []).find(row => row.channel_id === channel.id) || { channel_id: channel.id, enabled: false, mode: 'phrase' }; const change = (key, value) => set('channels', [...(draft.channels || []).filter(row => row.channel_id !== channel.id), { ...entry, [key]: value }]); return <details key={channel.id} open className="crm-ia-settings-record"><summary>{named(channel)}</summary><CrmIaPreference label={`Capturar por ${named(channel)}`} value={entry.enabled} onChange={value => change('enabled', value)} /><div className="crm-ia-form-grid"><CrmIaField label={`Entradas do canal ${named(channel)}`} value={entry.mode} onChange={value => change('mode', value)} options={[{ value: 'phrase', label: 'Somente frase do anúncio' }, { value: 'all', label: 'Todo contato novo' }]} />{entry.mode === 'phrase' && <CrmIaField label={`Frase de entrada ${named(channel)}`} value={entry.phrase} onChange={value => change('phrase', value)} />}<CrmIaField label={`Funil de entrada ${named(channel)}`} value={entry.pipeline_id} onChange={value => { set('channels', [...(draft.channels || []).filter(row => row.channel_id !== channel.id), { ...entry, pipeline_id: value, stage_id: '' }]); }} options={[emptyOption('Selecione'), ...workspace.pipelines]} /><CrmIaField label={`Etapa de entrada ${named(channel)}`} value={entry.stage_id} onChange={value => change('stage_id', value)} options={[emptyOption('Selecione'), ...workspace.stages.filter(stage => stage.pipeline_id === entry.pipeline_id)]} /><CrmIaField label={`Etiquetas de entrada ${named(channel)}, uma por linha`} type="textarea" value={(entry.tags || []).join('\n')} onChange={value => change('tags', lines(value))} /></div></details>; })}{!workspace.channels.length && <p className="crm-ia-settings-empty">Nenhum canal disponível para esta conta.</p>}</CrmIaSettingsSection>
                </>}
                {section === 'knowledge' && <CrmIaSettingsSection title="Bases por funil" description="As bases e seu conteúdo são geridos em Agentes IA. Escolha aqui a base que orienta cada funil.">{workspace.pipelines.map(pipeline => { const base = (draft.assignments || []).find(row => row.pipeline_id === pipeline.id); return <CrmIaField key={pipeline.id} label={`Base do funil ${pipeline.nome}`} value={base?.base_id} onChange={base_id => set('assignments', [...(draft.assignments || []).filter(row => row.pipeline_id !== pipeline.id), ...(base_id ? [{ pipeline_id: pipeline.id, base_id }] : [])])} options={[emptyOption('Sem base'), ...workspace.bases]} />; })}<CrmIaField label="Base padrão do Concierge" value={draft.concierge_base_id} onChange={value => set('concierge_base_id', value || null)} options={[emptyOption('Sem base'), ...workspace.bases]} /></CrmIaSettingsSection>}
                {section === 'custom_fields' && <CrmIaSettingsSection title="Campos da qualificação" description="Nome e pasta podem mudar. Chave e tipo de um campo existente são preservados.">
                  {!(draft.fields || []).length && <p className="crm-ia-settings-empty">Nenhum campo personalizado cadastrado.</p>}
                  {(draft.fields || []).map((field, index) => { const existing = workspace.config.data.custom_fields?.fields?.some(item => item.key === field.key); const change = (key, value) => set('fields', draft.fields.map((row, i) => i === index ? { ...row, [key]: value } : row)); return <section className="crm-ia-settings-record crm-ia-form-grid" key={index}><CrmIaField label={`Nome do campo ${index + 1}`} value={field.name} onChange={value => change('name', value)} /><CrmIaField label={`Chave do campo ${index + 1}`} value={field.key} onChange={value => change('key', value)} disabled={existing} placeholder="exemplo_campo" /><CrmIaField label={`Tipo do campo ${index + 1}`} value={field.type} onChange={value => change('type', value)} disabled={existing} options={[['text', 'Texto'], ['textarea', 'Texto longo'], ['number', 'Número'], ['date', 'Data'], ['select', 'Seleção']].map(([value, label]) => ({ value, label }))} /><CrmIaField label={`Pasta do campo ${index + 1}`} value={field.folder} onChange={value => change('folder', value)} />{field.type === 'select' && <CrmIaField label={`Opções do campo ${index + 1}, uma por linha`} type="textarea" value={(field.options || []).join('\n')} onChange={value => change('options', lines(value))} />}<CrmIaPreference label={`Campo ${index + 1} ativo`} value={field.active !== false} onChange={value => change('active', value)} />{index > 0 && <button type="button" onClick={() => { const next = [...draft.fields]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; set('fields', next); }}>Subir campo {index + 1}</button>}</section>; })}<button type="button" onClick={() => set('fields', [...(draft.fields || []), { key: '', name: '', type: 'text', folder: '', options: [], active: true }])}>Adicionar campo</button>
                </CrmIaSettingsSection>}
                {section === 'test_mode' && <CrmIaSettingsSection title="Telefones de teste"><CrmIaPreference label="Responder somente a telefones de teste autorizados" description="Durante o teste, use somente os números explicitamente autorizados nesta lista." value={draft.enabled === true} onChange={value => set('enabled', value)} /><CrmIaField label="Telefones autorizados, um por linha com país e DDD" type="textarea" value={(draft.phones || []).join('\n')} onChange={value => set('phones', lines(value))} /><p className="crm-ia-muted">Salvar não envia mensagem de teste. O teste do agente fica em Agentes IA e não usa WhatsApp.</p></CrmIaSettingsSection>}
              </fieldset>
              <footer className="crm-ia-settings-save"><div>{error && <p className="crm-ia-error" role="alert">{error}</p>}{saved && <p className="crm-ia-success" role="status">Configuração salva.</p>}</div>{canManage && <button type="submit" className="crm-ia-primary" disabled={pending}>{pending ? 'Salvando…' : 'Salvar configuração'}</button>}</footer>
            </form>}
    </section>
  </div>;
}

function CrmIaSettingsSection({ title, description, children }) {
  return <section className="crm-ia-settings-section"><div className="crm-ia-settings-section-heading"><h3>{title}</h3>{description && <p>{description}</p>}</div>{children}</section>;
}

function CrmIaPreference({ label, description, value, onChange }) {
  const id = useId();
  return <div className="crm-ia-settings-preference"><div><label htmlFor={id}>{label}</label>{description && <p id={`${id}-description`}>{description}</p>}</div><div className="crm-ia-settings-preference-control"><span className="crm-ia-settings-preference-state" data-active={Boolean(value)} aria-hidden="true">{value ? 'Ativada' : 'Desativada'}</span><Switch id={id} className="crm-ia-settings-switch" aria-label={label} aria-describedby={description ? `${id}-description` : undefined} checked={Boolean(value)} onCheckedChange={onChange} /></div></div>;
}

function CrmIaSettingsInitial({ workspace, choose }) {
  const steps = [
    ['CRM preparado', 'Registros comerciais disponíveis nesta conta.', workspace.provisioned !== false],
    ['Funil cadastrado', 'Etapas para acompanhar a jornada dos leads.', workspace.pipelines.length > 0],
    ['Canal disponível', 'Números autorizados para o atendimento.', workspace.channels.length > 0],
    ['Responsável disponível', 'Pessoas com acesso à operação da conta.', workspace.people.length > 0],
    ['Base de conhecimento', 'Conteúdo disponível para orientar os agentes.', workspace.bases.length > 0, 'knowledge'],
    ['Disponibilidade cadastrada', 'Horários da equipe para novos compromissos.', workspace.config.data.availability?.windows?.length > 0, 'availability'],
  ];
  return <CrmIaSettingsSection title="Preparação da conta" description="Confira as fontes antes de ligar a operação. Preparar uma configuração não liga a autonomia."><ul className="crm-ia-settings-checklist">{steps.map(([label, description, complete, destination]) => <li key={label}><span className="crm-ia-settings-check" data-complete={complete} aria-hidden="true">{complete ? <Check size={14} /> : <span />}</span><div><strong>{label}</strong><p>{description}</p></div>{destination ? <button type="button" onClick={() => choose(destination)} aria-label={`Revisar ${label.toLocaleLowerCase('pt-BR')}`}>{complete ? 'Revisar' : 'Configurar'}</button> : <span className="crm-ia-badge">{complete ? 'Preparado' : 'Pendente'}</span>}</li>)}</ul><p className="crm-ia-muted">Conexão e reconexão dos números ficam nos Conectores oficiais. O assistente de configuração por chat não está disponível neste ambiente.</p></CrmIaSettingsSection>;
}

function CrmIaAvailability({ draft, set, people }) {
  const windows = draft.windows || [];
  const exceptions = draft.exceptions || [];
  const updateWindow = (index, key, value) => set('windows', windows.map((row, i) => i === index ? { ...row, [key]: value } : row));
  return <><CrmIaField label="Fuso da disponibilidade" value={draft.timezone || 'America/Sao_Paulo'} onChange={value => set('timezone', value)} /><div className="crm-ia-form-grid">{[['duration_minutes', 'Duração do compromisso, em minutos', 30, 5, 720], ['interval_minutes', 'Intervalo dos horários, em minutos', 30, 5, 720], ['buffer_before', 'Folga antes, em minutos', 0, 0, 240], ['buffer_after', 'Folga depois, em minutos', 0, 0, 240], ['min_notice_hours', 'Antecedência mínima, em horas', 1, 0, 720], ['horizon_days', 'Janela futura, em dias', 60, 1, 366], ['max_per_day', 'Máximo por dia', 8, 1, 200]].map(([key, label, fallback, min, max]) => <CrmIaField key={key} label={label} type="number" min={min} max={max} step={key === 'min_notice_hours' ? 'any' : 1} value={draft[key] ?? fallback} onChange={value => set(key, Number(value))} />)}</div>
    <h3>Janelas semanais</h3>{windows.map((row, index) => <section className="crm-ia-settings-record" key={index}><CrmIaField label={`Responsável da janela ${index + 1}`} value={row.owner_id} onChange={value => updateWindow(index, 'owner_id', value)} options={[emptyOption('Selecione'), ...people]} /><div className="crm-ia-check-grid">{DAYS.map((day, number) => <CrmIaField key={day} label={`${day}, disponibilidade ${index + 1}`} type="checkbox" value={row.days?.includes(number)} onChange={checked => updateWindow(index, 'days', checked ? [...(row.days || []), number].sort() : row.days.filter(value => value !== number))} />)}</div><div className="crm-ia-toolbar"><CrmIaField label={`Disponível desde ${index + 1}`} type="time" value={row.start} onChange={value => updateWindow(index, 'start', value)} /><CrmIaField label={`Disponível até ${index + 1}`} type="time" value={row.end} onChange={value => updateWindow(index, 'end', value)} /><button type="button" onClick={() => set('windows', windows.filter((_, i) => i !== index))}>Remover disponibilidade {index + 1}</button></div></section>)}<button type="button" onClick={() => set('windows', [...windows, { owner_id: '', days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' }])}>Adicionar disponibilidade</button>
    <h3>Exceções por data</h3>{exceptions.map((row, index) => { const change = (key, value) => set('exceptions', exceptions.map((item, i) => i === index ? { ...item, [key]: value } : item)); return <section className="crm-ia-settings-record crm-ia-form-grid" key={index}><CrmIaField label={`Responsável da exceção ${index + 1}`} value={row.owner_id} onChange={value => change('owner_id', value)} options={[emptyOption('Selecione'), ...people]} /><CrmIaField label={`Data da exceção ${index + 1}`} type="date" value={row.date} onChange={value => change('date', value)} /><CrmIaPreference label={`Bloquear o dia inteiro ${index + 1}`} value={row.blocked} onChange={value => change('blocked', value)} />{!row.blocked && <><CrmIaField label={`Início da exceção ${index + 1}`} type="time" value={row.start} onChange={value => change('start', value)} /><CrmIaField label={`Fim da exceção ${index + 1}`} type="time" value={row.end} onChange={value => change('end', value)} /></>}<button type="button" onClick={() => set('exceptions', exceptions.filter((_, i) => i !== index))}>Remover exceção {index + 1}</button></section>; })}<button type="button" onClick={() => set('exceptions', [...exceptions, { owner_id: '', date: '', blocked: true }])}>Adicionar exceção</button>
  </>;
}

export function CrmIaTemplates({ workspace, mutate, canManage }) {
  const [type, setType] = useState('pipeline');
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState(null);
  const [apply, setApply] = useState(null);
  const rows = workspace.templates.filter(item => item.tipo === type && `${item.nome} ${item.nicho || ''}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
  return <div className="crm-ia-stack"><div className="crm-ia-toolbar"><div className="crm-ia-segments" role="group" aria-label="Tipos de modelo">{[['pipeline', 'Funis'], ['base', 'Bases'], ['agent', 'Agentes']].map(([id, label]) => <button type="button" key={id} aria-pressed={id === type} onClick={() => setType(id)}>{label}</button>)}</div><CrmIaField label="Buscar modelos por nome ou nicho" value={search} onChange={setSearch} />{canManage && <button type="button" className="crm-ia-primary" onClick={() => setEditor({ tipo: type })}>Criar modelo</button>}</div><div className="crm-ia-template-grid">{rows.map(item => <article className="crm-ia-card" key={item.id}><span className="crm-ia-badge">{item.nicho || 'Todos os nichos'}</span><h2>{item.nome}</h2><p>{item.tipo === 'pipeline' ? `${item.data?.stages?.length || 0} etapas` : item.tipo === 'base' ? 'Base de conhecimento reutilizável' : 'Identidade e regras do agente'}</p>{canManage && <div className="crm-ia-toolbar"><button type="button" onClick={() => setEditor(item)}>Revisar modelo</button><button type="button" className="crm-ia-primary" onClick={() => setApply(item)}>Aplicar {item.nome}</button></div>}</article>)}</div>{!rows.length && <p className="crm-ia-state">Nenhum modelo neste recorte.</p>}
    {editor && <CrmIaTemplateEditor row={editor} {...{ workspace, mutate }} onClose={() => setEditor(null)} />}
    {apply && <CrmIaEditor title="Aplicar modelo" onClose={() => setApply(null)} saveLabel="Aplicar nesta conta" onSave={() => mutate('apply_template', { id: apply.id, revision: apply.revision })}><p>Aplicar <strong>{apply.nome}</strong> na conta <strong>{workspace.client.empresa}</strong>?</p><p>O modelo não leva telefones, responsáveis, canais ou IDs de etapas e agentes de outra conta. A autonomia da cópia começa desligada.</p></CrmIaEditor>}
  </div>;
}

function CrmIaTemplateEditor({ row, workspace, mutate, onClose }) {
  const [draft, setDraft] = useState({ nome: '', nicho: '', data: {}, ...row });
  const [source, setSource] = useState('');
  const set = (key, value) => setDraft(old => ({ ...old, [key]: value }));
  const data = (key, value) => setDraft(old => ({ ...old, data: { ...old.data, [key]: value } }));
  const choices = draft.tipo === 'pipeline' ? workspace.pipelines : draft.tipo === 'base' ? workspace.bases : workspace.agents;
  function copy(id) {
    setSource(id); if (!id) return;
    const item = choices.find(entry => entry.id === id);
    if (draft.tipo === 'pipeline') set('data', { stages: workspace.stages.filter(stage => stage.pipeline_id === id).map(({ nome, color, tipo, ordem, acoes_obrigatorias }) => ({ nome, color, tipo, ordem, acoes_obrigatorias })) });
    else if (draft.tipo === 'base') set('data', { nome: item.nome, conteudo: item.conteudo });
    else { const { pipeline_id: _pipeline, stage_ids: _stages, destino, agendamento, ...rules } = item.funil?.crm_ia || {}; set('data', { nome: item.nome, objetivo: item.objetivo, instrucoes: item.instrucoes, tom: item.tom, modelo: item.modelo, ativo: false, auto_responder: false, funil: { crm_ia: { ...rules, destino: { tipo: destino?.tipo === 'encerrar' ? 'encerrar' : 'humano' }, agendamento: agendamento ? { ...agendamento, owner_id: null } : {} } } }); }
  }
  return <CrmIaEditor title="Modelo reutilizável" onClose={onClose} onSave={() => { if (!draft.nome.trim()) throw new Error('Informe o nome do modelo.'); return mutate('save_template', { ...(row.id && { id: row.id }), nome: draft.nome.trim(), tipo: draft.tipo, nicho: draft.nicho, data: draft.data, revision: row.revision || null }); }}><CrmIaField label="Nome do modelo" value={draft.nome} onChange={value => set('nome', value)} required /><CrmIaField label="Nicho do modelo" value={draft.nicho} onChange={value => set('nicho', value)} /><CrmIaField label="Copiar configuração existente" value={source} onChange={copy} options={[emptyOption('Começar do zero ou manter o conteúdo'), ...choices]} />
    {draft.tipo === 'pipeline' ? <><h3>Etapas do modelo</h3>{(draft.data.stages || []).map((stage, index) => <div className="crm-ia-toolbar" key={index}><CrmIaField label={`Nome da etapa ${index + 1}`} value={stage.nome} onChange={nome => data('stages', draft.data.stages.map((item, i) => i === index ? { ...item, nome } : item))} /><CrmIaField label={`Cor da etapa ${index + 1}`} type="color" value={stage.color || '#286fc9'} onChange={color => data('stages', draft.data.stages.map((item, i) => i === index ? { ...item, color } : item))} /><button type="button" onClick={() => data('stages', draft.data.stages.filter((_, i) => i !== index))}>Remover etapa {index + 1}</button></div>)}<button type="button" onClick={() => data('stages', [...(draft.data.stages || []), { nome: '', color: '#286fc9', tipo: 'intermediaria', ordem: draft.data.stages?.length || 0 }])}>Adicionar etapa ao modelo</button></>
      : draft.tipo === 'base' ? <CrmIaField label="Conteúdo da base do modelo" type="textarea" value={draft.data.conteudo} onChange={value => data('conteudo', value)} rows={12} maxLength={30000} /> : <><CrmIaField label="Tipo de agente do modelo" value={draft.data.funil?.crm_ia?.tipo || 'qualificacao'} onChange={tipo => data('funil', { ...draft.data.funil, crm_ia: { ...draft.data.funil?.crm_ia, tipo } })} options={AGENT_TYPES.map(([value, label]) => ({ value, label }))} /><CrmIaField label="Objetivo do agente do modelo" type="textarea" value={draft.data.objetivo} onChange={value => data('objetivo', value)} /><CrmIaField label="Instruções do agente do modelo" type="textarea" value={draft.data.instrucoes} onChange={value => data('instrucoes', value)} maxLength={8000} /></>}
  </CrmIaEditor>;
}
