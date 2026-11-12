import React, { useEffect, useState } from 'react';
import { Loader2, Link2, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useFunilMetaOptions } from '@/hooks/useFunilMetaOptions';
import { getInheritedMetaLink, getParentNode, getFunilNodeRole } from '@/lib/funilNodeGraph';
import { fetchMetaAdCreative } from '@/lib/funilMetaCreative';
import { FunilMetaStatusOption, FunilMetaStatusSelected } from '@/components/funil/components/FunilMetaStatus';

export default function FunilInheritedMetaSection({
  node,
  nodes,
  edges,
  onLinkOverrideChange,
  onClearInheritance,
}) {
  const parent = getParentNode(node.id, nodes, edges);
  const inherited = getInheritedMetaLink(node, nodes, edges);
  const role = getFunilNodeRole(node.data?.type);

  const { ads, loadingAds, adsError, fetchAds, clearAds } = useFunilMetaOptions(null);
  const [thumbLoading, setThumbLoading] = useState(false);
  const panelThumb =
    node.data?.creativeThumbnailUrl && node.data?.creativeThumbnailUrlAdId === inherited?.adId
      ? node.data.creativeThumbnailUrl
      : null;

  const campaignId = inherited?.campaignId;
  const campaignStatus = inherited?.campaignStatus;
  const adSetStatus = inherited?.adSetStatus;

  const loadAdCreative = async (adId, adName) => {
    if (!adId) return;
    setThumbLoading(true);
    try {
      const creative = await fetchMetaAdCreative(adId);
      const ad = ads.find((a) => a.id === adId);
      onLinkOverrideChange({
        adId,
        adName: adName || creative?.name || ad?.name,
        adStatus: ad?.status || null,
        creativeThumbnailUrl: creative?.thumbnailUrl || null,
      });
    } finally {
      setThumbLoading(false);
    }
  };

  useEffect(() => {
    if (role !== 'creative' || !inherited?.adId) return;
    if (node.data?.creativeThumbnailUrlAdId === inherited.adId && node.data?.creativeThumbnailUrl) return;
    loadAdCreative(inherited.adId, inherited.adName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, inherited?.adId]);

  useEffect(() => {
    if (campaignId) fetchAds(campaignId, { adSetId: inherited?.adSetId });
    else clearAds();
  }, [campaignId, inherited?.adSetId, fetchAds, clearAds]);

  if (!parent) {
    return (
      <div className="funil-inherited-connect funil-inherited-connect--warn">
        <p className="text-xs text-muted-foreground">
          Conecte à campanha ou ao <strong>Conjunto Meta</strong> (Meta → Conjunto → Criativo).
        </p>
      </div>
    );
  }

  const parentLabel = parent.data?.label || 'Nó pai';
  const campaignLabel = inherited?.campaignName || inherited?.campaignId || '—';

  return (
    <div className="funil-inherited-connect">
      <div className="funil-inherited-connect__head">
        <Link2 className="h-4 w-4 text-[#1877F2]" />
        <span className="funil-inherited-connect__title">Herdado do nó pai</span>
      </div>

      <div className="funil-inherited-connect__summary text-xs text-muted-foreground space-y-1">
        <p>
          <strong>Pai:</strong> {parentLabel}
        </p>
        {campaignId && (
          <FunilMetaStatusSelected
            title="Campanha"
            name={campaignLabel}
            status={campaignStatus}
          />
        )}
        {inherited?.adSetName && (
          <FunilMetaStatusSelected
            title="Conjunto"
            name={inherited.adSetName}
            status={adSetStatus}
          />
        )}
        {role === 'creative' && campaignId && !inherited?.adSetId && (
          <p className="text-amber-700">
            Adicione um nó <strong>Conjunto Meta</strong> entre a campanha e este criativo, ou selecione o
            conjunto no nó pai.
          </p>
        )}
        {inherited?.placement && (
          <p>
            <strong>Canal:</strong> {inherited.placement}
          </p>
        )}
        {inherited?.utmCampaign && (
          <p>
            <strong>UTM:</strong> {inherited.utmCampaign}
          </p>
        )}
      </div>

      {role === 'creative' && campaignId && (
        <div className="np-field">
          <Label className="np-label">Anúncio (obrigatório)</Label>
          {loadingAds ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Carregando anúncios…
            </div>
          ) : adsError ? (
            <p className="text-xs text-destructive">{adsError}</p>
          ) : (
            <Select
              value={inherited?.adId || ''}
              onValueChange={(value) => {
                const ad = ads.find((a) => a.id === value);
                if (!ad) return;
                loadAdCreative(ad.id, ad.name);
              }}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Selecione o anúncio" />
              </SelectTrigger>
              <SelectContent>
                {ads.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    <FunilMetaStatusOption name={a.name} status={a.status} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {!inherited?.adId && (
            <p className="text-xs text-amber-700 mt-1">Escolha o anúncio para métricas deste criativo.</p>
          )}
          {inherited?.adId && (inherited?.adStatus || ads.find((a) => a.id === inherited.adId)?.status) && (
            <FunilMetaStatusSelected
              title="Anúncio"
              name={inherited.adName}
              status={inherited.adStatus || ads.find((a) => a.id === inherited.adId)?.status}
            />
          )}
          {(thumbLoading || panelThumb) && (
            <div className="funil-creative-preview mt-2">
              {thumbLoading ? (
                <div className="funil-creative-preview__loading">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : panelThumb ? (
                <img
                  src={panelThumb}
                  alt={inherited?.adName || 'Criativo'}
                  className="funil-creative-preview__img"
                  referrerPolicy="no-referrer"
                />
              ) : null}
            </div>
          )}
        </div>
      )}

      {onClearInheritance && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full text-destructive hover:text-destructive mt-2"
          onClick={onClearInheritance}
        >
          <Unlink className="h-3 w-3 mr-2" />
          Remover herança
        </Button>
      )}
    </div>
  );
}
