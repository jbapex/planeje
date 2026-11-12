import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CrmIaEditor, CrmIaField, CrmIaPagination, CrmIaQueue, CrmIaState, useCrmRead } from './CrmIaPrimitives';
import { calendarStatus, count, dateTime, named, versionOf } from './crmIaPresentation';
import { agendaCivilDate, agendaRange, agendaWeekLayout, shiftAgendaDate } from './crmIaAgendaLayout.js';

const APPOINTMENT_STATUS = { scheduled: 'Reservado no Planeje', confirmed: 'Presença confirmada', cancelled: 'Cancelado', no_show: 'Não compareceu' };
const clockTime = (value, timeZone) => new Intl.DateTimeFormat('pt-BR', { timeZone, hour:'2-digit', minute:'2-digit' }).format(new Date(value));

export default function CrmIaAgenda({ api, mutate, workspace, canManage, revision }) {
  const [params] = useSearchParams();
  const configuredTimezone = workspace.config.data.availability?.timezone || 'America/Sao_Paulo';
  const [date, setDate] = useState(() => agendaCivilDate(new Date(), configuredTimezone));
  const [view, setView] = useState('day');
  const [owner, setOwner] = useState('');
  const [offset, setOffset] = useState(0);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(null);
  const [cancel, setCancel] = useState(null);
  const [absence, setAbsence] = useState(null);
  const [selected, setSelected] = useState(null);
  const [insights, setInsights] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const period = agendaRange(date, view);
  const read = useCrmRead(api, 'agenda', { since:period.since, until:period.until, owner_id:owner, offset, limit:30 }, `${revision}:${reload}`, period.days.length>0, 15000);
  const timezone = read.data?.timezone || configuredTimezone;
  const today = () => agendaCivilDate(new Date(), timezone);
  const chooseDate = value => { setDate(value); setOffset(0); setReceipt(null); };
  const actions = { canManage, onEdit:item => { setSelected(null); setEditing(item); }, onCancel:item => { setSelected(null); setCancel(item); }, onAbsence:item => { setSelected(null); setAbsence(item); } };
  const rows = read.data?.rows || [];
  return <div className="crm-ia-stack"><div className="crm-ia-toolbar">
    <div className="crm-ia-segments" role="group" aria-label="Visualização da agenda">{[['day','Lista'],['week','Semana']].map(([value,label]) => <button type="button" key={value} aria-pressed={view===value} onClick={() => { setView(value); setOffset(0); }}>{label}</button>)}</div>
    <button type="button" onClick={() => chooseDate(shiftAgendaDate(date||today(), view==='week'?-7:-1))} aria-label={view==='week'?'Semana anterior':'Dia anterior'}>←</button>
    <button type="button" onClick={() => chooseDate(today())}>Hoje</button>
    <button type="button" onClick={() => chooseDate(shiftAgendaDate(date||today(), view==='week'?7:1))} aria-label={view==='week'?'Próxima semana':'Próximo dia'}>→</button>
    <CrmIaField label="Dia da agenda" type="date" value={date} onChange={chooseDate} />
    <CrmIaField label="Responsável da agenda" value={owner} onChange={value => { setOwner(value); setOffset(0); }} options={[{value:'',label:'Toda a equipe'},...workspace.people]} />
    <button type="button" aria-expanded={insights} onClick={() => setInsights(value => !value)}>Insights</button>
    <button type="button" onClick={() => setReload(value => value+1)}>Atualizar agenda</button>
    {canManage && <button type="button" className="crm-ia-primary" onClick={() => setEditing({lead_id:params.get('lead_id')||'',owner_id:owner})}>Novo compromisso</button>}
  </div>
    <p className="crm-ia-muted">Horários em {timezone}. <Link to={`/crm-ia/configuracoes?cliente=${encodeURIComponent(workspace.client.id)}&aba=google_calendar`}>Conectar Google Agenda</Link> para conferir horários ocupados e sincronizar compromissos.</p>
    {receipt && <p className="crm-ia-success" role="status">Não comparecimento registrado: {receipt.title}. {receipt.armed ? 'Recuperação programada conforme os prazos e a pausa humana.' : 'Nenhuma recuperação automática foi programada.'}</p>}
    {insights && <section className="crm-ia-card" aria-label="Resumo da agenda"><h2>Resumo do período</h2><p className="crm-ia-muted">{dateTime(period.since)} a {dateTime(period.until)}. Os totais consideram todo o recorte autorizado.</p><dl className="crm-ia-facts">{[['scheduled','Reservados no Planeje'],['confirmed','Presenças confirmadas'],['cancelled','Cancelados'],['no_show','Não compareceram']].map(([key,label]) => <div key={key}><dt>{label}</dt><dd>{count(read.data?.summary?.[key])}</dd></div>)}</dl></section>}
    <section className="crm-ia-card crm-ia-agenda-results">
      {!period.days.length ? <p className="crm-ia-state">Escolha uma data válida para consultar a agenda.</p> : <CrmIaState read={read} retry={() => setReload(value => value+1)} empty={rows.length===0 && view==='day' && 'Nenhum compromisso neste dia.'}>
        {view==='week' ? <CrmIaWeek rows={rows} days={period.days} timezone={timezone} people={workspace.people} onOpen={setSelected} actions={actions} /> : <AppointmentList rows={rows} timezone={timezone} people={workspace.people} actions={actions} />}
        {read.data?.total>30 && <p className="crm-ia-muted">Esta página mostra {rows.length} de {count(read.data.total)} compromissos. Use a paginação para consultar os demais.</p>}
        <CrmIaPagination total={read.data?.total} offset={offset} limit={30} onPage={setOffset} />
      </CrmIaState>}
    </section>
    {selected && <CrmIaEditor title={selected.title||'Compromisso'} description="Horário, observações e situação do compromisso." onClose={() => setSelected(null)}><p>{dateTime(selected.start_at,timezone)} – {dateTime(selected.end_at,timezone)}</p><p>{named(workspace.people.find(person => person.id===selected.owner_id))}</p><p className="crm-ia-prose">{selected.notes||'Sem observações.'}</p><p><span className="crm-ia-badge">{APPOINTMENT_STATUS[selected.status]||'Estado indisponível'}</span></p>{calendarStatus(selected.calendar) && <p>{calendarStatus(selected.calendar)}</p>}<AppointmentActions item={selected} {...actions} /></CrmIaEditor>}
    {editing && <CrmIaAppointmentEditor key={editing.id||'new'} {...{api,mutate,workspace,timezone}} initial={editing} initialDate={editing.start_at?agendaCivilDate(editing.start_at,timezone):date||today()} onClose={() => setEditing(null)} />}
    {cancel && <CrmIaEditor title="Cancelar compromisso" onClose={() => setCancel(null)} saveLabel="Confirmar cancelamento" onSave={() => mutate('cancel_appointment',versionOf(cancel))}><p>{cancel.title} · {dateTime(cancel.start_at,timezone)}</p><p>O compromisso ficará cancelado no histórico. Nenhuma mensagem será enviada por esta confirmação.</p></CrmIaEditor>}
    {absence && <AbsenceEditor key={absence.id} item={absence} workspace={workspace} mutate={mutate} timezone={timezone} onClose={() => setAbsence(null)} onSaved={result => { setReceipt({title:absence.title,armed:result?.recovery?.armed===true}); setReload(value => value+1); }} />}
    <CrmIaQueue {...{api,revision,mutate,canManage}} />
  </div>;
}

