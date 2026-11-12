import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { History, Loader2, Plus, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/lib/customSupabaseClient';
import { fetchMiniCrmObservations, saveMiniCrmObservation } from '@/lib/miniCrmObservations';
import './MiniCrmObservation.css';

const NotesContext = createContext(null);
export function MiniCrmNotesProvider({ clienteId, onSaved, onSave, children }) {
  const drafts = useMemo(() => new Map(), [clienteId]);
  const value = useMemo(() => ({ clienteId, onSaved, onSave, drafts }), [clienteId, onSaved, onSave, drafts]);
  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
}

function noteWhen(value) {
  if (!value) return 'Data não registrada';
  return new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
}

function ObservationEditor({ contactId, value = '', label, context, inline = false }) {
  const cached = context.drafts.get(contactId);
  const [draft, setDraft] = useState(cached?.body ?? value);
  const [editing, setEditing] = useState(Boolean(cached));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const historyRequest = useRef(0);
  const nextOffset = useRef(0);
  const requestId = useRef(cached?.requestId || null);
  const textarea = useRef(null);
  const busy = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; historyRequest.current += 1; }; }, []);
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);

  const loadHistory = async (offset = 0) => {
    const token = ++historyRequest.current;
    setLoading(true); setHistoryError('');
    try {
      const result = await fetchMiniCrmObservations(supabase, { clienteId: context.clienteId, contactId, offset });
      if (!alive.current || token !== historyRequest.current) return;
      const rows = offset === 0 && !result.rows.length && value.trim()
        ? [{ id: 'legacy', body: value, kind: 'legacy', created_at: null, author_name: null }]
        : result.rows;
      nextOffset.current = offset + result.rows.length;
      setHistory((previous) => offset ? [...new Map([...previous, ...rows].map((note) => [note.id, note])).values()] : rows);
      setHasMore(result.hasMore);
    } catch (err) {
      if (alive.current && token === historyRequest.current) setHistoryError(err.message || 'Não foi possível carregar o histórico.');
    } finally {
      if (alive.current && token === historyRequest.current) setLoading(false);
    }
  };
  const showHistory = !inline || historyOpen;
  useEffect(() => { if (showHistory) void loadHistory(); else historyRequest.current += 1; }, [showHistory, value]);

  const change = (body) => {
    requestId.current = crypto.randomUUID();
    context.drafts.set(contactId, { body, requestId: requestId.current });
    setDraft(body); setEditing(true); setError(''); setMessage('');
  };
  const save = async () => {
    if (busy.current || !editing || !draft.trim()) return;
    busy.current = true; setSaving(true); setError(''); setMessage('');
    if (!requestId.current) requestId.current = crypto.randomUUID();
    context.drafts.set(contactId, { body: draft, requestId: requestId.current });
    try {
      const params = { clienteId: context.clienteId, contactId, body: draft, requestId: requestId.current };
      const contact = await (context.onSave ? context.onSave(params) : saveMiniCrmObservation(supabase, params));
      context.drafts.delete(contactId);
      requestId.current = null;
      context.onSaved?.(contact);
      if (!alive.current) return;
      setDraft(contact.mini_crm?.observacao || ''); setEditing(false); setMessage('Observação salva.');
      if (showHistory) void loadHistory();
    } catch (err) {
      if (alive.current) setError(err.message || 'Não foi possível salvar. Seu texto foi preservado.');
    } finally {
      busy.current = false; if (alive.current) setSaving(false);
    }
  };

  const historyContent = <section className="mini-crm-observation__history" aria-label="Histórico de observações">
    {!inline ? <h4>Histórico de observações</h4> : null}
    {historyError ? <div role="alert"><p>{historyError}</p><button type="button" onClick={() => void loadHistory()}>Tentar carregar histórico</button></div> : null}
    {!loading && !historyError && !history.length ? <p>Nenhuma observação registrada.</p> : null}
    <ol>{history.map((note) => <li key={note.id}>
      <div><strong>{note.kind === 'legacy' ? 'Observação anterior' : note.author_name || 'Autor não registrado'}</strong><time dateTime={note.created_at || undefined}>{noteWhen(note.created_at)}</time></div>
      {note.kind === 'legacy' ? <small>Autor não registrado</small> : null}
      <p>{note.kind === 'cleared' ? 'Observação limpa.' : note.body}</p>
    </li>)}</ol>
    {loading ? <p role="status">Carregando histórico…</p> : hasMore ? <Button type="button" variant="outline" size="sm" onClick={() => void loadHistory(nextOffset.current)}>Carregar mais observações</Button> : null}
  </section>;

  return <div className="mini-crm-observation">
    <div className="mini-crm-observation__head">
      <strong>{label}</strong>
      <div>
        <button type="button" title="Nova observação" aria-label="Nova observação" disabled={saving || editing} onClick={() => { change(''); textarea.current?.focus(); }}><Plus size={15} />Nova</button>
        {inline ? <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
          <DialogTrigger asChild><button type="button" className="mini-crm-observation__trigger" title="Ver histórico de observações" aria-label="Histórico de observações"><History size={18} aria-hidden="true" /></button></DialogTrigger>
          <DialogContent className="mini-crm-observation-dialog">
            <DialogHeader><DialogTitle>Histórico de observações</DialogTitle><DialogDescription>Observações registradas neste lead, com data e autor quando disponíveis.</DialogDescription></DialogHeader>
            {historyContent}
          </DialogContent>
        </Dialog> : null}
      </div>
    </div>
    <textarea ref={textarea} rows={3} aria-label={label} value={draft} maxLength={10000} disabled={saving}
      placeholder="Escreva uma observação…" onChange={(event) => change(event.target.value)}
      onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void save(); } }} />
    <div className="mini-crm-observation__save">
      <small>{editing ? 'Rascunho · salve para registrar.' : 'Salvar registra data e autor.'}</small>
      {editing ? <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => {
        context.drafts.delete(contactId); requestId.current = null; setDraft(value); setEditing(false); setError(''); setMessage('');
      }}>Cancelar observação</Button> : null}
      <Button type="button" size="sm" variant="outline" disabled={saving || !editing || !draft.trim()} onClick={() => void save()}>
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} {saving ? 'Salvando…' : 'Salvar observação'}
      </Button>
    </div>
    {error ? <p className="mini-crm-observation__error" role="alert">{error}</p> : <span className="mini-crm-observation__status" role="status">{message}</span>}
    {!inline ? historyContent : null}
  </div>;
}

export default function MiniCrmObservation({ contactId, value = '', label = 'Observação', compact = false }) {
  const context = useContext(NotesContext);
  if (!context?.clienteId || !contactId) return null;
  const editor = <ObservationEditor key={`${context.clienteId}:${contactId}`} contactId={contactId} value={String(value || '')} label={label} context={context} inline={!compact} />;
  if (!compact) return editor;
  return <div className="mini-crm-observation-entry mini-crm-observation-entry--compact">
    <Dialog>
      <DialogTrigger asChild><button type="button" className="mini-crm-observation__trigger" title="Ver histórico e registrar observação" aria-label="Observações do lead">
        <History size={18} aria-hidden="true" />
      </button></DialogTrigger>
      <DialogContent className="mini-crm-observation-dialog">
        <DialogHeader><DialogTitle>Observações do lead</DialogTitle><DialogDescription>Consulte o histórico ou registre uma nova observação.</DialogDescription></DialogHeader>
        {editor}
      </DialogContent>
    </Dialog>
  </div>;
}
