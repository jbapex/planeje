import React, { forwardRef, useImperativeHandle, useEffect, useRef, useState } from 'react';
import { FileText, Plus, Save, Menu, X, Paperclip, History, Archive } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import PlanRichTextEditor from './PlanRichTextEditor';
import GoogleDrivePickerDialog from '@/components/tasks/details/GoogleDrivePickerDialog';
import { DOCUMENT_KINDS, DOCUMENT_STATES, documentPayload, documentMatches } from '@/lib/clientDocumentRecords';
import { validHttpUrl } from '@/lib/clientDocumentRecords';
import { sanitizeRichTextHtml } from '@/lib/richText';

const fingerprint = (record) => JSON.stringify(documentPayload(record));
const dateLabel = (value) => value ? new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString('pt-BR') : '';
const selectClass = 'h-9 w-full rounded-md border bg-background px-2 text-sm';
const ProjectDocuments = forwardRef(function ProjectDocuments({ client, projectId = '' }, ref) {
  const { user } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [draft, setDraft] = useState(null);
  const [baseline, setBaseline] = useState('');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [archived, setArchived] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [projects, setProjects] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [versions, setVersions] = useState([]);
  const [history, setHistory] = useState(false);
  const [version, setVersion] = useState(null);
  const [drive, setDrive] = useState(false);
  const [link, setLink] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);
  const dirty = Boolean(draft && fingerprint(draft) !== baseline);
  useEffect(() => {
    let active = true;
    request.current += 1; setDraft(null); setBaseline(''); setLoading(true); setError(''); setVersions([]); setVersion(null);
    Promise.all([
      supabase.from('client_documents').select('id,title,record_meta,revision,archived_at,created_at,apexia_access').eq('client_id', client.id).order('created_at', { ascending: false }),
      supabase.from('projetos').select('id,name').eq('client_id', client.id),
      supabase.from('cliente_reunioes').select('id,titulo,marcada_para').eq('cliente_id', client.id).order('marcada_para', { ascending: false }),
    ]).then(([docs, plans, calls]) => { if (!active) return; setError(docs.error?.message || plans.error?.message || calls.error?.message || ''); setDocuments((docs.data || []).filter(doc => Object.keys(doc.record_meta || {}).length)); setProjects(plans.data || []); setMeetings(calls.data || []); setLoading(false); });
    return () => { active = false; request.current += 1; };
  }, [client.id]);
  useEffect(() => {
    const guard = (event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);
  const draftKey = (id) => `cs-document-${user.id}-${id}`;
  useEffect(() => { if (!draft) return; try { if (dirty) sessionStorage.setItem(draftKey(draft.id), JSON.stringify(draft)); else sessionStorage.removeItem(draftKey(draft.id)); } catch { /* Navigation guard remains available. */ } }, [draft, dirty]);
  const canLeave = () => !busy && (!dirty || window.confirm('Há alterações sem salvar. Sair e manter o rascunho nesta aba para continuar depois?'));
  useImperativeHandle(ref, () => ({ canLeave }), [dirty, busy]);
  const select = async (id, discard = false) => {
    if (busy || (!discard && !canLeave())) return;
    const serial = ++request.current; setError('');
    const { data, error: failure } = await supabase.from('client_documents').select('*').eq('id', id).eq('client_id', client.id).single();
    if (serial !== request.current) return;
    if (failure) { setError(failure.message); return; }
    let restored; try { if (discard) sessionStorage.removeItem(draftKey(data.id)); else restored = JSON.parse(sessionStorage.getItem(draftKey(data.id))); } catch { /* No local draft. */ }
    setDraft(restored || data); setBaseline(fingerprint(data)); if (restored) setError('Rascunho recuperado nesta aba. Confira antes de salvar; se houver uma versão mais recente, copie seus ajustes e reabra o documento.'); setVersions([]); setVersion(null); setHistory(false); setSidebar(false);
  };
  const create = async () => {
    if (busy || !canLeave()) return;
    setBusy(true); setError('');
    const { data, error: failure } = await supabase.from('client_documents').insert({ client_id: client.id, owner_id: user.id, title: 'Novo documento', content: { text_content: '' }, record_meta: { kind: 'note', state: 'draft', date: new Date().toLocaleDateString('en-CA'), project_id: projectId, attachments: [] }, apexia_access: false }).select('*').single();
    setBusy(false);
    if (failure) { setError(failure.message); return; }
    setDocuments((rows) => [data, ...rows]); setDraft(data); setBaseline(fingerprint(data)); setVersions([]); setVersion(null); setHistory(false); setArchived(false); setKind('all'); setQuery(''); setSidebar(false);
  };
  const updateMeta = (key, value) => setDraft((current) => ({ ...current, record_meta: { ...current.record_meta, [key]: value } }));
  const save = async (record = draft) => {
    if (!record || busy) return false;
    const savedFrom = fingerprint(draft);
    setBusy(true); setError('');
    const payload = documentPayload(record);
    const { data, error: failure } = await supabase.rpc('cs_save_document', { p_id: record.id, p_revision: record.revision, p_data: payload });
    setBusy(false);
    if (failure) { setError(failure.message); return false; }
    setDraft((current) => current?.id === record.id && fingerprint(current) === savedFrom ? data : current?.id === record.id ? { ...current, revision: data.revision } : current);
    setBaseline(fingerprint(data)); setDocuments((rows) => rows.map((row) => row.id === data.id ? data : row)); setVersions([]); setVersion(null); setHistory(false); return true;
  };
  const loadHistory = async () => {
    setHistory(!history); setError('');
    if (!history) {
      const serial = request.current;
      const { data, error: failure } = await supabase.from('client_document_versions').select('id,revision,title,content,record_meta,saved_at').eq('document_id', draft.id).order('revision', { ascending: false }).limit(100);
      if (serial !== request.current) return;
      if (failure) setError(failure.message); else setVersions(data || []);
    }
  };
  const addAttachment = (file) => setDraft(current => ({ ...current, record_meta: { ...current.record_meta, attachments: [...(current.record_meta?.attachments || []), { id: crypto.randomUUID(), ...file }] } }));
  const upload = async (file) => {
    if (!file || busy) return;
    if (file.size > 50 * 1024 * 1024) { setError('Para arquivos acima de 50 MB, use Google Drive ou adicione o link.'); return; }
    setBusy(true); setError('');
    const path = `${draft.id}/${crypto.randomUUID()}/${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error: failure } = await supabase.storage.from('client-records').upload(path, file, { upsert: false });
    setBusy(false);
    if (failure) setError(failure.message); else addAttachment({ name: file.name, path, size: file.size });
  };
  const openFile = async (file) => {
    if (file.url) { if (validHttpUrl(file.url)) window.open(file.url, '_blank', 'noopener,noreferrer'); return; }
    const { data, error: failure } = await supabase.storage.from('client-records').createSignedUrl(file.path, 60, { download: file.name });
    if (failure) setError(failure.message); else { const a = document.createElement('a'); a.href = data.signedUrl; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.click(); }
  };
  const meta = draft?.record_meta || {};
  return <div className="relative flex h-full min-h-0 overflow-hidden rounded-xl border bg-background">
    <aside className={`${sidebar ? 'absolute inset-y-0 left-0 z-20 shadow-xl' : 'hidden'} w-64 shrink-0 flex-col border-r bg-background md:relative md:flex`}>
      <div className="space-y-2 border-b p-3"><div className="flex justify-between"><strong>Documentos do cliente</strong><Button variant="ghost" size="icon" className="h-6 w-6 md:hidden" onClick={() => setSidebar(false)} aria-label="Fechar lista de documentos"><X className="h-4 w-4" /></Button></div><Button className="w-full" disabled={busy} onClick={create}><Plus className="mr-2 h-4 w-4" />Novo documento</Button><Input aria-label="Buscar documento" placeholder="Buscar por título ou data" value={query} onChange={(e) => setQuery(e.target.value)} /><select className={selectClass} aria-label="Tipo de documento" value={kind} onChange={(e) => setKind(e.target.value)}><option value="all">Todos os tipos</option>{Object.entries(DOCUMENT_KINDS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />Ver arquivados</label></div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">{loading && <p className="p-3 text-sm">Carregando…</p>}{documents.filter((doc) => documentMatches(doc, query, kind, archived)).map((doc) => <button key={doc.id} type="button" onClick={() => select(doc.id)} className={`mb-1 block w-full rounded-lg p-3 text-left ${draft?.id === doc.id ? 'bg-primary/10' : 'hover:bg-muted'}`}><span className="block truncate text-sm font-medium">{doc.title}</span><span className="text-xs text-muted-foreground">{DOCUMENT_KINDS[doc.record_meta?.kind || 'note']} · {dateLabel(doc.record_meta?.date || doc.created_at)}</span></button>)}</div>
    </aside>
    <main className="min-w-0 flex-1 overflow-y-auto p-4 md:p-6">
      <Button className="mb-3 md:hidden" size="sm" variant="outline" onClick={() => setSidebar(true)}><Menu className="mr-2 h-4 w-4" />Documentos</Button>
      {error && <p role="alert" className="mb-3 rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
      {!draft ? <div className="flex h-64 flex-col items-center justify-center gap-3 text-center"><FileText className="h-8 w-8 text-muted-foreground" /><p>Reuniões, arquivos e combinados deste cliente.</p><Button onClick={create} disabled={busy}>Criar documento</Button></div> : <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{dirty ? 'Alterações sem salvar' : `Versão ${draft.revision || 0} salva`}</span><div className="flex gap-2"><Button variant="ghost" size="sm" disabled={busy || !dirty} onClick={() => { if (window.confirm("Descartar o rascunho e abrir a versão salva?")) select(draft.id, true); }}>Reabrir versão salva</Button><Button variant="ghost" size="sm" onClick={loadHistory}><History className="mr-1 h-4 w-4" />Histórico</Button><Button size="sm" onClick={() => save()} disabled={busy || !dirty}><Save className="mr-1 h-4 w-4" />{busy ? 'Salvando…' : 'Salvar versão'}</Button></div></div>
        <Input aria-label="Título do documento" value={draft.title || ''} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="text-lg font-semibold" />
        <label className="block space-y-1 text-xs">Pasta / assunto<Input aria-label="Pasta ou assunto do documento" placeholder="Campanhas / Novembro" value={meta.folder || ''} onChange={(e) => updateMeta('folder', e.target.value)} /></label>
        <div className="grid gap-3 sm:grid-cols-3"><label className="space-y-1 text-xs">Tipo<select className={selectClass} value={meta.kind || 'note'} onChange={(e) => updateMeta('kind', e.target.value)}>{Object.entries(DOCUMENT_KINDS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="space-y-1 text-xs">Data<Input aria-label="Data do documento" type="date" value={meta.date || ''} onChange={(e) => updateMeta('date', e.target.value)} /></label><label className="space-y-1 text-xs">Situação<select aria-label="Situação do documento" className={selectClass} value={meta.state || 'draft'} onChange={(e) => updateMeta('state', e.target.value)}>{Object.entries(DOCUMENT_STATES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
        {history && <section className="space-y-3 rounded-xl border bg-muted/30 p-3"><p className="text-sm font-medium">Versões preservadas</p><div className="flex max-h-32 flex-wrap gap-2 overflow-auto">{versions.map((v) => <Button key={v.id} size="sm" variant="outline" onClick={() => setVersion(v)}>v{v.revision} · {DOCUMENT_STATES[v.record_meta?.state || 'draft']} · {dateLabel(v.saved_at)}</Button>)}</div>{version && <article className="space-y-3 border-t pt-3"><strong>{version.title}</strong><div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(version.content?.text_content || '') }} />{['participants','agreed','out_scope','next_steps'].map((key) => version.record_meta?.[key] && <p className="whitespace-pre-wrap text-sm" key={key}>{version.record_meta[key]}</p>)}{(version.record_meta?.attachments || []).map((file) => <Button key={file.id} size="sm" variant="outline" onClick={() => openFile(file)}>{file.name}</Button>)}</article>}</section>}
        <PlanRichTextEditor key={draft.id} value={draft.content?.text_content || ''} ariaLabel="Conteúdo do documento" placeholder="Resumo, decisões e contexto…" onChange={(value) => setDraft((current) => ({ ...current, content: { ...current.content, text_content: value } }))} />
        <details className="rounded-xl border p-3"><summary className="cursor-pointer text-sm font-medium">Combinados e vínculos</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs">Projeto<select className={selectClass} value={meta.project_id || ''} onChange={(e) => updateMeta('project_id', e.target.value)}><option value="">Histórico geral do cliente</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label className="text-xs">Reunião<select className={selectClass} value={meta.meeting_id || ''} onChange={(e) => updateMeta('meeting_id', e.target.value)}><option value="">Sem vínculo</option>{meetings.map((m) => <option key={m.id} value={m.id}>{m.titulo} · {dateLabel(m.marcada_para)}</option>)}</select></label>{[['participants','Participantes'],['agreed','Compromissos aprovados'],['out_scope','Fora do escopo / não prometido'],['next_steps','Pendências e próximos passos']].map(([key, label]) => <label key={key} className="space-y-1 text-xs">{label}<Textarea aria-label={label} rows={3} value={meta[key] || ''} onChange={(e) => updateMeta(key, e.target.value)} /></label>)}</div></details>
        <details className="rounded-xl border p-3" open={Boolean(meta.attachments?.length)}><summary className="cursor-pointer text-sm font-medium">Arquivos e links ({meta.attachments?.length || 0})</summary><div className="mt-3 space-y-3">{(meta.attachments || []).map((file) => <div key={file.id} className="flex items-center gap-2"><button type="button" className="min-w-0 flex-1 truncate text-left text-sm underline" onClick={() => openFile(file)}>{file.name}</button><Button variant="ghost" size="icon" aria-label={`Retirar ${file.name} desta versão`} onClick={() => updateMeta('attachments', meta.attachments.filter((f) => f.id !== file.id))}><X className="h-4 w-4" /></Button></div>)}<div className="flex flex-wrap gap-2"><label className="cursor-pointer rounded-md border px-3 py-2 text-sm"><Paperclip className="mr-1 inline h-4 w-4" />Anexar arquivo<input aria-label="Anexar arquivo ao documento" type="file" className="sr-only" disabled={busy} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} /></label><Button variant="outline" size="sm" onClick={() => setDrive(true)} disabled={busy}>Google Drive</Button></div><div className="flex gap-2"><Input aria-label="Link de arquivo" placeholder="https://…" value={link} onChange={(e) => setLink(e.target.value)} /><Button variant="outline" onClick={() => { if (!validHttpUrl(link)) { setError('Informe um link http ou https válido.'); return; } addAttachment({ name: link, url: link }); setLink(''); }}>Adicionar link</Button></div><p className="text-xs text-muted-foreground">Arquivos até 50 MB. Para gravações maiores, use Drive ou link. Salve a versão para registrar os anexos.</p></div></details>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(draft.apexia_access)} onChange={(e) => setDraft({ ...draft, apexia_access: e.target.checked })} />Permitir leitura pela IA</label><Button variant="ghost" size="sm" disabled={busy} onClick={() => { if (window.confirm(draft.archived_at ? 'Restaurar este documento?' : 'Arquivar mantendo o histórico?')) save({ ...draft, archived_at: draft.archived_at ? null : new Date().toISOString() }); }}><Archive className="mr-1 h-4 w-4" />{draft.archived_at ? 'Restaurar' : 'Arquivar'}</Button></div>
      </div>}
      {draft && <GoogleDrivePickerDialog open={drive} onOpenChange={setDrive} clienteId={client.id} acceptKinds="all" description="Escolha uma apresentação, relatório ou gravação. O arquivo continua no Drive." onSelectFile={(file) => { const url = file.webViewLink || `https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view`; addAttachment({ name: file.name, url }); setDrive(false); }} />}
    </main>
  </div>;
});
export default ProjectDocuments;