function AppointmentActions({item,canManage,onEdit,onCancel,onAbsence}) {
  if (!canManage || item.status==='cancelled') return null;
  return <div className="crm-ia-toolbar"><button type="button" onClick={() => onEdit(item)}>Reagendar compromisso</button><button type="button" onClick={() => onCancel(item)}>Cancelar compromisso</button>
    {['scheduled','confirmed'].includes(item.status) && Date.parse(item.end_at)<=Date.now() && <button type="button" onClick={() => onAbsence(item)}>Não compareceu</button>}
  </div>;
}

function AppointmentList({rows,timezone,people,actions}) {
  return <ul className="crm-ia-list">{rows.map(item => <li key={item.id}><div><strong>{item.title}</strong><p>{dateTime(item.start_at,timezone)} – {dateTime(item.end_at,timezone)} · {named(people.find(person => person.id===item.owner_id))}</p><small>{item.notes}</small>{calendarStatus(item.calendar) && <small>{calendarStatus(item.calendar)}</small>}</div><div><span className="crm-ia-badge">{APPOINTMENT_STATUS[item.status]||'Estado indisponível'}</span><AppointmentActions item={item} {...actions} /></div></li>)}</ul>;
}

function CrmIaWeek({rows,days,timezone,people,onOpen,actions}) {
  const layout = agendaWeekLayout(rows,days,timezone);
  const weekday = date => new Intl.DateTimeFormat('pt-BR',{weekday:'short',timeZone:'UTC'}).format(new Date(`${date}T12:00:00Z`));
  const today = agendaCivilDate(new Date(),timezone);
  return <><h2>Semana de {dateTime(days[0])} a {dateTime(days.at(-1))}</h2><p className="crm-ia-muted">Grade de 7h a 20h. Compromissos fora desse intervalo ficam abaixo.</p>
    <div className="crm-ia-week-scroll" role="region" aria-label="Agenda semanal" tabIndex={0}><div className="crm-ia-week-grid">
      <div className="crm-ia-week-axis-heading">Horário</div>{days.map(date => <h3 key={date} className={`crm-ia-week-date${date===today?' is-today':''}`}>{weekday(date)}<span>{dateTime(date)}</span></h3>)}
      <div className="crm-ia-week-axis" aria-hidden="true">{Array.from({length:14},(_,index) => <span key={index} style={{top:index*60}}>{String(index+7).padStart(2,'0')}:00</span>)}</div>
      {layout.days.map(day => <section key={day.date} className="crm-ia-week-day" aria-label={`Compromissos de ${dateTime(day.date)}`}>
        {!day.events.length && <p className="crm-ia-week-empty">Sem registros nesta página.</p>}
        {day.events.map(event => {const item=event.item;return <button type="button" key={item.id} className={`crm-ia-week-event is-${item.status}`} style={{top:event.top,height:event.height,left:`calc(${event.lane/event.lanes*100}% + 2px)`,width:`calc(${100/event.lanes}% - 4px)`}} onClick={() => onOpen(item)} aria-label={`Abrir compromisso ${item.title}, ${dateTime(item.start_at,timezone)} até ${clockTime(item.end_at,timezone)}, ${named(people.find(person => person.id===item.owner_id))}, ${APPOINTMENT_STATUS[item.status]||'estado indisponível'}`}>
          <strong>{item.title}</strong><span>{clockTime(item.start_at,timezone)}–{clockTime(item.end_at,timezone)}</span><small>{named(people.find(person => person.id===item.owner_id))}</small>
        </button>;})}
      </section>)}
    </div></div>
    {layout.outside.length>0 && <section><h3>Fora da grade visível</h3><AppointmentList rows={layout.outside} {...{timezone,people,actions}} /></section>}
  </>;
}

