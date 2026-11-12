import React, { useState } from 'react';
import { Plug } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import RastreamentoConexoesMap from '@/components/crm/RastreamentoConexoesMap';
import RastreamentoMetaManual from '@/components/crm/RastreamentoMetaManual';
import RastreamentoWhatsappInstancias from '@/components/crm/RastreamentoWhatsappInstancias';
import RastreamentoChatvoltWebhook from '@/components/crm/RastreamentoChatvoltWebhook';
import RastreamentoCrmApice from '@/components/crm/RastreamentoCrmApice';
import RastreamentoGoogleAdsConversions from '@/components/crm/RastreamentoGoogleAdsConversions';
import RastreamentoGoogleData from '@/components/crm/RastreamentoGoogleData';
import { RastreamentoSectionTitle } from '@/components/crm/RastreamentoUi';
import { rastreamentoTabHelp } from '@/lib/rastreamentoHub';

/**
 * Integrações TRACK no login da agência: Meta + WhatsApp já ligado + Google conversões + destino CAPI.
 * Links rastreáveis ficam na aba Links. Gatilhos em Configurações.
 */
export default function RastreamentoIntegracoes({ clienteId, onOpenSettings, onOpenLinks }) {
  const [mapTick, setMapTick] = useState(0);

  if (!clienteId) {
    return (
      <Card className="rt-empty">
        <CardContent className="py-14 text-center text-sm text-muted-foreground">
          Selecione o cliente no topo.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="rt-page">
      <div className="rt-page__toolbar">
        <div className="flex items-center gap-2 min-w-0">
          <Plug className="h-4 w-4 text-violet-500 shrink-0" />
          <RastreamentoSectionTitle
            title="Integrações"
            help={rastreamentoTabHelp('integracoes')}
          />
        </div>
        <div className="rt-jumps">
          <a href="#integration-meta">Meta Ads</a>
          <a href="#integration-google">Google Ads</a>
          <a href="#integration-google-data">Analytics</a>
          <a href="#integration-whatsapp">WhatsApp</a>
          <a href="#integration-crm-apice">CRM Ápice</a>
          <button
            type="button"
            onClick={() => document.getElementById('integration-chatvolt')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            Chatvolt
          </button>
          <button type="button" onClick={() => onOpenLinks?.()}>
            Links
          </button>
          <button type="button" onClick={() => onOpenSettings?.()}>
            Gatilhos
          </button>
        </div>
      </div>
      <RastreamentoConexoesMap key={mapTick} clienteId={clienteId} onOpenSettings={onOpenSettings} />
      <RastreamentoCrmApice key={clienteId} clienteId={clienteId} />
      <div id="integration-meta">
        <RastreamentoMetaManual clienteId={clienteId} onChanged={() => setMapTick((value) => value + 1)} />
      </div>
      <div id="integration-google">
        <RastreamentoGoogleAdsConversions
          clienteId={clienteId}
          onChanged={() => setMapTick((value) => value + 1)}
        />
      </div>
      <div id="integration-google-data">
        <RastreamentoGoogleData clienteId={clienteId} />
      </div>
      <div id="integration-whatsapp">
        <RastreamentoWhatsappInstancias clienteId={clienteId} onChanged={() => setMapTick((value) => value + 1)} />
        <RastreamentoChatvoltWebhook clienteId={clienteId} />
      </div>
    </div>
  );
}
