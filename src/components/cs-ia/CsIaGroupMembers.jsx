import React, { useEffect, useRef, useState } from 'react';
import { Users } from 'lucide-react';
import AtendimentoGrupoParticipantesPanel from '@/components/atendimento/AtendimentoGrupoParticipantesPanel';
import GestorIaDrawer from '@/components/gestor-ia/GestorIaDrawer';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';
import { participantDisplayLabel } from '@/lib/uazapiGroupParticipants';
import { loadCsGroupTeam, saveCsGroupTeam } from './csIaData';
import { groupLabel } from './csIaPresentation';

function participantJids(participant) {
  const phone = String(participant.phone || '').replace(/\D/g, '');
  const inputs = [participant.from_jid, participant.jid, participant.lid, `${phone}@s.whatsapp.net`];
  return [...new Set(inputs.flatMap((value) => {
    const match = String(value || '').trim().toLowerCase().match(/^([0-9]{6,20})(?::[0-9]{1,4})?@(s\.whatsapp\.net|c\.us|lid)$/);
    return match ? [`${match[1]}@${match[2] === 'c.us' ? 's.whatsapp.net' : match[2]}`] : [];
  }))];
}

function MembersDrawer({ row, canManage, onTeamChange, onClose }) {
  const [scope] = useState(row);
  const [marks, setMarks] = useState(null);
  const [readError, setReadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    loadCsGroupTeam(supabase, scope).then(
      (team) => { if (active) setMarks(team); },
      (error) => { if (active) setReadError(error.message); },
    );
    return () => { active = false; };
  }, [scope, retry]);

  async function changeTeam(jids, next) {
    setSaving(true);
    setSaveError('');
    try {
      setMarks(await saveCsGroupTeam(supabase, scope, jids, next));
      onTeamChange?.();
    } catch (error) {
      setSaveError(error.message);
    } finally {
      setSaving(false);
    }
  }

  function renderTeamAction(participant) {
    const jids = participantJids(participant);
    const marked = jids.some((jid) => marks?.includes(jid));
    if (!canManage) return marked ? <span className="gia-tag">Da equipe</span> : null;
    const label = participantDisplayLabel(participant);
    return <Button type="button" size="sm" variant={marked ? 'default' : 'outline'} aria-pressed={marked}
      aria-label={`${marked ? 'Remover classificação de equipe de' : 'Marcar como equipe:'} ${label}`}
      disabled={!marks || saving || !jids.length || jids.length > 3} onClick={() => changeTeam(jids, !marked)}>
      {marked ? 'Da equipe' : 'Marcar como equipe'}
    </Button>;
  }

  return <GestorIaDrawer label={[row.group_name || groupLabel(row), row.channel_label].filter(Boolean).join(' · ')} title="Membros do grupo"
    closeLabel="Fechar membros" busy={saving} close={onClose}>
    <p className="gia-caption">{row.client_id === null ? 'As marcações deste grupo serão usadas quando ele for vinculado pelo CS.'
      : 'Marque integrantes da equipe para orientar a leitura por IA neste grupo.'}</p>
    {readError && <div className="gia-notice" role="alert">{readError} <button type="button" className="gia-action-link"
      onClick={() => { setReadError(''); setRetry((value) => value + 1); }}>Tentar classificação novamente</button></div>}
    {saveError && <p className="gia-notice" role="alert">{saveError}</p>}
    {saving && <p className="gia-caption" role="status">Salvando classificação…</p>}
    <AtendimentoGrupoParticipantesPanel clienteId={row.wa_client_id} csClientId={row.client_id} compact
      renderParticipantAction={renderTeamAction}
      conversation={{ id: row.conversation_id, is_group: true, chat_jid: row.group_jid, whatsapp_config_id: row.channel_id }} />
  </GestorIaDrawer>;
}

export default function CsIaGroupMembers({ row, canManage, onTeamChange }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);
  const inventory = row.client_id === null && row.group_status === 'unlinked' && canManage;
  if ((!inventory && (row.group_status !== 'linked' || !row.client_id)) || !row.conversation_id || !row.wa_client_id || !row.channel_id || !row.group_jid) return null;

  return <>
    <button ref={trigger} type="button" className="gia-action-link" aria-haspopup="dialog"
      aria-label={inventory ? `Ver membros · ${row.group_name} · ${row.channel_label}` : undefined} onClick={() => setOpen(true)}>
      <Users aria-hidden="true" /> Ver membros do grupo
    </button>
    {open && <MembersDrawer row={row} canManage={canManage} onTeamChange={onTeamChange} onClose={() => {
      setOpen(false);
      requestAnimationFrame(() => trigger.current?.focus());
    }} />}
  </>;
}
