import React, { useEffect, useRef, useState } from 'react';
import { CrmIaEditor, CrmIaField, CrmIaState, useCrmRead } from './CrmIaPrimitives';
import { takeCrmIaCalendarCallback } from './crmIaCalendarCallback';

export default function CrmIaGoogleCalendar({ api, clientId }) {
  const [refresh, setRefresh] = useState(0);
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [consentUrl, setConsentUrl] = useState('');
  const [calendars, setCalendars] = useState(null);
  const scope = useRef(0);
  const active = useRef(false);
  const read = useCrmRead(api, 'calendar_status', {}, refresh);
  useEffect(() => { scope.current += 1; active.current = true; return () => { active.current = false; scope.current += 1; }; }, [api]);
  useEffect(() => {
    const callback = takeCrmIaCalendarCallback(clientId);
    if (!callback) return undefined;
    let current = true;
    setPending('finalize'); setError('');
    api('calendar_finalize', callback).then(() => { if (current) setRefresh(value => value + 1); })
      .catch(() => { if (current) setError('Não foi possível concluir esta autorização. Inicie uma nova conexão na mesma sessão.'); })
      .finally(() => { if (current) setPending(''); });
    return () => { current = false; };
  }, [api, clientId]);
  async function run(name, action, payload = {}) {
    if (pending) return null;
    const version = scope.current;
    setPending(name); setError('');
    try { const result = await api(action, payload); return active.current && version === scope.current ? result : null; }
    catch (failure) { if (active.current && version === scope.current) setError(failure.message); return null; }
    finally { if (active.current && version === scope.current) setPending(''); }
  }
  async function connect() {
    const result = await run('connect', 'calendar_connect');
    if (!result) return;
    try {
      const url = new URL(result.url);
      if (url.protocol !== 'https:' || url.hostname !== 'accounts.google.com' || url.pathname !== '/o/oauth2/v2/auth' || url.username || url.password) throw new Error();
      setConsentUrl(url.href);
    } catch { setError('O endereço de autorização do Google não está disponível.'); }
  }
  async function list(pageToken) {
    const result = await run('list', 'calendar_list', pageToken ? { pageToken } : {});
    if (result) setCalendars(previous => ({ ...result, rows: pageToken ? [...(previous?.rows || []), ...result.rows] : result.rows }));
  }
  const connection = read.data;
  return <div className="crm-ia-stack"><p>Conecte sua própria agenda para conferir horários ocupados e sincronizar os compromissos do CRM.</p>
    <p className="crm-ia-muted">O Google recebe os horários com o título “Compromisso Planeje”. Nome do lead, conversa e notas ficam no Planeje.</p>
    <CrmIaState read={read} retry={() => setRefresh(value => value + 1)}>
      <dl className="crm-ia-facts"><div><dt>Conexão</dt><dd>{connection?.connected ? 'Conectada' : connection?.status === 'awaiting_calendar' ? 'Escolha um calendário' : connection?.status === 'error' ? 'Precisa de atenção' : 'Desconectada'}</dd></div>
        {connection?.email && <div><dt>Conta Google</dt><dd>{connection.email}</dd></div>}{connection?.calendar_name && <div><dt>Calendário</dt><dd>{connection.calendar_name}</dd></div>}</dl>
      {connection?.configured === false && <p className="crm-ia-muted">A autorização Google ainda precisa ser preparada neste ambiente. A agenda interna continua disponível.</p>}
      <div className="crm-ia-toolbar"><button type="button" disabled={Boolean(pending) || connection?.configured !== true} onClick={connect}>Conectar Google Agenda</button>
        <button type="button" disabled={Boolean(pending)} onClick={() => { setConsentUrl(''); setRefresh(value => value + 1); }}>Atualizar conexão</button>
        {['connected', 'awaiting_calendar'].includes(connection?.status) && <button type="button" disabled={Boolean(pending)} onClick={() => list()}>Escolher calendário</button>}
        {connection?.status && connection.status !== 'disconnected' && <button type="button" disabled={Boolean(pending)} onClick={async () => { const result = await run('disconnect', 'calendar_disconnect'); if (result) { setConsentUrl(''); setCalendars(null); setRefresh(value => value + 1); } }}>Desconectar Google Agenda</button>}</div>
    </CrmIaState>
    {pending && <p role="status">Consultando Google Agenda…</p>}{error && <p className="crm-ia-error" role="alert">{error}</p>}
    {consentUrl && <p><a className="crm-ia-primary" href={consentUrl} target="_blank" rel="noopener noreferrer">Continuar no Google</a></p>}
    <p className="crm-ia-muted">Desconectar interrompe a sincronização. Compromissos já existentes no Google e a conexão com o Drive são preservados.</p>
    {calendars && <CalendarPicker key={calendars.revision} api={api} calendars={calendars} pending={Boolean(pending)} loadMore={() => list(calendars.next_page_token)} onClose={() => setCalendars(null)} onSaved={() => setRefresh(value => value + 1)} />}
  </div>;
}

function CalendarPicker({ api, calendars, pending, loadMore, onClose, onSaved }) {
  const [selected, setSelected] = useState('');
  return <CrmIaEditor title="Escolher calendário" onClose={onClose} saveLabel="Usar este calendário" disabled={pending} onSave={async () => {
    if (!selected || !calendars.rows?.some(row => row.id === selected)) throw new Error('Escolha um calendário disponível.');
    await api('calendar_select', { calendar_id: selected, revision: calendars.revision }); onSaved();
  }}><CrmIaField label="Calendário Google" value={selected} onChange={setSelected} options={[{ value: '', label: 'Escolha um calendário' }, ...calendars.rows.map(row => ({ value: row.id, label: row.name }))]} />
    {calendars.next_page_token && <button type="button" disabled={pending} onClick={loadMore}>Carregar mais calendários</button>}{!calendars.rows.length && <p>Nenhum calendário com permissão de escrita foi encontrado.</p>}
  </CrmIaEditor>;
}
