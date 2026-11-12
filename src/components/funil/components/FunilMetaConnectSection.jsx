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
import { useFunilMetaOptions } from '@/hooks/useFunilMetaOptions';
import {
  buildDefaultMetaLinkFromAd,
  buildDefaultMetaLinkFromAdSet,
  buildDefaultMetaLinkFromCampaign,
  hasMetaLink,
} from '@/lib/funilMetaLink';
import {
  FunilMetaStatusOption,
  FunilMetaStatusSelected,
} from '@/components/funil/components/FunilMetaStatus';

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

export default function FunilMetaConnectSection({
  clienteId,
  metaLink,
  onMetaLinkChange,
  onRequestLinkAccounts,
}) {
  const {
    linkedAccounts,
    loadingAccounts,
    campaigns,
    loadingCampaigns,
    campaignsError,
    adSets,
    loadingAdSets,
    adSetsError,
    ads,
    loadingAds,
    adsError,
    fetchCampaigns,
    fetchAdSets,
    fetchAds,
    clearCampaigns,
    clearAdSets,
    clearAds,
    hasLinkedAccounts,
  } = useFunilMetaOptions(clienteId);

  const link = metaLink || {};
  const accountId = link.accountId || '';

  const selectedCampaign = campaigns.find((c) => c.id === link.campaignId);
  const selectedAdSet = adSets.find((a) => a.id === link.adSetId);
  const selectedAd = ads.find((a) => a.id === link.adId);
  const campaignStatus = link.campaignStatus || selectedCampaign?.status;
  const adSetStatus = link.adSetStatus || selectedAdSet?.status;
  const adStatus = link.adStatus || selectedAd?.status;

  useEffect(() => {
    if (accountId) {
      fetchCampaigns(accountId);
    } else {
      clearCampaigns();
      clearAds();
    }
  }, [accountId, fetchCampaigns, clearCampaigns, clearAds]);

  useEffect(() => {
    if (link.campaignId) {
      fetchAdSets(link.campaignId);
    } else {
      clearAdSets();
      clearAds();
    }
  }, [link.campaignId, fetchAdSets, clearAdSets, clearAds]);

  useEffect(() => {
    if (link.campaignId) {
      fetchAds(link.campaignId, { adSetId: link.adSetId || undefined });
    } else {
      clearAds();
    }
  }, [link.campaignId, link.adSetId, fetchAds, clearAds]);

  const patchLink = (patch) => {
    onMetaLinkChange({ ...link, ...patch });
  };

  const handleAccountChange = (value) => {
    const acc = linkedAccounts.find((a) => a.meta_account_id === value);
    onMetaLinkChange({
      accountId: value,
      accountName: acc?.meta_account_name || value,
      campaignId: null,
      campaignName: null,
      adId: null,
      adName: null,
      utmSource: 'meta',
      utmMedium: 'paid',
      utmCampaign: '',
    });
  };

  const handleCampaignChange = (value) => {
    const camp = campaigns.find((c) => c.id === value);
    const acc = linkedAccounts.find((a) => a.meta_account_id === accountId);
    if (!acc || !camp) return;
    onMetaLinkChange(buildDefaultMetaLinkFromCampaign(
      { meta_account_id: acc.meta_account_id, meta_account_name: acc.meta_account_name },
      camp
    ));
  };

  const handleAdSetChange = (value) => {
    if (value === '__none__') {
      handleCampaignChange(link.campaignId);
      return;
    }
    const adSet = adSets.find((a) => a.id === value);
    const camp = campaigns.find((c) => c.id === link.campaignId);
    const acc = linkedAccounts.find((a) => a.meta_account_id === accountId);
    if (!acc || !camp || !adSet) return;
    onMetaLinkChange(buildDefaultMetaLinkFromAdSet(
      { meta_account_id: acc.meta_account_id, meta_account_name: acc.meta_account_name },
      camp,
      adSet
    ));
  };

  const handleAdChange = (value) => {
    if (value === '__none__') {
      const camp = campaigns.find((c) => c.id === link.campaignId);
      const acc = linkedAccounts.find((a) => a.meta_account_id === accountId);
      if (acc && camp) {
        onMetaLinkChange(buildDefaultMetaLinkFromCampaign(
          { meta_account_id: acc.meta_account_id, meta_account_name: acc.meta_account_name },
          camp
        ));
      }
      return;
    }
    const ad = ads.find((a) => a.id === value);
    const camp = campaigns.find((c) => c.id === link.campaignId);
    const adSet = adSets.find((a) => a.id === link.adSetId);
    const acc = linkedAccounts.find((a) => a.meta_account_id === accountId);
    if (!acc || !camp || !ad) return;
    onMetaLinkChange(buildDefaultMetaLinkFromAd(
      { meta_account_id: acc.meta_account_id, meta_account_name: acc.meta_account_name },
      camp,
      ad,
      adSet
    ));
  };

  if (!clienteId) return null;

  return (
    <div className="funil-meta-connect">
      <div className="funil-meta-connect__head">
        <Link2 className="h-4 w-4 text-[#1877F2]" />
        <span className="funil-meta-connect__title">Conectar Meta</span>
      </div>

      {!hasLinkedAccounts && !loadingAccounts && (
        <div className="funil-meta-connect__empty">
          <p className="text-xs text-muted-foreground">
            Nenhuma conta Meta vinculada a este cliente.
          </p>
          {onRequestLinkAccounts && (
            <Button type="button" variant="outline" size="sm" className="mt-2 w-full" onClick={onRequestLinkAccounts}>
              Vincular contas Meta
            </Button>
          )}
        </div>
      )}

      {(hasLinkedAccounts || loadingAccounts) && (
        <div className="funil-meta-connect__fields">
          <div className="np-field">
            <Label className="np-label">Conta Meta</Label>
            {loadingAccounts ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="h-3 w-3 animate-spin" /> Carregando…
              </div>
            ) : (
              <Select value={accountId || ''} onValueChange={handleAccountChange}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Selecione a conta" />
                </SelectTrigger>
                <SelectContent>
                  {linkedAccounts.map((acc) => (
                    <SelectItem key={acc.meta_account_id} value={acc.meta_account_id}>
                      {acc.meta_account_name || acc.meta_account_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {accountId && (
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
                  <SelectTrigger className="h-9 text-xs funil-meta-select-trigger">
                    <SelectValue placeholder="Selecione a campanha" />
                  </SelectTrigger>
                  <SelectContent>
                    {campaigns.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="funil-meta-select-item">
                        <FunilMetaStatusOption name={c.name} status={c.status} />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {link.campaignId && campaignStatus && (
                <FunilMetaStatusSelected
                  title="Campanha selecionada"
                  name={link.campaignName || selectedCampaign?.name}
                  status={campaignStatus}
                />
              )}
            </div>
          )}

          {link.campaignId && adSets.length > 0 && (
            <div className="np-field">
              <Label className="np-label">Conjunto de anúncios (opcional)</Label>
              {loadingAdSets ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Carregando conjuntos…
                </div>
              ) : adSetsError ? (
                <p className="text-xs text-destructive">{adSetsError}</p>
              ) : (
                <Select value={link.adSetId || '__none__'} onValueChange={handleAdSetChange}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Todos os conjuntos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Todos / campanha —</SelectItem>
                    {adSets.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        <FunilMetaStatusOption name={a.name} status={a.status} />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {link.adSetId && adSetStatus && (
                <FunilMetaStatusSelected
                  title="Conjunto selecionado"
                  name={link.adSetName || selectedAdSet?.name}
                  status={adSetStatus}
                />
              )}
            </div>
          )}

          {link.campaignId && (
            <div className="np-field">
              <Label className="np-label">Anúncio (opcional)</Label>
              {loadingAds ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Carregando anúncios…
                </div>
              ) : adsError ? (
                <p className="text-xs text-destructive">{adsError}</p>
              ) : (
                <Select value={link.adId || '__none__'} onValueChange={handleAdChange}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Todos os anúncios da campanha" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Todos / não especificar —</SelectItem>
                    {ads.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        <FunilMetaStatusOption name={a.name} status={a.status} />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {link.adId && adStatus && (
                <FunilMetaStatusSelected
                  title="Anúncio selecionado"
                  name={link.adName || selectedAd?.name}
                  status={adStatus}
                />
              )}
            </div>
          )}

          {hasMetaLink(link) && (
            <>
              <Field
                label="UTM Source"
                value={link.utmSource}
                onChange={(v) => patchLink({ utmSource: v })}
                placeholder="meta"
              />
              <Field
                label="UTM Medium"
                value={link.utmMedium}
                onChange={(v) => patchLink({ utmMedium: v })}
                placeholder="paid"
              />
              <Field
                label="UTM Campaign"
                value={link.utmCampaign}
                onChange={(v) => patchLink({ utmCampaign: v })}
                placeholder="nome_campanha"
              />
            </>
          )}

          {hasMetaLink(link) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full text-destructive hover:text-destructive"
              onClick={() => onMetaLinkChange(null)}
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
