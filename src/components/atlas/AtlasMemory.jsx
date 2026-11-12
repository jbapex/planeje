import React, { useEffect, useRef, useState } from 'react';
import { BookmarkCheck, Check, Loader2, Trash2, Pencil } from 'lucide-react';
import { saveAtlasMemory, revokeAtlasMemory,setAtlasMemoryTeamScope } from '@/lib/atlasApi';
import { atlasDate } from './atlasPresentation';

export default function AtlasMemory({ memories = [], clients = [], clientId, onSaved, onRevoked, onError }) {
  const [content, setContent] = useState('');
  const [scope, setScope] = useState(clientId || '');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revokingId, setRevokingId] = useState(null);
  const [confirmRevoke, setConfirmRevoke] = useState(null);
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(null);
  const contentRef = useRef(null);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setScope(clientId || ''); setConfirmed(false); setEditing(null); }, [clientId]);
  const visible = memories.filter((memory) => !clientId || !memory.client_id || memory.client_id === clientId);
  const clientName = (id) => clients.find((client) => client.id === id)?.empresa || 'Cliente';

  async function save(event) {
    event.preventDefault();
    if (!content.trim() || !confirmed || busyRef.current) return;
    busyRef.current = true; setBusy(true); setNotice('');
    try {
      const result = await saveAtlasMemory({ content: content.trim(), clientId: scope || null, replacesId: editing?.id || null });
      if (!mounted.current) return;
      onSaved(result.memory); setContent(''); setConfirmed(false); setNotice(editing ? 'Correção confirmada. A nova versão substitui a anterior.' : 'Memória confirmada e salva.'); setEditing(null);
    } catch (failure) { if (mounted.current) onError(failure); }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }
  async function share(memory,shared){
    if(busyRef.current)return;
    busyRef.current=true;setBusy(true);setNotice('');
    try{
      const result=await setAtlasMemoryTeamScope(memory.id,shared);
      if(mounted.current){onSaved(result.memory);setNotice(shared?'Informação autorizada para as conversas com a equipe deste cliente.':'Esta memória voltou ao seu espaço privado.');}
    }catch(failure){if(mounted.current)onError(failure);}
    finally{busyRef.current=false;if(mounted.current)setBusy(false);}
  }
  function edit(memory) {
    setEditing({ id: memory.id, version: memory.version }); setContent(memory.content); setScope(memory.client_id || ''); setConfirmed(false); setNotice(''); setConfirmRevoke(null);
    contentRef.current?.focus();
  }
  async function revoke(id) {
    if (busyRef.current) return;
    busyRef.current = true; setRevokingId(id); setNotice('');
    try { await revokeAtlasMemory(id); if (!mounted.current) return; onRevoked(id); setConfirmRevoke(null); setNotice('Memória revogada. Ela não será usada em novas consultas.'); }
    catch (failure) { if (mounted.current) onError(failure); }
    finally { busyRef.current = false; if (mounted.current) setRevokingId(null); }
  }
  return <div className="atlas-memory-panel">
    <div className="atlas-panel-heading"><BookmarkCheck size={20} aria-hidden="true" /><div><h2>O que o Atlas deve lembrar</h2><p>Aprendizado das conversas, com origem e versões. Você pode corrigir ou revogar qualquer registro.</p></div></div>
    <form className="atlas-memory-form" onSubmit={save}>
      <label htmlFor="atlas-memory-content">{editing ? 'Corrigir memória' : 'Nova memória'}</label>
      {editing && <p className="atlas-memory-edit-note">A correção cria uma nova versão no mesmo contexto. A versão anterior fica no histórico.</p>}
      <textarea id="atlas-memory-content" ref={contentRef} value={content} onChange={(event) => { setContent(event.target.value); setConfirmed(false); }} rows={3} maxLength={4000} disabled={busy} placeholder="Ex.: ao propor uma campanha, trazer três caminhos e explicar os critérios da recomendação." />
      <label htmlFor="atlas-memory-scope">Onde usar</label>
      <select id="atlas-memory-scope" value={scope} onChange={(event) => { setScope(event.target.value); setConfirmed(false); }} disabled={busy || Boolean(editing)}>
        <option value="">Geral · meu assistente</option>
        {clients.map((client) => <option key={client.id} value={client.id}>{client.empresa}</option>)}
      </select>
      <label className="atlas-check"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={busy} /><span>Confirmo este conteúdo para uso como memória do Atlas.</span></label>
      <div className="atlas-memory-form-actions"><button type="submit" className="atlas-button atlas-button-primary" disabled={busy || !confirmed || !content.trim()}>{busy ? <Loader2 className="atlas-spin" size={15} /> : <BookmarkCheck size={15} aria-hidden="true" />} {editing ? 'Confirmar correção' : 'Confirmar e salvar'}</button>{editing && <button type="button" className="atlas-text-button" disabled={busy} onClick={() => { setEditing(null); setContent(''); setScope(clientId || ''); setConfirmed(false); }}>Cancelar correção</button>}</div>
    </form>
    {notice && <div className="atlas-success" role="status"><Check size={15} aria-hidden="true" />{notice}</div>}
    <div className="atlas-memory-list">
      <h3>Memórias neste contexto <span>{visible.length}</span></h3>
      {!visible.length && <p className="atlas-empty-copy">Nenhuma memória confirmada {clientId ? 'para este contexto' : 'no escopo geral'}. Os dados atuais de tarefas e prazos serão consultados no Planeje.</p>}
      {visible.map((memory) => <article className="atlas-memory-item" key={memory.id}>
        <div className="atlas-memory-meta"><span>{memory.client_id ? clientName(memory.client_id) : 'Geral'} · versão {memory.version || 1} · {memory.learning_kind === 'pattern' ? 'Padrão observado' : memory.learning_kind === 'fact' ? 'Fato relatado' : 'Orientação do dono'}</span><time dateTime={memory.created_at}>{atlasDate(memory.created_at)}</time></div>
        <p>{memory.content}</p>{memory.learning_kind === 'pattern' && <small>Inferência baseada nas fontes; não altera regras.</small>}{memory.learning_kind === 'fact' && <small>Declaração registrada; não é confirmação independente.</small>}
        {(memory.source_quote || memory.evidence?.length > 0) && <details className="atlas-memory-origin"><summary>Ver origem</summary>{memory.source_quote && <blockquote>{memory.source_quote}</blockquote>}{memory.evidence?.map((source) => <div key={source.source_id}><small>{source.source_kind === 'task_comment' ? 'Comentário da tarefa' : 'Conversa do grupo'} · {source.author_name || 'Autor do registro'} · <time dateTime={source.at}>{atlasDate(source.at)}</time></small><blockquote>{source.quote}</blockquote></div>)}</details>}
        {memory.client_id?<label className="atlas-check"><input type="checkbox" checked={memory.team_shared===true} disabled={busy||Boolean(revokingId)} onChange={event=>share(memory,event.target.checked)}/><span>Autorizar esta informação nas conversas com a equipe deste cliente</span></label>:<small>Uso privado no seu assistente pessoal.</small>}
        <div className="atlas-memory-bottom"><span>Origem: {memory.source === 'observation' ? 'observação das fontes deste cliente' : memory.source === 'conversation' ? 'sua conversa com Atlas' : memory.source === 'brainstorm' ? 'definições que você passou' : 'sua confirmação'}</span><div className="atlas-memory-item-actions"><button type="button" className="atlas-text-button" onClick={() => edit(memory)} disabled={busy || Boolean(revokingId)}><Pencil size={13} aria-hidden="true" />Corrigir</button>{confirmRevoke !== memory.id && <button type="button" className="atlas-text-button" onClick={() => setConfirmRevoke(memory.id)} disabled={busy || Boolean(revokingId)}><Trash2 size={13} aria-hidden="true" />Revogar</button>}</div></div>
        {confirmRevoke === memory.id && <div className="atlas-revoke-confirm"><span>Deixar de usar esta memória?</span><button type="button" className="atlas-button" onClick={() => setConfirmRevoke(null)} disabled={Boolean(revokingId)}>Cancelar</button><button type="button" className="atlas-button atlas-button-danger" disabled={Boolean(revokingId)} onClick={() => revoke(memory.id)}>{revokingId === memory.id ? 'Revogando…' : 'Revogar memória'}</button></div>}
      </article>)}
    </div>
  </div>;
}
