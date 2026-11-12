import React from 'react';
import ClienteMetaCtwaSettings from '@/components/crm/ClienteMetaCtwaSettings';
import ClienteMetaCtwaChannelsPanel from '@/components/crm/ClienteMetaCtwaChannelsPanel';

/**
 * Token Meta CTWA + conversões por canal — por empresa (cliente), não por login individual.
 */
export default function ClienteMetaCtwaAdminPanel({ clienteId, compact }) {
  if (!clienteId) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        Selecione um cliente para configurar conversões WhatsApp (Meta).
      </p>
    );
  }

  return (
    <div className={compact ? 'space-y-4' : 'space-y-6'}>
      <ClienteMetaCtwaSettings clienteId={clienteId} />
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Canais WhatsApp deste cliente</h3>
        <ClienteMetaCtwaChannelsPanel clienteId={clienteId} />
      </div>
    </div>
  );
}
