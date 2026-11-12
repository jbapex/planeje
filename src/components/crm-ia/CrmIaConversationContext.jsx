import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, PanelRightOpen } from 'lucide-react';
import { formatBrazilPhone } from '@/lib/groupParticipantDisplay';
import { CrmIaEditor, CrmIaField, CrmIaState, useCrmRead } from './CrmIaPrimitives';
import { CrmIaLeadEditor, CrmIaMoveEditor } from './CrmIaLeadEditors';
import { named, versionOf } from './crmIaPresentation';
import { AI_FLAG_CATEGORIES } from './crmIaConversationModel';

export default function CrmIaConversationContext({ api, mutate, scope, workspace, revision, canManage, profile, displayName, phone, channelName, attendant, enabled = true, children }) {
  const [reload, setReload] = useState(0);
  const [editor, setEditor] = useState(null);
  const read = useCrmRead(api, 'conversation_context', scope, `${revision}:${reload}`, enabled, 10000);
  const lead = read.data?.lead;
  async function save(action, payload) { const result = await mutate(action, payload); setEditor(null); setReload(value => value + 1); return result; }
  const href = lead ? `/crm-ia/leads?${new URLSearchParams({ cliente: workspace.client.id, lead_id: lead.id })}` : null;
  const editable = canManage && enabled && !lead?.archived_at;
  return <><div className="crm-ia-native-chat-identity crm-ia-conversation-context" aria-label="Contexto comercial">
    <h2 className="wa-chat-header-name" title={displayName}>{href ? <Link to={href}>{displayName}</Link> : displayName}</h2>
    <p className="sr-only">{channelName} · Atendente da conversa: {attendant}</p>
    <div className="crm-ia-conversation-business" aria-label="Funil, etapa e responsável comercial"><span className="crm-ia-conversation-phone">{formatBrazilPhone(phone || lead?.whatsapp) || phone || lead?.whatsapp || 'Telefone não informado'}</span><CrmIaState read={read} retry={() => setReload(value => value + 1)}>
    {lead ? <>
      {[['edit', 'Alterar funil', workspace.pipelines?.find(item => item.id === lead.pipeline_id)?.nome || 'Sem funil'], ['move', 'Alterar etapa', workspace.stages?.find(item => item.id === lead.stage_id)?.nome || 'Sem etapa'], ['owner', 'Alterar responsável comercial', lead.responsavel_id ? named(workspace.people?.find(person => person.id === lead.responsavel_id)) : 'Sem responsável']].map(([kind, label, value]) => <button key={kind} type="button" aria-label={label} title={`${label}: ${value}`} disabled={!editable} onClick={() => setEditor({ kind, lead: { ...lead } })}><span>{value}</span><ChevronDown size={11} aria-hidden="true" /></button>)}
      {editable && lead.responsavel_id !== profile.id && <button type="button" className="crm-ia-business-claim" onClick={() => setEditor({ kind: 'assign', lead: { ...lead } })}>Pegar para si</button>}
      {editable && editor?.lead.id === lead.id && <>
        {editor.kind === 'edit' && <CrmIaLeadEditor row={editor.lead} workspace={workspace} mutate={save} onClose={() => setEditor(null)} />}
        {editor.kind === 'move' && <CrmIaMoveEditor row={editor.lead} workspace={workspace} mutate={save} onClose={() => setEditor(null)} />}
        {editor.kind === 'owner' && <CrmIaConversationOwner row={editor.lead} workspace={workspace} mutate={save} onClose={() => setEditor(null)} />}
        {editor.kind === 'assign' && <CrmIaEditor title="Assumir oportunidade" onClose={() => setEditor(null)} saveLabel="Confirmar responsável" onSave={() => save('save_lead', { ...versionOf(editor.lead), responsavel_id: profile.id })}><p>Você será responsável comercial por esta oportunidade. O atendente da conversa tem atribuição própria.</p></CrmIaEditor>}
      </>}
    </> : <small className="crm-ia-muted">{read.data?.status === 'ambiguous' ? 'Mais de uma oportunidade. Confira em Leads.' : 'Sem oportunidade vinculada.'}</small>}
  </CrmIaState></div></div><div className="wa-head-actions crm-ia-native-chat-actions">{href && <Link className="wa-head-icon" to={href} aria-label="Ver ficha do lead" title="Ver ficha do lead"><PanelRightOpen size={16} aria-hidden="true" /></Link>}{children}</div></>;
}

function CrmIaConversationOwner({ row, workspace, mutate, onClose }) {
  const [owner, setOwner] = useState(row.responsavel_id || '');
  return <CrmIaEditor title="Responsável comercial" onClose={onClose} saveLabel="Confirmar responsável" onSave={() => mutate('save_lead', { ...versionOf(row), responsavel_id: owner || null })}><CrmIaField label="Responsável comercial" value={owner} onChange={setOwner} options={[{ value: '', label: 'Sem responsável' }, ...workspace.people]} /><p className="crm-ia-muted">O atendente da conversa tem atribuição própria.</p></CrmIaEditor>;
}

export function CrmIaAiMessageFlag({ message, scope, mutate, onSaved }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(message.my_flag?.category || '');
  const [note, setNote] = useState(message.my_flag?.note || '');
  if (message.can_flag !== true) return null;
  const label = AI_FLAG_CATEGORIES.find(item => item.value === message.my_flag?.category)?.label;
  function edit() { setCategory(message.my_flag?.category || ''); setNote(message.my_flag?.note || ''); setOpen(true); }
  return <div className="crm-ia-ai-message-flag">{label && <span className="crm-ia-badge">{label}</span>}<button type="button" onClick={edit}>{message.my_flag ? 'Editar sinalização IA' : 'Sinalizar IA'}</button>
    {open && <CrmIaEditor title="Sinalizar resposta da IA" description="A sinalização registra sua avaliação desta resposta enviada. A observação é individual." onClose={() => setOpen(false)} saveLabel="Salvar sinalização" onSave={async () => {
      if (!AI_FLAG_CATEGORIES.some(item => item.value === category)) throw new Error('Escolha o motivo da sinalização.');
      if (note.length > 1000) throw new Error('A observação deve ter até 1.000 caracteres.');
      await mutate('flag_ai_message', { ...scope, sent_id: message.id, category, note: note.trim(), ...(message.my_flag && { expected_updated_at: message.my_flag.updated_at }) });
      onSaved();
    }}><CrmIaField label="Motivo da sinalização" value={category} onChange={setCategory} required options={[{ value: '', label: 'Selecione o motivo' }, ...AI_FLAG_CATEGORIES]} /><CrmIaField label="Observação da sinalização" value={note} onChange={setNote} type="textarea" maxLength={1000} /><p className="crm-ia-muted">Nenhuma reação é enviada ao WhatsApp.</p></CrmIaEditor>}
  </div>;
}
