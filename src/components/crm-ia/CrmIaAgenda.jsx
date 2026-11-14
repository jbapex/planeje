import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BarChart3, CalendarDays, ChevronLeft, ChevronRight, Plus, RefreshCw, Settings2 } from 'lucide-react';
import { CrmIaEditor, CrmIaField, CrmIaPagination, CrmIaQueue, CrmIaState, useCrmRead } from './CrmIaPrimitives';
import { calendarStatus, count, dateTime, named, versionOf } from './crmIaPresentation';
import { agendaCivilDate, agendaRange, agendaSlotAt, agendaWeekLayout, shiftAgendaDate, shiftAgendaMonth } from './crmIaAgendaLayout.js';
import { readAgendaCalendar } from './crmIaAgendaRead.js';
import { CrmIaAvailabilityRules, CrmIaAvailabilitySchedule, CRM_IA_AVAILABILITY_DEFAULTS } from './CrmIaSettings';

const APPOINTMENT_STATUS = { scheduled: 'Reservado no Planeje', confirmed: 'Presença confirmada', cancelled: 'Cancelado', no_show: 'Não compareceu' };
const clockTime = (value, timeZone) => new Intl.DateTimeFormat('pt-BR', { timeZone, hour:'2-digit', minute:'2-digit' }).format(new Date(value));

