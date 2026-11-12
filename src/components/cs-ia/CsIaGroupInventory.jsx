import React, { useRef, useState } from 'react';
import TrafegoVincularGrupoDialog from '@/components/traffic/TrafegoVincularGrupoDialog';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/customSupabaseClient';
import { setCsGroupArchive } from '@/lib/csIaGroupInventory';
import { whatsappGroupChannelLabel } from '@/lib/clienteWhatsappGrupo';
import CsIaGroupRename from './CsIaGroupRename';
import CsIaGroupMembers from './CsIaGroupMembers';
import CsIaCreateClientFromGroup from './CsIaCreateClientFromGroup';
import { dateTime, filterGroupInventory } from './csIaPresentation';

export default function CsIaGroupInventory({ mode, inventory, search, rows, onSaved, store }) {
  const [candidate, setCandidate] = useState(null);
  const [open, setOpen] = useState(false);
  const [archiveAction, setArchiveAction] = useState(null);
  const [savingArchive, setSavingArchive] = useState(false);
  const [archiveError, setArchiveError] = useState('');
  const [creationGroup, setCreationGroup] = useState(null);
  const trigger = useRef(null);
  const archiveTrigger = useRef(null);
  const createTrigger = useRef(null);
  const archived = mode === 'archived';
  const title = archived ? 'Grupos arquivados' : 'Grupos sem vínculo';
  const available = rows.filter((row) => row.group_status === 'unlinked').map((row) => ({ id: row.client_id, empresa: row.client_name }));
  const visible = filterGroupInventory(inventory.refreshing || inventory.error ? [] : inventory.data || [], search);

  async function confirmArchive() {
    if (!archiveAction || savingArchive) return;
    setSavingArchive(true);
    setArchiveError('');
    try {
      await setCsGroupArchive(supabase, archiveAction.group, archiveAction.archive);
      setArchiveAction(null);
      onSaved();
    } catch (error) {
      setArchiveError(error.message);
    } finally {
      setSavingArchive(false);
    }
  }

  return <section className="gia-stack" aria-label={title}>
    <h2>{title}</h2>
    {!archived && visible.length > 0 && !available.length && <p className="gia-caption">Nenhum cliente da carteira está sem grupo.</p>}
    {inventory.error ? <div className="gia-panel gia-stack"><p role="alert">Não foi possível consultar os grupos do Atendimento.</p>
      <button type="button" className="gia-action-link cs-back" onClick={() => inventory.reload()}>Tentar novamente</button></div>
      : inventory.refreshing || !inventory.data ? <p role="status">Carregando grupos do Atendimento…</p>
        : !visible.length ? <p className="gia-empty">Nenhum grupo corresponde a este filtro.</p>
          : <ul className="cs-card-grid">{visible.map((group) => <li className="gia-panel cs-card" key={group.id}>
            <p className="gia-caption">{archived ? group.archive_origin === 'cs' ? 'Arquivado no CS' : 'Arquivado pelo Atendimento' : 'Sem vínculo'}</p>
            <h3>{group.display_name}</h3>
            <p className="gia-caption">{whatsappGroupChannelLabel(group)}</p>
            <p>{archived ? 'Arquivado em' : 'Última atividade'} · {dateTime(archived ? group.archived_at : group.last_message_at)}</p>
            <div className="cs-actions">
            {!archived && group.archive_version && <CsIaGroupMembers key={`${group.id}:${group.whatsapp_config_id}:${group.chat_jid}`} canManage
              row={{ client_id: null, group_status: 'unlinked', conversation_id: group.id, wa_client_id: group.wa_cliente_id,
                channel_id: group.whatsapp_config_id, group_jid: group.chat_jid, group_name: group.display_name, channel_label: whatsappGroupChannelLabel(group) }} />}
            {!archived && group.archive_version && <CsIaGroupRename key={JSON.stringify([group.id, group.wa_cliente_id, group.whatsapp_config_id, group.chat_jid])}
              source={group} displayName={`${group.display_name} · ${whatsappGroupChannelLabel(group)}`} onSaved={onSaved} />}
            {!archived && group.archive_version && <button type="button" className="gia-action-link cs-back" aria-haspopup="dialog"
              aria-label={`Criar cliente · ${group.display_name} · ${whatsappGroupChannelLabel(group)}`} onClick={(event) => {
                createTrigger.current = event.currentTarget;
                setCreationGroup(group);
              }}>Criar cliente deste grupo</button>}
            {!archived && available.length > 0 && <button type="button" className="gia-action-link cs-back" aria-haspopup="dialog"
              aria-label={`Vincular ${group.display_name} · ${whatsappGroupChannelLabel(group)}`} onClick={(event) => {
                trigger.current = event.currentTarget;
                setCandidate(group);
                setOpen(true);
              }}>Vincular a cliente</button>}
            {group.archive_version && <button type="button" className="gia-action-link cs-back" aria-haspopup="dialog"
              aria-label={`${archived ? 'Restaurar' : 'Arquivar'} no CS · ${group.display_name} · ${whatsappGroupChannelLabel(group)}`}
              onClick={(event) => {
                archiveTrigger.current = event.currentTarget;
                setArchiveError('');
                setArchiveAction({ group, archive: !archived });
              }}>{archived ? 'Restaurar no CS' : 'Arquivar no CS'}</button>}
            </div>
          </li>)}</ul>}
    {candidate && <TrafegoVincularGrupoDialog key={candidate.id} fixedGroup={candidate} eligibleClients={available} open={open}
      onOpenChange={setOpen} onSaved={onSaved} csBinding restoreFocus={() => trigger.current?.focus()} />}
    {creationGroup && <CsIaCreateClientFromGroup key={creationGroup.id} group={creationGroup} store={store} onSaved={onSaved}
      onClose={() => {
        setCreationGroup(null);
        requestAnimationFrame(() => createTrigger.current?.focus());
      }} />}
    <AlertDialog open={Boolean(archiveAction)} onOpenChange={(next) => { if (!next && !savingArchive) setArchiveAction(null); }}>
      {archiveAction && <AlertDialogContent onCloseAutoFocus={(event) => {
        if (archiveTrigger.current?.isConnected) {
          event.preventDefault();
          archiveTrigger.current.focus();
        }
      }}>
        <AlertDialogHeader>
          <AlertDialogTitle>{archiveAction.archive ? 'Arquivar grupo no CS' : 'Restaurar grupo no CS'}</AlertDialogTitle>
          <AlertDialogDescription>{archiveAction.group.display_name} · {whatsappGroupChannelLabel(archiveAction.group)}</AlertDialogDescription>
        </AlertDialogHeader>
        <p className="text-sm">{archiveAction.archive ? 'O grupo vai para Arquivados do CS. As conversas e mensagens continuam no Atendimento.'
          : 'O grupo volta para Grupos sem vínculo e pode ser associado a um cliente.'}</p>
        {archiveError && <p role="alert" className="text-sm text-destructive">{archiveError}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={savingArchive}>Cancelar</AlertDialogCancel>
          <Button type="button" onClick={confirmArchive} disabled={savingArchive}>
            {savingArchive ? 'Salvando…' : archiveAction.archive ? 'Confirmar arquivamento' : 'Confirmar restauração'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>}
    </AlertDialog>
  </section>;
}
