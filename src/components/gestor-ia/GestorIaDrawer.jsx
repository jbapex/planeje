import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

export default function GestorIaDrawer({ label, title, close, busy = false, closeLabel = 'Fechar detalhe', children }) {
  const dialog = useRef(null);
  const titleId = useId();

  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, []);

  return <dialog className="gia-detail-drawer" ref={dialog} aria-labelledby={titleId} onClose={close} onCancel={(event) => { if (busy) event.preventDefault(); }}>
    <header className="gia-drawer-heading">
      <div><p className="gia-eyebrow">{label}</p><h2 id={titleId}>{title}</h2></div>
      <button className="gia-icon-button" type="button" aria-label={closeLabel} disabled={busy} onClick={() => dialog.current ? dialog.current.close() : close()}><X aria-hidden="true" /></button>
    </header>
    <div className="gia-stack">{children}</div>
  </dialog>;
}