export default function CrmIaAgenda({ api, mutate, workspace, canManage, revision }) {
  const [params,setParams] = useSearchParams();
  const configuredTimezone = workspace.config.data.availability?.timezone || 'America/Sao_Paulo';
  const date=params.has('agenda_date')?params.get('agenda_date'):agendaCivilDate(new Date(),configuredTimezone);
  const view=['day','week','month','list'].includes(params.get('agenda_view'))?params.get('agenda_view'):'week';
  const owner=workspace.people.some(person=>person.id===params.get('agenda_owner'))?params.get('agenda_owner'):'';
  const [offset, setOffset] = useState(0);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(null);
  const [cancel, setCancel] = useState(null);
  const [absence, setAbsence] = useState(null);
  const [selected, setSelected] = useState(null);
  const [insights, setInsights] = useState(false);
  const [availability, setAvailability] = useState(false);
  const [availabilitySaved, setAvailabilitySaved] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const period = agendaRange(date, view);
  const calendarApi = useCallback((_action,payload)=>readAgendaCalendar(api,payload),[api]);
  const readRevision = `${workspace.client.id}:${revision}:${reload}`;
  const read = useCrmRead(view==='list'?api:calendarApi, 'agenda', { since:period.since, until:period.until, owner_id:owner, offset:view==='list'?offset:0, limit:view==='list'?30:200 }, readRevision, period.days.length>0, 15000);
  const monthStart = period.days.length ? `${date.slice(0,7)}-01` : '';
  const monthEnd = monthStart ? shiftAgendaDate(shiftAgendaMonth(monthStart,1),-1) : '';
  const insightsRead = useCrmRead(api,'agenda',{since:monthStart,until:monthEnd,owner_id:owner,offset:0,limit:1},readRevision,insights&&Boolean(monthStart),15000);
  const timezone = read.data?.timezone || configuredTimezone;
  const today = () => agendaCivilDate(new Date(), timezone);
  const choose = (key,value) => setParams(previous=>{const next=new URLSearchParams(previous);next.set(key,value);return next;});
  const chooseDate = value => { choose('agenda_date',value);setOffset(0);setReceipt(null); };
  const actions = { canManage, onEdit:item => { setSelected(null); setEditing(item); }, onCancel:item => { setSelected(null); setCancel(item); }, onAbsence:item => { setSelected(null); setAbsence(item); } };
  const rows = read.data?.rows || [];
  const create = (day=date||today(),time) => setEditing({lead_id:params.get('lead_id')||'',owner_id:owner,date:day,preferred_time:time});
  const move = direction => chooseDate(view==='month'?shiftAgendaMonth(date||today(),direction):shiftAgendaDate(date||today(),direction*(view==='week'?7:1)));
  const periodLabel = !period.days.length ? 'Escolha uma data' : view==='month'
    ? new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC',month:'long',year:'numeric'}).format(new Date(`${date}T12:00:00Z`))
    : new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC',dateStyle:'long'}).formatRange(new Date(`${period.since}T12:00:00Z`),new Date(`${period.until}T12:00:00Z`));
  const onCreate = canManage&&read.data?.complete===true ? create : undefined;
  return <div className="crm-ia-stack crm-ia-agenda"><div className="crm-ia-agenda-toolbar">
    <div className="crm-ia-toolbar">
    <button type="button" onClick={() => chooseDate(today())}>Hoje</button>
    <div className="crm-ia-segments" role="group" aria-label="Visualização da agenda">{[['day','Dia'],['week','Semana'],['month','Mês'],['list','Lista']].map(([value,label]) => <button type="button" key={value} aria-pressed={view===value} onClick={() => { choose('agenda_view',value);setOffset(0); }}>{label}</button>)}</div>
    <div className="crm-ia-agenda-navigation" role="group" aria-label="Navegar pelo calendário"><button type="button" onClick={()=>move(-1)} aria-label={view==='month'?'Mês anterior':view==='week'?'Semana anterior':'Dia anterior'}><ChevronLeft size={16} aria-hidden="true" /></button><button type="button" onClick={()=>move(1)} aria-label={view==='month'?'Próximo mês':view==='week'?'Próxima semana':'Próximo dia'}><ChevronRight size={16} aria-hidden="true" /></button></div>
    <strong className="crm-ia-agenda-period" aria-live="polite">{periodLabel}</strong>
    <div className="crm-ia-agenda-date-control"><CrmIaField label="Dia da agenda" type="date" value={date} onChange={chooseDate} /></div>
    </div><div className="crm-ia-toolbar">
    <Link className="crm-ia-link-button" to={`/crm-ia/configuracoes?cliente=${encodeURIComponent(workspace.client.id)}&aba=google_calendar`}><CalendarDays size={15} aria-hidden="true" />Google Agenda</Link>
    <button type="button" aria-expanded={insights} onClick={() => setInsights(value => !value)}><BarChart3 size={15} aria-hidden="true" />Insights do mês</button>
    <button type="button" aria-label="Atualizar agenda" title="Atualizar agenda" onClick={() => setReload(value => value+1)}><RefreshCw size={15} aria-hidden="true" /></button>
    {canManage && <><button type="button" onClick={()=>{setAvailabilitySaved(false);setAvailability(true);}}><Settings2 size={15} aria-hidden="true" />Disponibilidade</button><button type="button" className="crm-ia-primary" onClick={() => create()}><Plus size={16} aria-hidden="true" />Novo compromisso</button></>}
    </div>
  </div>
    <div className="crm-ia-agenda-filters"><CrmIaField label="Responsável da agenda" value={owner} onChange={value=>{choose('agenda_owner',value);setOffset(0);}} options={[{value:'',label:'Toda a equipe'},...workspace.people]} /><span className="crm-ia-muted">Horários em {timezone}. {read.data&&`${count(read.data.total)} ${read.data.total===1?'compromisso':'compromissos'} no período.`}</span></div>
    {availabilitySaved&&<p className="crm-ia-success" role="status">Disponibilidade atualizada. Os horários serão conferidos novamente antes de reservar.</p>}
    {receipt && <p className="crm-ia-success" role="status">Não comparecimento registrado: {receipt.title}. {receipt.armed ? 'Recuperação programada conforme os prazos e a pausa humana.' : 'Nenhuma recuperação automática foi programada.'}</p>}
    {insights && <section className="crm-ia-card" aria-label="Resumo da agenda"><h2>Resumo do mês</h2><p className="crm-ia-muted">{dateTime(monthStart)} a {dateTime(monthEnd)}. Os totais consideram todo o recorte autorizado.</p><CrmIaState read={insightsRead} retry={()=>setReload(value=>value+1)}><dl className="crm-ia-facts">{[['scheduled','Reservados no Planeje'],['confirmed','Presenças confirmadas'],['cancelled','Cancelados'],['no_show','Não compareceram']].map(([key,label]) => <div key={key}><dt>{label}</dt><dd>{count(insightsRead.data?.summary?.[key])}</dd></div>)}</dl></CrmIaState></section>}
    <section className="crm-ia-card crm-ia-agenda-results">
      {!period.days.length ? <p className="crm-ia-state">Escolha uma data válida para consultar a agenda.</p> : <CrmIaState read={read} retry={() => setReload(value => value+1)} empty={rows.length===0 && view==='list' && 'Nenhum compromisso neste dia.'}>
        {view!=='list'&&read.data?.complete===false&&<p role="alert" className="crm-ia-error">A grade mostra {count(rows.length)} de {count(read.data.total)} compromissos. Escolha um responsável ou um período menor para carregar a agenda completa.</p>}
        {view==='month' ? <CrmIaMonth {...{rows,date,timezone,onCreate}} people={workspace.people} days={period.days} onOpen={setSelected} /> : view!=='list' ? <CrmIaWeek rows={rows} days={period.days} timezone={timezone} people={workspace.people} onOpen={setSelected} actions={actions} onCreate={onCreate} /> : <AppointmentList rows={rows} timezone={timezone} people={workspace.people} actions={actions} />}
        {view==='list'&&<CrmIaPagination total={read.data?.total} offset={offset} limit={30} onPage={setOffset} />}
      </CrmIaState>}
    </section>
    {selected && <CrmIaEditor title={selected.title||'Compromisso'} description="Horário, observações e situação do compromisso." onClose={() => setSelected(null)}><p>{dateTime(selected.start_at,timezone)} – {dateTime(selected.end_at,timezone)}</p><p>{named(workspace.people.find(person => person.id===selected.owner_id))}</p><p className="crm-ia-prose">{selected.notes||'Sem observações.'}</p><p><span className="crm-ia-badge">{APPOINTMENT_STATUS[selected.status]||'Estado indisponível'}</span></p>{calendarStatus(selected.calendar) && <p>{calendarStatus(selected.calendar)}</p>}<AppointmentActions item={selected} {...actions} /></CrmIaEditor>}
    {editing && <CrmIaAppointmentEditor key={editing.id||'new'} {...{api,mutate,workspace,timezone,canManage,revision}} initial={editing} initialDate={editing.date||(editing.start_at?agendaCivilDate(editing.start_at,timezone):date||today())} onAvailability={()=>setAvailability(true)} onClose={() => setEditing(null)} />}
    {availability&&<CrmIaAgendaAvailability {...{workspace,mutate,canManage}} onClose={()=>setAvailability(false)} onSaved={()=>{setAvailabilitySaved(true);setReload(value=>value+1);}} />}
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

function CrmIaWeek({rows,days,timezone,people,onOpen,actions,onCreate}) {
  const layout = agendaWeekLayout(rows,days,timezone);
  const weekday = date => new Intl.DateTimeFormat('pt-BR',{weekday:'short',timeZone:'UTC'}).format(new Date(`${date}T12:00:00Z`));
  const today = agendaCivilDate(new Date(),timezone);
  return <><p className="crm-ia-muted crm-ia-agenda-caption">{onCreate?'Clique em um horário para preparar um compromisso. Os horários livres serão conferidos antes da reserva.':'Selecione um compromisso para abrir os detalhes.'}</p>
    <div className={`crm-ia-week-scroll${days.length===1?' is-day':''}`} role="region" aria-label={days.length===1?'Agenda do dia':'Agenda semanal'} tabIndex={0}><div className="crm-ia-week-grid">
      <div className="crm-ia-week-axis-heading">Horário</div>{days.map(date => <h3 key={date} className={`crm-ia-week-date${date===today?' is-today':''}`}>{weekday(date)}<span>{dateTime(date)}</span></h3>)}
      <div className="crm-ia-week-axis" aria-hidden="true">{Array.from({length:14},(_,index) => <span key={index} style={{top:index*60}}>{String(index+7).padStart(2,'0')}:00</span>)}</div>
      {layout.days.map(day => <section key={day.date} className="crm-ia-week-day" aria-label={`Compromissos de ${dateTime(day.date)}`}>
        {onCreate&&Array.from({length:14},(_,index)=>{const time=`${String(index+7).padStart(2,'0')}:00`;return <button type="button" className="crm-ia-calendar-slot" key={time} style={{top:index*60}} aria-label={`Novo compromisso em ${dateTime(day.date)} às ${time}`} onClick={()=>onCreate(day.date,time)} />;})}
        {day.events.map(event => {const item=event.item;return <button type="button" key={item.id} className={`crm-ia-week-event is-${item.status}`} style={{top:event.top,height:event.height,left:`calc(${event.lane/event.lanes*100}% + 2px)`,width:`calc(${100/event.lanes}% - 4px)`}} onClick={() => onOpen(item)} aria-label={`Abrir compromisso ${item.title}, ${dateTime(item.start_at,timezone)} até ${clockTime(item.end_at,timezone)}, ${named(people.find(person => person.id===item.owner_id))}, ${APPOINTMENT_STATUS[item.status]||'estado indisponível'}`}>
          <strong>{item.title}</strong><span>{clockTime(item.start_at,timezone)}–{clockTime(item.end_at,timezone)}</span><small>{named(people.find(person => person.id===item.owner_id))}</small>
        </button>;})}
      </section>)}
    </div></div>
    {layout.outside.length>0 && <section><h3>Fora da grade visível</h3><AppointmentList rows={layout.outside} {...{timezone,people,actions}} /></section>}
  </>;
}

function CrmIaMonth({rows,days,date,timezone,people,onOpen,onCreate}) {
  const today=agendaCivilDate(new Date(),timezone);
  const byDay=new Map(days.map(day=>[day,[]]));
  for(const item of rows)byDay.get(agendaCivilDate(item.start_at,timezone))?.push(item);
  return <div className="crm-ia-month-scroll" role="region" aria-label="Agenda mensal" tabIndex={0}><div className="crm-ia-month-grid">
    {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(day=><div className="crm-ia-month-heading" key={day}>{day}</div>)}
    {days.map(day=><section key={day} className={`crm-ia-month-day${day.slice(0,7)!==date.slice(0,7)?' is-adjacent':''}${day===today?' is-today':''}`} aria-label={`Compromissos de ${dateTime(day)}`}>
      {onCreate?<button type="button" className="crm-ia-month-create" aria-label={`Novo compromisso em ${dateTime(day)}`} onClick={()=>onCreate(day)}><span>{Number(day.slice(-2))}</span></button>:<span className="crm-ia-month-number">{Number(day.slice(-2))}</span>}
      <ul>{byDay.get(day).map(item=><li key={item.id}><button type="button" className={`crm-ia-month-event is-${item.status}`} onClick={()=>onOpen(item)} aria-label={`Abrir compromisso ${item.title}, ${dateTime(item.start_at,timezone)}, ${named(people.find(person=>person.id===item.owner_id))}, ${APPOINTMENT_STATUS[item.status]||'estado indisponível'}`}><time dateTime={item.start_at}>{clockTime(item.start_at,timezone)}</time><strong>{item.title}</strong></button></li>)}</ul>
    </section>)}
  </div></div>;
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

function CrmIaAgendaAvailability({workspace,mutate,canManage,onClose,onSaved}) {
  const [source]=useState(()=>({clientId:workspace.client.id,revision:workspace.config.revision}));
  const [draft,setDraft]=useState(()=>({...CRM_IA_AVAILABILITY_DEFAULTS,...workspace.config.data.availability}));
  const context=useRef();context.current={clientId:workspace.client.id,canManage};
  const mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const allowed=canManage&&source.clientId===workspace.client.id;
  const set=(key,value)=>{if(context.current.canManage&&context.current.clientId===source.clientId)setDraft(old=>({...old,[key]:value}));};
  return <CrmIaEditor className="crm-ia-availability-editor" title="Disponibilidade da equipe" description="Janelas semanais e exceções usam a mesma configuração da equipe. Salvar não ativa envios automáticos." {...{onClose}} disabled={!allowed} saveLabel="Salvar disponibilidade" onSave={async()=>{
    if(!context.current.canManage||context.current.clientId!==source.clientId)throw new Error('O acesso à configuração mudou. Abra a conta novamente.');
    if(!(draft.windows||[]).every(row=>row.owner_id&&row.days?.length&&row.start&&row.start<row.end))throw new Error('Confira o responsável, os dias e os horários de cada janela.');
    try{new Intl.DateTimeFormat('pt-BR',{timeZone:draft.timezone}).format();}catch{throw new Error('Informe um fuso válido para a disponibilidade.');}
    const saved=await mutate('save_config',{section:'availability',data:draft,revision:source.revision});
    if(!saved?.revision||saved.revision===source.revision)throw new Error('A gravação não teve confirmação de uma nova versão. Atualize a conta antes de tentar novamente.');
    if(mounted.current&&context.current.clientId===source.clientId&&context.current.canManage)onSaved();
  }}><p className="crm-ia-muted">Horários em {draft.timezone||'America/Sao_Paulo'}.</p><CrmIaAvailabilitySchedule {...{draft,set}} people={workspace.people} /><details><summary>Duração e regras de agenda</summary><CrmIaAvailabilityRules {...{draft,set}} /></details></CrmIaEditor>;
}

function CrmIaAppointmentEditor({ api, mutate, workspace, initial, initialDate, timezone, onClose, onAvailability, canManage, revision }) {
  const [requestId] = useState(() => crypto.randomUUID());
  const [draft, setDraft] = useState({ lead_id: '', owner_id: '', title: '', notes: '', ...initial });
  const [date, setDate] = useState(initialDate);
  const [slot, setSlot] = useState('');
  const [preferredTime,setPreferredTime]=useState(initial.preferred_time||'');
  const [search, setSearch] = useState('');
  const [reload, setReload] = useState(0);
  const leads = useCrmRead(api, 'leads', { search, offset: 0, limit: 100 }, reload);
  const slots = useCrmRead(api, 'slots', { date, owner_id: draft.owner_id, ...(draft.lead_id && { lead_id: draft.lead_id }), ...(initial.id && { appointment_id: initial.id }) }, `${revision}:${workspace.config.revision}:${reload}`, Boolean(date && draft.owner_id));
  const zone=slots.data?.timezone||timezone;
  const preferredSlot=useMemo(()=>preferredTime&&slots.data?agendaSlotAt(slots.data.rows,{date,time:preferredTime,owner_id:draft.owner_id},zone):'',[preferredTime,slots.data,date,draft.owner_id,zone]);
  const selectedSlot=slot&&slots.data?.rows?.some(item=>item.start_at===slot&&item.owner_id===draft.owner_id)?slot:preferredSlot;
  useEffect(()=>{
    if(!slots.data)return;
    if(slot&&!slots.data.rows?.some(item=>item.start_at===slot&&item.owner_id===draft.owner_id))setSlot('');
  },[slots.data,slot,draft.owner_id]);
  const set = (key, value) => { setDraft(old => ({ ...old, [key]: value })); if (['owner_id', 'lead_id'].includes(key)) {setSlot('');if(key==='lead_id'||draft.owner_id)setPreferredTime('');} };
  return <CrmIaEditor className="crm-ia-appointment-editor" title={initial.id ? 'Reagendar compromisso' : 'Novo compromisso'} description={`Escolha um horário disponível em ${zone}. A confirmação depende da reserva no servidor.`} onClose={onClose} disabled={!canManage} saveLabel="Confirmar compromisso" onSave={async () => {
    const chosen = slots.data?.rows?.find(item => item.start_at === selectedSlot && item.owner_id === draft.owner_id);
    if (!draft.title.trim() || (!initial.id&&!draft.lead_id) || !chosen) throw new Error('Informe o título, o lead, o responsável e um horário disponível.');
    const lead = leads.data?.rows?.find(item => item.id === draft.lead_id);
    if(!initial.id&&!lead)throw new Error('Selecione novamente o lead para confirmar o compromisso.');
    await mutate('save_appointment', { ...versionOf(initial), request_id: initial.request_id || requestId, lead_id: draft.lead_id, contact_id: initial.id ? initial.contact_id || null : lead?.contact_id || null, owner_id: draft.owner_id, title: draft.title.trim(), notes: draft.notes, start_at: chosen.start_at, end_at: chosen.end_at });
  }}><CrmIaField label="Título do compromisso" value={draft.title} onChange={value => set('title', value)} required /><CrmIaField label="Buscar lead para agendar" value={search} onChange={value=>{setSearch(value);set('lead_id','');}} disabled={Boolean(initial.id)} /><CrmIaState read={leads} retry={() => setReload(value => value + 1)}><CrmIaField label="Lead do compromisso" value={draft.lead_id} onChange={value => set('lead_id', value)} disabled={Boolean(initial.id)} options={[{ value: '', label: 'Escolha um lead' }, ...(leads.data?.rows || [])]} /></CrmIaState><CrmIaField label="Atendente do compromisso" value={draft.owner_id} onChange={value => set('owner_id', value)} options={[{ value: '', label: 'Escolha uma pessoa' }, ...workspace.people]} /><CrmIaField label="Data do compromisso" type="date" value={date} onChange={value => { setDate(value);setSlot('');setPreferredTime(''); }} />
    {preferredTime&&slots.data&&!slots.pending&&!selectedSlot&&<p className="crm-ia-muted" role="status">O horário {preferredTime} está indisponível ou é ambíguo neste fuso. Escolha uma vaga atual.</p>}
    {draft.owner_id && <CrmIaState read={slots} retry={() => setReload(value => value + 1)} empty={slots.data?.rows?.length === 0 && 'Nenhum horário livre. Confira a disponibilidade ou escolha outro dia.'}><CrmIaField label="Horário disponível" value={selectedSlot} onChange={value=>{setSlot(value);setPreferredTime('');}} options={[{ value: '', label: 'Escolha um horário' }, ...(slots.data?.rows || []).map(item => ({ value: item.start_at, label: `${dateTime(item.start_at, zone)} até ${dateTime(item.end_at, zone)} (${new Intl.DateTimeFormat('pt-BR',{timeZone:zone,timeZoneName:'shortOffset'}).formatToParts(new Date(item.start_at)).find(part=>part.type==='timeZoneName')?.value})` }))]} /></CrmIaState>}
    {canManage&&<button type="button" onClick={onAvailability}>Conferir disponibilidade</button>}<CrmIaField label="Notas do compromisso" type="textarea" value={draft.notes} onChange={value => set('notes', value)} />
  </CrmIaEditor>;
}
