import React from 'react';
import ClientGoogleDataLinksManager from '@/components/forms/ClientGoogleDataLinksManager';
import GoogleDataOverview from '@/components/crm/GoogleDataOverview';

export default function RastreamentoGoogleData({ clienteId }) {
  if (!clienteId) return null;
  return (
    <div id="integration-google-data" className="space-y-4">
      <GoogleDataOverview clienteId={clienteId} />
      <ClientGoogleDataLinksManager clientId={clienteId} />
    </div>
  );
}
