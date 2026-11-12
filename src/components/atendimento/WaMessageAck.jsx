import React from 'react';

const ACK_SVG = {
  pending: {
    viewBox: '0 0 16 16',
    path: 'M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zm0 1.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zm-.25 3a.75.75 0 0 0-.75.75v3.19l2.72 1.59a.75.75 0 1 0 .76-1.3L8.75 7.28V5.25A.75.75 0 0 0 7.75 4.5z',
  },
  sent: {
    viewBox: '0 0 16 15',
    path: 'M10.91 3.316l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.88a.32.32 0 0 1-.484.032L1.892 7.205a.32.32 0 0 0-.484.032l-.364.354a.32.32 0 0 0 .032.484l3.263 3.263a.32.32 0 0 0 .484-.032l6.514-7.14a.366.366 0 0 0-.063-.51z',
  },
  delivered: {
    viewBox: '0 0 16 15',
    path: 'M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.88a.32.32 0 0 1-.484.032l-.358-.325a.32.32 0 0 0-.484.032l-.378.325a.195.195 0 0 1-.284-.049l-3.157-5.53a.365.365 0 0 0-.63.362l3.996 7.005a.32.32 0 0 0 .484.032l6.494-7.14a.366.366 0 0 0-.063-.51zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063l-4.286 4.716a.32.32 0 0 1-.484.032L2.801 2.602a.32.32 0 0 0-.484.032l-.379.325a.32.32 0 0 0 .032.484l3.996 7.005a.32.32 0 0 0 .484.032l6.494-7.14a.365.365 0 0 0-.063-.51z',
  },
};

/** Ícones de confirmação no estilo WhatsApp Web — mesmo slot 16×11 para não “pular” de tamanho. */
export default function WaMessageAck({ ack }) {
  if (!ack) return null;

  if (ack === 'pending') {
    const { viewBox, path } = ACK_SVG.pending;
    return (
      <span className="wa-bubble-ack wa-bubble-ack--pending" aria-label="Enviando">
        <svg viewBox={viewBox} className="wa-bubble-ack-icon" aria-hidden>
          <path fill="currentColor" d={path} />
        </svg>
      </span>
    );
  }

  if (ack === 'read' || ack === 'delivered') {
    const { viewBox, path } = ACK_SVG.delivered;
    return (
      <span
        className={`wa-bubble-ack wa-bubble-ack--${ack}`}
        aria-label={ack === 'read' ? 'Lida' : 'Entregue'}
      >
        <svg viewBox={viewBox} className="wa-bubble-ack-icon" aria-hidden>
          <path fill="currentColor" d={path} />
        </svg>
      </span>
    );
  }

  const { viewBox, path } = ACK_SVG.sent;
  return (
    <span className="wa-bubble-ack wa-bubble-ack--sent" aria-label="Enviada">
      <svg viewBox={viewBox} className="wa-bubble-ack-icon" aria-hidden>
        <path fill="currentColor" d={path} />
      </svg>
    </span>
  );
}
