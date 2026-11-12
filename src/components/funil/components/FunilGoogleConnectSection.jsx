import React, { useEffect } from 'react';
import { Loader2, Link2, Unlink, Copy, Check } from 'lucide-react';
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
import {
  buildDefaultGoogleLinkFromAdGroup,
  buildDefaultGoogleLinkFromCampaign,
  formatGoogleUtmQueryString,
  hasGoogleLink,
} from '@/lib/funilGoogleLink';
import { getGoogleStatusLabel, normalizeGoogleStatus } from '@/lib/funilGoogleStatus';

function Field({ label, value, onChange, placeholder }) {
  return (
    <div className="np-field">
      <label className="np-label">{label}</label>
      <input
        className="np-input"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

export default function FunilGoogleConnectSection({
  clienteId,
  googleLink,
  onGoogleLinkChange,
  onRequestLinkAccounts,
  nodeType,
}) {
  const {
    linkedAccounts,
    loadingAccounts,
    campaigns,
    loadingCampaigns,
    campaignsError,
    adGroups,
    loadingAdGroups,
    adGroupsError,
    keywords,
    loadingKeywords,
    keywordsError,
    fetchCampaigns,
    fetchAdGroups,
    fetchKeywords,
    clearCampaigns,
    clearAdGroups,
    clearKeywords,
    hasLinkedAccounts,
  } = useFunilGoogleOptions(clienteId);

  const link = googleLink || {};
  const customerId = link.customerId || '';

  useEffect(() => {
    if (customerId) {
      fetchCampaigns(customerId);
    } else {
      clearCampaigns();
      clearAdGroups();
      clearKeywords();
    }
  }, [customerId, fetchCampaigns, clearCampaigns, clearAdGroups, clearKeywords]);

  useEffect(() => {
    if (customerId && link.campaignId) {
      fetchAdGroups(customerId, link.campaignId);
    } else {
      clearAdGroups();
    }
  }, [customerId, link.campaignId, fetchAdGroups, clearAdGroups]);

  useEffect(() => {
    if (customerId && link.campaignId && (nodeType === 'google' || link.campaignType === 'SEARCH')) {
      fetchKeywords(customerId, link.campaignId, link.adGroupId);
    } else {
      clearKeywords();
    }
  }, [customerId, link.campaignId, link.adGroupId, nodeType, link.campaignType, fetchKeywords, clearKeywords]);

  const [copiedUtms, setCopiedUtms] = React.useState(false);

  const patchLink = (patch) => {
    onGoogleLinkChange({ ...link, ...patch });
  };

  const copyUtms = async () => {
    const qs = formatGoogleUtmQueryString(link);
    if (!qs) return;
    try {
      await navigator.clipboard.writeText(qs);
      setCopiedUtms(true);
      setTimeout(() => setCopiedUtms(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleCustomerChange = (value) => {
    const acc = linkedAccounts.find((a) => a.google_customer_id === value);
    onGoogleLinkChange({
      customerId: value,
      customerName: acc?.google_customer_name || value,
      campaignId: null,
      campaignName: null,
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: '',
    });
  };

  const handleCampaignChange = (value) => {
    const camp = campaigns.find((c) => c.id === value);
    const acc = linkedAccounts.find((a) => a.google_customer_id === customerId);
    if (!acc || !camp) return;
    onGoogleLinkChange(buildDefaultGoogleLinkFromCampaign(acc, camp));
  };

  const handleAdGroupChange = (value) => {
    if (value === '__none__') {
      handleCampaignChange(link.campaignId);
      return;
    }
    const group = adGroups.find((g) => g.id === value);
    const camp = campaigns.find((c) => c.id === link.campaignId);
    const acc = linkedAccounts.find((a) => a.google_customer_id === customerId);
    if (!acc || !camp || !group) return;
    onGoogleLinkChange(buildDefaultGoogleLinkFromAdGroup(acc, camp, group));
  };

  if (!clienteId) return null;

  return (
    <div className="funil-google-connect">
      <div className="funil-google-connect__head">
        <Link2 className="h-4 w-4 text-[#4285F4]" />
        <span className="funil-google-connect__title">Conectar Google Ads</span>
      </div>

      {!hasLinkedAccounts && !loadingAccounts && (
        <div className="funil-google-connect__empty">
          <p className="text-xs text-muted-foreground">
            Nenhuma conta Google Ads vinculada a este cliente.
          </p>
          {onRequestLinkAccounts && (
            <Button type="button" variant="outline" size="sm" className="mt-2 w-full" onClick={onRequestLinkAccounts}>
              Vincular contas Google Ads
            </Button>
          )}
        </div>
      )}

      {(hasLinkedAccounts || loadingAccounts) && (
        <div className="funil-google-connect__fields">
          <div className="np-field">
            <Label className="np-label">Conta Google Ads</Label>
            {loadingAccounts ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="h-3 w-3 animate-spin" /> Carregando…
              </div>
            ) : (
              <Select value={customerId || ''} onValueChange={handleCustomerChange}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Selecione a conta" />
                </SelectTrigger>
                <SelectContent>
                  {linkedAccounts.map((acc) => (
                    <SelectItem key={acc.google_customer_id} value={acc.google_customer_id}>
                      {acc.google_customer_name || acc.google_customer_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {customerId && (
            <div className="np-field">
              <Label className="np-label">Campanha</Label>
              {loadingCampaigns ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Buscando campanhas…
                </div>
              ) : campaignsError ? (
                <p className="text-xs text-destructive">{campaignsError}</p>
              ) : (
                <Select value={link.campaignId || ''} onValueChange={handleCampaignChange}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Selecione a campanha" />
                  </SelectTrigger>
                  <SelectContent>
                    {campaigns.map((c) => {
                      const tone = normalizeGoogleStatus(c.status);
                      const statusLbl = c.status ? getGoogleStatusLabel(c.status) : '';
                      return (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                          {statusLbl ? ` · ${statusLbl}` : ''}
                          {tone === 'paused' ? ' ⏸' : ''}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {link.campaignId && adGroups.length > 0 && (
            <div className="np-field">
              <Label className="np-label">Grupo de anúncios (opcional)</Label>
              {loadingAdGroups ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Carregando grupos…
                </div>
              ) : adGroupsError ? (
                <p className="text-xs text-destructive">{adGroupsError}</p>
              ) : (
                <Select value={link.adGroupId || '__none__'} onValueChange={handleAdGroupChange}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Todos os grupos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Todos / campanha —</SelectItem>
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

          {(nodeType === 'google' || link.campaignType === 'SEARCH') && link.campaignId && (
            <div className="np-field">
              <Label className="np-label">Palavras-chave (preview)</Label>
              {loadingKeywords ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Carregando…
                </div>
              ) : keywordsError ? (
                <p className="text-xs text-destructive">{keywordsError}</p>
              ) : keywords.length > 0 ? (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {keywords.slice(0, 8).map((k) => k.text).join(', ')}
                  {keywords.length > 8 ? ` (+${keywords.length - 8})` : ''}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Nenhuma keyword encontrada.</p>
              )}
            </div>
          )}

          {hasGoogleLink(link) && (
            <>
              <Field
                label="UTM Source"
                value={link.utmSource}
                onChange={(v) => patchLink({ utmSource: v })}
                placeholder="google"
              />
              <Field
                label="UTM Medium"
                value={link.utmMedium}
                onChange={(v) => patchLink({ utmMedium: v })}
                placeholder="cpc"
              />
              <Field
                label="UTM Campaign"
                value={link.utmCampaign}
                onChange={(v) => patchLink({ utmCampaign: v })}
                placeholder="nome_campanha"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full h-8 text-xs"
                onClick={copyUtms}
                disabled={!link.utmCampaign}
              >
                {copiedUtms ? (
                  <Check className="h-3.5 w-3.5 mr-1.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                )}
                Copiar UTMs para anúncios
              </Button>
              {link.campaignStatus && (
                <p className="text-xs text-muted-foreground">
                  Status da campanha:{' '}
                  <span className="font-medium text-foreground">
                    {getGoogleStatusLabel(link.campaignStatus)}
                  </span>
                </p>
              )}
            </>
          )}

          {hasGoogleLink(link) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full text-destructive hover:text-destructive"
              onClick={() => onGoogleLinkChange(null)}
            >
              <Unlink className="h-3 w-3 mr-2" />
              Limpar conexão
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
