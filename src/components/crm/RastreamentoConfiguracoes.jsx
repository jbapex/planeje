import React from 'react';
import { Settings } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import RastreamentoGatilhosCard from '@/components/crm/RastreamentoGatilhosCard';
import { RastreamentoSectionTitle } from '@/components/crm/RastreamentoUi';
import { rastreamentoTabHelp } from '@/lib/rastreamentoHub';

/**
 * Configurações TRACK: jornada/gatilhos. Integrações ficam na outra aba.
 */
export default function RastreamentoConfiguracoes({ clienteId }) {
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
      <section className="rt-board">
        <header className="rt-board__head">
          <Settings className="h-4 w-4 text-violet-500 shrink-0" />
          <RastreamentoSectionTitle
            title="Jornada e gatilhos"
            help={rastreamentoTabHelp('configuracoes')}
          />
        </header>
        <RastreamentoGatilhosCard clienteId={clienteId} />
      </section>
    </div>
  );
}
