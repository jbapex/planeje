import React, { useRef, useState } from 'react';
import TrafegoVincularGrupoDialog from '@/components/traffic/TrafegoVincularGrupoDialog';

export default function CsIaGroupBinding({ row, onSaved }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);
  const action = row.group_status === 'unlinked' ? 'Vincular grupo' : 'Alterar vínculo';

  return <>
    <button ref={trigger} type="button" className="gia-action-link" aria-haspopup="dialog"
      aria-label={`${action} de ${row.client_name}`} onClick={() => setOpen(true)}>{action}</button>
    <TrafegoVincularGrupoDialog row={{ client: { id: row.client_id, empresa: row.client_name } }} open={open}
      onOpenChange={setOpen} onSaved={onSaved} csBinding restoreFocus={() => trigger.current?.focus()} />
  </>;
}
