import React, { useEffect } from 'react';
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
import { useFunilGoogleOptions } from '@/hooks/useFunilGoogleOptions';
import { getInheritedGoogleLink, getParentNode, getFunilNodeRole } from '@/lib/funilNodeGraph';

export default function FunilInheritedGoogleSection({
  node,
  nodes,
  edges,
  onLinkOverrideChange,
  onClearInheritance,
}) {
  const parent = getParentNode(node.id, nodes, edges);
  const inherited = getInheritedGoogleLink(node, nodes, edges);
  const role = getFunilNodeRole(node.data?.type);

  const {
    adGroups,
    loadingAdGroups,
    adGroupsError,
    keywords,
    loadingKeywords,
    fetchAdGroups,
    fetchKeywords,
    clearAdGroups,
    clearKeywords,
  } = useFunilGoogleOptions(null);

  const customerId = inherited?.customerId;
  const campaignId = inherited?.campaignId;

  useEffect(() => {
    if (customerId && campaignId) fetchAdGroups(customerId, campaignId);
    else clearAdGroups();
  }, [customerId, campaignId, fetchAdGroups, clearAdGroups]);

  useEffect(() => {
    if (customerId && campaignId) {
      fetchKeywords(customerId, campaignId, inherited?.adGroupId);
    } else {
      clearKeywords();
    }
  }, [customerId, campaignId, inherited?.adGroupId, fetchKeywords, clearKeywords]);

  if (!parent) {
    return (
      <div className="funil-inherited-connect funil-inherited-connect--warn">
        <p className="text-xs text-muted-foreground">
          Conecte este nó à campanha Google Ads arrastando uma aresta do nó pai.
        </p>
      </div>
    );
  }

  return (
    <div className="funil-inherited-connect">
      <div className="funil-inherited-connect__head">
        <Link2 className="h-4 w-4 text-[#4285F4]" />
        <span className="funil-inherited-connect__title">Herdado do Google Ads</span>
      </div>

      <div className="funil-inherited-connect__summary text-xs text-muted-foreground space-y-1">
        <p>
          <strong>Pai:</strong> {parent.data?.label}
        </p>
        <p>
          <strong>Campanha:</strong> {inherited?.campaignName || '—'}
        </p>
        {inherited?.utmCampaign && (
          <p>
            <strong>UTM:</strong> {inherited.utmCampaign}
          </p>
        )}
      </div>

      {(role === 'creative' || role === 'channel') && campaignId && adGroups.length > 0 && (
        <div className="np-field">
          <Label className="np-label">Grupo de anúncios</Label>
          {loadingAdGroups ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : adGroupsError ? (
            <p className="text-xs text-destructive">{adGroupsError}</p>
          ) : (
            <Select
              value={inherited?.adGroupId || '__none__'}
              onValueChange={(value) => {
                if (value === '__none__') {
                  onLinkOverrideChange({ adGroupId: null, adGroupName: null });
                  return;
                }
                const g = adGroups.find((x) => x.id === value);
                onLinkOverrideChange({ adGroupId: g?.id, adGroupName: g?.name });
              }}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Grupo (opcional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Campanha inteira —</SelectItem>
                {adGroups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {role === 'creative' && keywords.length > 0 && (
        <div className="np-field">
          <Label className="np-label">Keywords (preview)</Label>
          {loadingKeywords ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <p className="text-xs text-muted-foreground">
              {keywords.slice(0, 6).map((k) => k.text).join(', ')}
            </p>
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