function AbsenceEditor({item,workspace,mutate,timezone,onClose,onSaved}) {
  const [channel,setChannel] = useState('');
  const recovery = workspace.config.data.concierge?.no_show_recovery===true;
  return <CrmIaEditor title="Registrar não comparecimento" onClose={onClose} saveLabel="Confirmar não comparecimento" onSave={async () => {
    const result = await mutate('mark_appointment_no_show',{...versionOf(item),...(channel && {channel_id:channel})}); onSaved(result);
  }}><p>{item.title} · {dateTime(item.start_at,timezone)}</p><p>A marcação preserva o histórico do compromisso.</p>
    {recovery ? <><CrmIaField label="Canal para eventual recuperação" value={channel} onChange={setChannel} options={[{value:'',label:'Usar o canal do atendimento, quando identificado'},...workspace.channels.filter(row => row.can_send!==false)]} /><p className="crm-ia-muted">A recuperação segue o canal definido, os prazos e a pausa humana. Salvar a ausência não confirma um novo horário.</p></> : <p className="crm-ia-muted">A recuperação automática está desligada nas configurações do Concierge.</p>}
  </CrmIaEditor>;
}

function CrmIaAppointmentEditor({ api, mutate, workspace, initial, initialDate, timezone, onClose }) {
  const [requestId] = useState(() => crypto.randomUUID());
  const [draft, setDraft] = useState({ lead_id: '', owner_id: '', title: '', notes: '', ...initial });
  const [date, setDate] = useState(initialDate);
  const [slot, setSlot] = useState('');
  const [search, setSearch] = useState('');
  const [reload, setReload] = useState(0);
  const leads = useCrmRead(api, 'leads', { search, offset: 0, limit: 100 }, reload);
  const slots = useCrmRead(api, 'slots', { date, owner_id: draft.owner_id, ...(draft.lead_id && { lead_id: draft.lead_id }), ...(initial.id && { appointment_id: initial.id }) }, reload, Boolean(date && draft.owner_id));
  const set = (key, value) => { setDraft(old => ({ ...old, [key]: value })); if (['owner_id', 'lead_id'].includes(key)) setSlot(''); };
  return <CrmIaEditor title={initial.id ? 'Reagendar compromisso' : 'Novo compromisso'} description={`Escolha um horário disponível em ${timezone}. A confirmação depende da reserva no servidor.`} onClose={onClose} saveLabel="Confirmar compromisso" onSave={async () => {
    const chosen = slots.data?.rows?.find(item => item.start_at === slot && item.owner_id === draft.owner_id);
    if (!draft.title.trim() || !draft.lead_id || !chosen) throw new Error('Informe o título, o lead, o responsável e um horário disponível.');
    const lead = leads.data?.rows?.find(item => item.id === draft.lead_id);
    await mutate('save_appointment', { ...versionOf(initial), request_id: initial.request_id || requestId, lead_id: draft.lead_id, contact_id: initial.id ? initial.contact_id || null : lead?.contact_id || null, owner_id: draft.owner_id, title: draft.title.trim(), notes: draft.notes, start_at: chosen.start_at, end_at: chosen.end_at });
  }}><CrmIaField label="Título do compromisso" value={draft.title} onChange={value => set('title', value)} required /><CrmIaField label="Buscar lead para agendar" value={search} onChange={setSearch} disabled={Boolean(initial.id)} /><CrmIaState read={leads} retry={() => setReload(value => value + 1)}><CrmIaField label="Lead do compromisso" value={draft.lead_id} onChange={value => set('lead_id', value)} disabled={Boolean(initial.id)} options={[{ value: '', label: 'Escolha um lead' }, ...(leads.data?.rows || [])]} /></CrmIaState><CrmIaField label="Atendente do compromisso" value={draft.owner_id} onChange={value => set('owner_id', value)} options={[{ value: '', label: 'Escolha uma pessoa' }, ...workspace.people]} /><CrmIaField label="Data do compromisso" type="date" value={date} onChange={value => { setDate(value); setSlot(''); }} />
    {draft.owner_id && <CrmIaState read={slots} retry={() => setReload(value => value + 1)} empty={slots.data?.rows?.length === 0 && 'Nenhum horário livre. Confira a disponibilidade ou escolha outro dia.'}><CrmIaField label="Horário disponível" value={slot} onChange={setSlot} options={[{ value: '', label: 'Escolha um horário' }, ...(slots.data?.rows || []).map(item => ({ value: item.start_at, label: `${dateTime(item.start_at, timezone)} até ${dateTime(item.end_at, timezone)}` }))]} /></CrmIaState>}<CrmIaField label="Notas do compromisso" type="textarea" value={draft.notes} onChange={value => set('notes', value)} />
  </CrmIaEditor>;
}
