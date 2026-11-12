import React, { useEffect } from 'react';
import { Layers, Loader2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useFunilMetaOptions } from '@/hooks/useFunilMetaOptions';
import { getInheritedMetaLink, getParentNode } from '@/lib/funilNodeGraph';
import {
  FunilMetaStatusOption,
  FunilMetaStatusSelected,
} from '@/components/funil/components/FunilMetaStatus';

export default function FunilMetaAdsetSection({
  node,
  nodes,
  edges,
  onLinkOverrideChange,
}) {
  const parent = getParentNode(node.id, nodes, edges);
  const inherited = getInheritedMetaLink(node, nodes, edges);
  const campaignId = inherited?.campaignId;
  const selectedId = node.data?.linkOverride?.adSetId || inherited?.adSetId || '';

  const { adSets, loadingAdSets, adSetsError, fetchAdSets, clearAdSets } = useFunilMetaOptions(null);

  useEffect(() => {
    if (campaignId) fetchAdSets(campaignId);
    else clearAdSets();
  }, [campaignId, fetchAdSets, clearAdSets]);

  const handleSelect = (adSetId) => {
    const adSet = adSets.find((a) => a.id === adSetId);
    onLinkOverrideChange?.({
      adSetId,
      adSetName: adSet?.name || adSetId,
      adSetStatus: adSet?.status || null,
      adId: null,
      adName: null,
      adStatus: null,
    });
  };

  const selectedAdSet = adSets.find((a) => a.id === selectedId);
  const adSetStatus = node.data?.linkOverride?.adSetStatus || selectedAdSet?.status;

  if (!parent) {
    return (
      <div className="funil-inherited-connect funil-inherited-connect--warn">
        <p className="text-xs text-muted-foreground">
          Conecte abaixo da <strong>campanha Meta</strong> ou canal (Meta → Conjunto Meta → Criativo).
        </p>
      </div>
    );
  }

  if (!campaignId) {
    return (
      <div className="funil-inherited-connect funil-inherited-connect--warn">
        <p className="text-xs text-muted-foreground">
          O nó pai precisa ter <strong>campanha Meta</strong> configurada (nó Meta Ads com conta + campanha).
        </p>
      </div>
    );
  }

  return (
    <div className="funil-inherited-connect">
      <div className="funil-inherited-connect__head">
        <Layers className="h-4 w-4 text-cyan-700" />
        <span className="funil-inherited-connect__title">Conjunto de anúncios</span>
      </div>

      <div className="funil-inherited-connect__summary text-xs text-muted-foreground space-y-1">
        <p>
          <strong>Pai:</strong> {parent.data?.label || '—'}
        </p>
        <p>
          <strong>Campanha:</strong> {inherited.campaignName || inherited.campaignId}
        </p>
      </div>

      <div className="np-field mt-3">
        <Label className="np-label">Conjunto (ad set)</Label>
        {loadingAdSets ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Carregando conjuntos…
          </div>
        ) : adSetsError ? (
          <p className="text-xs text-destructive">{adSetsError}</p>
        ) : (
          <Select value={selectedId || undefined} onValueChange={handleSelect}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Selecione o conjunto" />
            </SelectTrigger>
            <SelectContent>
              {adSets.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  <FunilMetaStatusOption name={a.name} status={a.status} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {selectedId && adSetStatus && (
          <FunilMetaStatusSelected
            title="Conjunto selecionado"
            name={node.data?.linkOverride?.adSetName || selectedAdSet?.name}
            status={adSetStatus}
          />
        )}
        {!selectedId && (
          <p className="text-xs text-amber-700 mt-1">
            Obrigatório para filtrar anúncios no nó criativo abaixo.
          </p>
        )}
      </div>
    </div>
  );
}
