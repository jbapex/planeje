import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  ExternalLink,
  HelpCircle,
  Link2,
  Loader2,
  MessageCircle,
  MousePointer2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RastreamentoHelp } from '@/components/crm/RastreamentoUi';
import { rastreamentoTabHelp } from '@/lib/rastreamentoHub';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import {
  classifyUazapiStatusPayload,
  uazapiBaseUrl,
} from '@/lib/rastreamentoWhatsappInstancia';
import {
  generateTrackableSlug,
  normalizePhoneDigits,
  publicTrackableLinkUrl,
  setHiddenMatchCode,
  siteWhatsappRewriteScript,
} from '@/lib/rastreamentoTrackableLink';

const ORIGIN_OPTIONS = [
  { value: 'site', label: 'Site (botão do site)' },
  { value: 'google_ads', label: 'Google Ads (URL final)' },
  { value: 'meta_ads', label: 'Meta → site (não é Click to WhatsApp)' },
];

const OPEN_MODE_OPTIONS = [
  {
    value: 'auto',
    title: 'Automático (recomendado)',
    hint: 'Detecta se é celular ou computador e abre da melhor forma.',
  },
  {
    value: 'app',
    title: 'Sempre no app do WhatsApp',
    hint: 'Força abrir o app instalado. Bom pra bio Insta, QR Code e cliques mobile.',
  },
  {
    value: 'web',
    title: 'Sempre no WhatsApp Web',
    hint: 'Força a versão web no navegador. Útil em campanhas focadas em desktop.',
  },
];

const DEFAULT_MESSAGE =
  'Olá! Vim pelo site / anúncio e gostaria de mais informações.';

function formatPhoneOption(phone, name, connected) {
  const digits = normalizePhoneDigits(phone);
  const label = String(name || 'Instância').trim() || 'Instância';
  if (!digits) return `${label} (sem número)`;
  return `${label} (${digits})${connected ? '' : ' · offline'}`;
}

function originShort(origin) {
  if (origin === 'google_ads') return 'Google Ads';
  if (origin === 'meta_ads') return 'Meta → site';
  return 'Site';
}

/**
 * Links rastreáveis — lista CQC + modais Editar / Pixel / Novo link.
 */
export default function RastreamentoTrackableLinks({ clienteId, clienteName, onChanged, onOpenMatchedLeads }) {
  const { toast } = useToast();
  const [links, setLinks] = useState([]);
  const [clickCounts, setClickCounts] = useState({});
  const [matchedCounts, setMatchedCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [probing, setProbing] = useState(false);
  const [pending, setPending] = useState('');
  const [copiedKey, setCopiedKey] = useState('');
  const [destinations, setDestinations] = useState([]);
  const [modal, setModal] = useState(null); // 'create' | 'pixel' | 'edit'
  const [focusLinkId, setFocusLinkId] = useState(null);

  const publicOrigin = useMemo(() => {
    if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
    return 'https://planeje.jbapex.com.br';
  }, []);

  const activeLinks = useMemo(() => links.filter((l) => l.is_active), [links]);

  const primarySiteLink = useMemo(
    () =>
      activeLinks.find((l) => l.is_default) ||
      activeLinks.find((l) => l.default_origin === 'site') ||
      activeLinks[0] ||
      null,
    [activeLinks]
  );

  const focusLink = useMemo(() => {
    if (focusLinkId) return links.find((l) => l.id === focusLinkId) || primarySiteLink;
    return primarySiteLink;
  }, [focusLinkId, links, primarySiteLink]);

  const editingLink = useMemo(
    () => (modal === 'edit' && focusLinkId ? links.find((l) => l.id === focusLinkId) : null),
    [modal, focusLinkId, links]
  );

  const copyText = async (key, text, okTitle) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(''), 1200);
      toast({ title: okTitle || 'Copiado' });
    } catch {
      toast({ variant: 'destructive', title: 'Não foi possível copiar' });
    }
  };

  const probeInstances = useCallback(async (instances) => {
    const list = instances || [];
    if (!list.length) {
      setDestinations([]);
      return;
    }
    setProbing(true);
    const probed = await Promise.all(
      list.map(async (instance) => {
        const base = {
          id: instance.id,
          name: instance.name || 'Instância',
          phone: '',
          connected: instance.instance_status === 'connected',
          status: instance.instance_status || 'disconnected',
        };
        if (!instance.subdomain || !instance.token) return base;
        try {
          const url = `${uazapiBaseUrl(instance.subdomain)}/instance/status?_=${Date.now()}`;
          const res = await fetch(url, {
            cache: 'no-store',
            headers: { token: String(instance.token).trim() },
          });
          const json = await res.json().catch(() => ({}));
          const parsed = classifyUazapiStatusPayload(json);
          return {
            ...base,
            phone: parsed.phone || '',
            connected: Boolean(parsed.connected),
            status: parsed.status || base.status,
          };
        } catch {
          return base;
        }
      })
    );
    setDestinations(probed);
    setProbing(false);
  }, []);

  const load = useCallback(async () => {
    if (!clienteId) {
      setLinks([]);
      setClickCounts({});
      setMatchedCounts({});
      setDestinations([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: rows, error }, { data: instances }, { data: clicks }] = await Promise.all([
      supabase
        .from('cliente_rastreamento_links')
        .select(
          'id, slug, label, destination_phone, default_origin, is_default, is_active, whatsapp_config_id, initial_message, append_match_code, whatsapp_open_mode, default_utm_source, default_utm_medium, default_utm_campaign, default_utm_content, default_utm_term, campaign_id, campaign_name, adset_id, adset_name, created_at'
        )
        .eq('cliente_id', clienteId)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true }),
      supabase
        .from('cliente_whatsapp_config')
        .select('id, name, subdomain, token, instance_status')
        .eq('cliente_id', clienteId)
        .is('archived_at', null)
        .order('updated_at', { ascending: false }),
      supabase
        .from('cliente_rastreamento_link_clicks')
        .select('link_id, matched_at')
        .eq('cliente_id', clienteId),
    ]);
    if (error) {
      toast({ variant: 'destructive', title: 'Não foi possível carregar os links', description: error.message });
      setLinks([]);
      setClickCounts({});
      setMatchedCounts({});
    } else {
      setLinks(rows || []);
      const counts = {};
      const matched = {};
      for (const row of clicks || []) {
        const id = row.link_id;
        if (!id) continue;
        counts[id] = (counts[id] || 0) + 1;
        if (row.matched_at) matched[id] = (matched[id] || 0) + 1;
      }
      setClickCounts(counts);
      setMatchedCounts(matched);
    }
    setLoading(false);
    await probeInstances(instances || []);
  }, [clienteId, probeInstances, toast]);

  useEffect(() => {
    void load();
  }, [clienteId]); // eslint-disable-line react-hooks/exhaustive-deps

  const openCreate = () => {
    setFocusLinkId(null);
    setModal('create');
  };

  const openEdit = (link) => {
    setFocusLinkId(link.id);
    setModal('edit');
  };

  const openPixel = (link) => {
    setFocusLinkId(link?.id || primarySiteLink?.id || null);
    setModal('pixel');
  };

  const deactivate = async (link) => {
    if (!window.confirm(`Desativar o link “${link.label || link.slug}”?`)) return;
    setPending(link.id);
    const { error } = await supabase
      .from('cliente_rastreamento_links')
      .update({ is_active: false, is_default: false })
      .eq('id', link.id)
      .eq('cliente_id', clienteId);
    if (error) {
      toast({ variant: 'destructive', title: 'Falha ao desativar', description: error.message });
    } else {
      await load();
      onChanged?.();
    }
    setPending('');
  };

  if (!clienteId) return null;

  const linkUtm = (link) => ({
    default_utm_source: link?.default_utm_source,
    default_utm_medium: link?.default_utm_medium,
    default_utm_campaign: link?.default_utm_campaign,
    default_utm_content: link?.default_utm_content,
    default_utm_term: link?.default_utm_term,
  });

  const pixelUrl = focusLink ? publicTrackableLinkUrl(publicOrigin, focusLink.slug, linkUtm(focusLink)) : '';
  const pixelScript = pixelUrl ? siteWhatsappRewriteScript(pixelUrl.split('?')[0]) : '';

  return (
    <div className="rt-links" id="rastreamento-links">
      <header className="rt-links__header">
        <div className="rt-links__intro min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h2 className="rt-links__title">Links de Rastreamento</h2>
            <RastreamentoHelp label="Como funciona?">{rastreamentoTabHelp('links')}</RastreamentoHelp>
            <button
              type="button"
              className="rt-links__how"
              onClick={() =>
                toast({
                  title: 'Como funciona',
                  description:
                    'O link /r/ grava o clique (gclid/UTM), abre o WhatsApp com mensagem + código PJ-XXXXXX e casa na 1ª mensagem. O Pixel guarda cookies 7 dias — não é pixel Meta.',
                })
              }
            >
              <HelpCircle className="h-3.5 w-3.5" />
              Como funciona?
            </button>
          </div>
          <p className="rt-links__subtitle">
            Crie links rastreáveis para campanhas de site, bio do Instagram, Google Ads etc.
          </p>
        </div>
        <div className="rt-links__actions">
          <Button
            type="button"
            variant="outline"
            className="rt-links__btn-pixel"
            disabled={!primarySiteLink}
            onClick={() => openPixel(primarySiteLink)}
          >
            <Code2 className="h-4 w-4 mr-1.5" />
            Pixel
          </Button>
          <Button type="button" className="rt-links__btn-new" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            Novo link
          </Button>
        </div>
      </header>

      {loading ? (
        <p className="rt-links-muted flex items-center gap-2 py-10 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando links…
        </p>
      ) : activeLinks.length === 0 ? (
        <div className="rt-links-empty">
          <Link2 className="h-8 w-8 text-slate-300" />
          <p>Nenhum link ativo.</p>
          <Button type="button" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            Novo link
          </Button>
        </div>
      ) : (
        <ul className="rt-links-list">
          {activeLinks.map((link) => {
            const url = publicTrackableLinkUrl(publicOrigin, link.slug, linkUtm(link));
            const destName = destinations.find((d) => d.id === link.whatsapp_config_id)?.name || null;
            const clicks = clickCounts[link.id] || 0;
            const matched = matchedCounts[link.id] || 0;
            return (
              <li key={link.id} className="rt-link-card">
                <div className="rt-link-card__top">
                  <div className="min-w-0">
                    <h3 className="rt-link-card__name">{link.label || 'Link'}</h3>
                    <div className="rt-link-card__url-row">
                      <a className="rt-link-card__url" href={url} target="_blank" rel="noreferrer">
                        {url}
                      </a>
                      <button
                        type="button"
                        className="rt-links-icon-btn"
                        title="Copiar"
                        onClick={() => void copyText(`link-${link.id}`, url, 'Link copiado')}
                      >
                        {copiedKey === `link-${link.id}` ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                      <a className="rt-links-icon-btn" href={url} target="_blank" rel="noreferrer" title="Abrir">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </div>
                  <div className="rt-link-card__ops">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rt-link-card__install"
                      onClick={() => openPixel(link)}
                    >
                      Instalar
                    </Button>
                    <button type="button" className="rt-links-icon-btn" title="Editar" onClick={() => openEdit(link)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="rt-links-icon-btn rt-links-icon-btn--danger"
                      title="Desativar"
                      disabled={pending === link.id}
                      onClick={() => void deactivate(link)}
                    >
                      {pending === link.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="rt-link-card__meta">
                  <span>
                    <strong>Número:</strong> {destName || link.destination_phone || '—'}
                  </span>
                  {clienteName ? (
                    <span>
                      <strong>Empresa:</strong> {clienteName}
                    </span>
                  ) : null}
                  <span className="rt-link-card__clicks">
                    <MousePointer2 className="h-3.5 w-3.5" />
                    {clicks} {clicks === 1 ? 'clique' : 'cliques'}
                  </span>
                  <button
                    type="button"
                    className="rt-link-card__msgs"
                    title="Ver leads/mensagens que chegaram com este link"
                    onClick={() => onOpenMatchedLeads?.(link.id)}
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    {matched} {matched === 1 ? 'mensagem' : 'mensagens'}
                  </button>
                  <span className="rt-link-card__origin">{originShort(link.default_origin)}</span>
                </div>

                {link.default_utm_campaign || link.default_utm_source ? (
                  <p className="rt-link-card__utm">
                    UTM: {[link.default_utm_source, link.default_utm_medium, link.default_utm_campaign]
                      .filter(Boolean)
                      .join(' / ')}
                  </p>
                ) : null}

                {link.initial_message ? (
                  <p className="rt-link-card__message">
                    <strong>Mensagem:</strong> “{link.initial_message}”
                  </p>
                ) : (
                  <p className="rt-link-card__message rt-link-card__message--empty">Sem mensagem inicial</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={modal === 'create'} onOpenChange={(open) => !open && setModal(null)}>
        <DialogContent className="rt-links-dialog sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo link</DialogTitle>
            <DialogDescription>Gere um /r/ com número, mensagem e origem padrão.</DialogDescription>
          </DialogHeader>
          <LinkFormModal
            mode="create"
            destinations={destinations}
            probing={probing}
            pending={pending}
            defaultOrigin="site"
            onCancel={() => setModal(null)}
            onSubmit={async (payload) => {
              setPending('create');
              let slug = generateTrackableSlug(8);
              let lastError = null;
              const hasDefault = activeLinks.some((l) => l.is_default);
              for (let attempt = 0; attempt < 5; attempt += 1) {
                const { error } = await supabase.from('cliente_rastreamento_links').insert({
                  cliente_id: clienteId,
                  slug,
                  label: payload.label.trim() || (hasDefault ? 'Campanha' : 'Padrão'),
                  destination_phone: payload.phone,
                  default_origin: payload.origin,
                  whatsapp_config_id: payload.configId,
                  initial_message: payload.message.trim() || null,
                  append_match_code: payload.appendCode,
                  whatsapp_open_mode: payload.openMode,
                  default_utm_source: payload.utmSource || null,
                  default_utm_medium: payload.utmMedium || null,
                  default_utm_campaign: payload.utmCampaign || null,
                  default_utm_content: payload.utmContent || null,
                  default_utm_term: payload.utmTerm || null,
                  campaign_id: payload.campaign_id,
                  campaign_name: payload.campaign_name,
                  adset_id: payload.adset_id,
                  adset_name: payload.adset_name,
                  is_default: !hasDefault,
                  is_active: true,
                });
                if (!error) {
                  toast({ title: 'Link criado', description: publicTrackableLinkUrl(publicOrigin, slug, {
                    default_utm_source: payload.utmSource,
                    default_utm_medium: payload.utmMedium,
                    default_utm_campaign: payload.utmCampaign,
                    default_utm_content: payload.utmContent,
                    default_utm_term: payload.utmTerm,
                  }) });
                  setModal(null);
                  await load();
                  onChanged?.();
                  setPending('');
                  return;
                }
                lastError = error;
                if (String(error.message || '').includes('duplicate') || error.code === '23505') {
                  slug = generateTrackableSlug(8);
                  continue;
                }
                break;
              }
              toast({
                variant: 'destructive',
                title: 'Não foi possível criar o link',
                description: lastError?.message || 'Tente de novo',
              });
              setPending('');
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={modal === 'edit' && Boolean(editingLink)} onOpenChange={(open) => !open && setModal(null)}>
        <DialogContent className="rt-links-dialog sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar link</DialogTitle>
            <DialogDescription className="font-mono text-xs">{editingLink?.slug}</DialogDescription>
          </DialogHeader>
          {editingLink ? (
            <LinkFormModal
              mode="edit"
              link={editingLink}
              destinations={destinations}
              probing={probing}
              pending={pending}
              onCancel={() => setModal(null)}
              onSubmit={async (payload) => {
                setPending(`msg-${editingLink.id}`);
                const updates = {
                  label: payload.label.trim() || editingLink.label,
                  destination_phone: payload.phone,
                  whatsapp_config_id: payload.configId,
                  initial_message: payload.message.trim() || null,
                  append_match_code: payload.appendCode,
                  whatsapp_open_mode: payload.openMode,
                  is_active: payload.isActive,
                  default_origin: payload.origin,
                  default_utm_source: payload.utmSource || null,
                  default_utm_medium: payload.utmMedium || null,
                  default_utm_campaign: payload.utmCampaign || null,
                  default_utm_content: payload.utmContent || null,
                  default_utm_term: payload.utmTerm || null,
                  campaign_id: payload.campaign_id,
                  campaign_name: payload.campaign_name,
                  adset_id: payload.adset_id,
                  adset_name: payload.adset_name,
                };
                if (!payload.isActive) updates.is_default = false;
                const { error } = await supabase
                  .from('cliente_rastreamento_links')
                  .update(updates)
                  .eq('id', editingLink.id)
                  .eq('cliente_id', clienteId);
                if (error) {
                  toast({ variant: 'destructive', title: 'Não salvou', description: error.message });
                } else {
                  toast({ title: 'Alterações salvas' });
                  setModal(null);
                  await load();
                  onChanged?.();
                }
                setPending('');
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={modal === 'pixel'} onOpenChange={(open) => !open && setModal(null)}>
        <DialogContent className="rt-links-dialog rt-links-dialog--pixel sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Pixel Planeje</DialogTitle>
            <DialogDescription>
              Instale este script no site do cliente (via Tag Manager ou direto no HTML) para capturar
              automaticamente os parâmetros de campanha (UTM, FBCLID, GCLID) e injetá-los nos links de
              rastreamento.
            </DialogDescription>
          </DialogHeader>
          {!pixelScript ? (
            <p className="rt-links-muted">Crie um link primeiro para gerar o script.</p>
          ) : (
            <>
              <div className="rt-pixel-code">
                <button
                  type="button"
                  className="rt-pixel-code__copy"
                  onClick={() => void copyText('pixel', pixelScript, 'Script copiado')}
                >
                  {copiedKey === 'pixel' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  Copiar
                </button>
                <pre>{pixelScript}</pre>
              </div>
              <div className="rt-pixel-info">
                <strong>Como funciona</strong>
                <p>
                  O Pixel salva os parâmetros da URL em cookies por <strong>7 dias</strong>. Quando o
                  visitante clicar num link de rastreamento do Planeje no site, esses cookies são
                  injetados automaticamente. Sem o Pixel, o link ainda funciona, mas só captura o que
                  estiver na URL naquele momento.
                </p>
                {focusLink?.label ? (
                  <p className="rt-pixel-info__link">Link de referência: {focusLink.label}</p>
                ) : null}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LinkFormModal({
  mode,
  link,
  destinations,
  probing,
  pending,
  defaultOrigin = 'site',
  onCancel,
  onSubmit,
}) {
  const preferred =
    destinations.find((d) => d.connected && normalizePhoneDigits(d.phone).length >= 10) ||
    destinations.find((d) => normalizePhoneDigits(d.phone).length >= 10) ||
    null;

  const [selectedConfigId, setSelectedConfigId] = useState(
    () => link?.whatsapp_config_id || preferred?.id || (destinations[0]?.id ?? '__manual__')
  );
  const [manualPhone, setManualPhone] = useState(() =>
    link && !link.whatsapp_config_id ? link.destination_phone || '' : ''
  );
  const [label, setLabel] = useState(link?.label || '');
  const [origin, setOrigin] = useState(link?.default_origin || defaultOrigin);
  const [message, setMessage] = useState(() => !link && defaultOrigin === 'google_ads'
    ? setHiddenMatchCode(DEFAULT_MESSAGE) : link?.initial_message || DEFAULT_MESSAGE);
  const [appendCode, setAppendCode] = useState(() => !link && defaultOrigin === 'google_ads'
    ? false : link?.append_match_code !== false);
  const [openMode, setOpenMode] = useState(link?.whatsapp_open_mode || 'auto');
  const [isActive, setIsActive] = useState(link?.is_active !== false);
  const [utmSource, setUtmSource] = useState(link?.default_utm_source || '');
  const [utmMedium, setUtmMedium] = useState(link?.default_utm_medium || '');
  const [utmCampaign, setUtmCampaign] = useState(link?.default_utm_campaign || '');
  const [utmContent, setUtmContent] = useState(link?.default_utm_content || '');
  const [utmTerm, setUtmTerm] = useState(link?.default_utm_term || '');
  const [campaignId, setCampaignId] = useState(link?.campaign_id || '');
  const [campaignName, setCampaignName] = useState(link?.campaign_name || '');
  const [adsetId, setAdsetId] = useState(link?.adset_id || '');
  const [adsetName, setAdsetName] = useState(link?.adset_name || '');

  useEffect(() => {
    setCampaignId(link?.campaign_id || '');
    setCampaignName(link?.campaign_name || '');
    setAdsetId(link?.adset_id || '');
    setAdsetName(link?.adset_name || '');
  }, [link]);

  useEffect(() => {
    if (!link) return;
    setSelectedConfigId(link.whatsapp_config_id || preferred?.id || '__manual__');
    setManualPhone(link.whatsapp_config_id ? '' : link.destination_phone || '');
    setLabel(link.label || '');
    setOrigin(link.default_origin || 'site');
    setMessage(link.initial_message || '');
    setAppendCode(link.append_match_code !== false);
    setOpenMode(link.whatsapp_open_mode || 'auto');
    setIsActive(link.is_active !== false);
    setUtmSource(link.default_utm_source || '');
    setUtmMedium(link.default_utm_medium || '');
    setUtmCampaign(link.default_utm_campaign || '');
    setUtmContent(link.default_utm_content || '');
    setUtmTerm(link.default_utm_term || '');
  }, [link, preferred?.id]);

  const selected = destinations.find((d) => d.id === selectedConfigId) || null;

  const resolvePhone = () => {
    if (selectedConfigId === '__manual__') return normalizePhoneDigits(manualPhone);
    return normalizePhoneDigits(selected?.phone || link?.destination_phone || '');
  };

  const busy = pending === 'create' || (link && pending === `msg-${link.id}`);
  const hiddenCode = /\{codigo_oculto\}/i.test(message);

  return (
    <form
      className="rt-links-modal-form"
      onSubmit={(e) => {
        e.preventDefault();
        const phone = resolvePhone();
        if (!phone || phone.length < 10) return;
        const attribution = { campaign_id: campaignId.trim() || null, campaign_name: campaignName.trim() || null,
          adset_id: adsetId.trim() || null, adset_name: adsetName.trim() || null };
        if ([attribution.campaign_id, attribution.adset_id].some((id) => id && !/^\d{1,32}$/.test(id))
          || [attribution.campaign_name, attribution.adset_name].some((name) => name?.length > 500)) return;
        void onSubmit({
          label,
          origin,
          message,
          appendCode,
          openMode,
          isActive,
          phone,
          configId: selectedConfigId !== '__manual__' ? selectedConfigId : null,
          utmSource: utmSource.trim(),
          utmMedium: utmMedium.trim(),
          utmCampaign: utmCampaign.trim(),
          utmContent: utmContent.trim(),
          utmTerm: utmTerm.trim(),
          ...attribution,
        });
      }}
    >
      {mode === 'edit' && link ? (
        <label className="rt-links-field">
          <span>ID</span>
          <Input readOnly value={link.slug} className="font-mono text-xs" />
        </label>
      ) : null}

      <label className="rt-links-field">
        <span>Identificador</span>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Ex.: google_ads_casas_chales"
        />
      </label>

      <label className="rt-links-field">
        <span>Número de destino</span>
        <select
          value={selectedConfigId}
          onChange={(e) => setSelectedConfigId(e.target.value)}
          disabled={probing}
        >
          {destinations.length === 0 ? (
            <option value="__manual__">Digitar número…</option>
          ) : (
            destinations.map((d) => (
              <option key={d.id} value={d.id}>
                {formatPhoneOption(d.phone, d.name, d.connected)}
              </option>
            ))
          )}
          <option value="__manual__">Outro número (digitar)…</option>
        </select>
        <small className="rt-links-field__hint">
          Novos cliques serão direcionados para este número.
        </small>
      </label>

      {selectedConfigId === '__manual__' ? (
        <label className="rt-links-field">
          <span>WhatsApp (DDI+número)</span>
          <Input value={manualPhone} onChange={(e) => setManualPhone(e.target.value)} placeholder="5541999998888" />
        </label>
      ) : null}

      <label className="rt-links-field">
        <span>Uso padrão</span>
        <select value={origin} onChange={(e) => {
          const nextOrigin = e.target.value;
          setOrigin(nextOrigin);
          if (mode === 'create' && nextOrigin === 'google_ads') {
            setMessage((current) => setHiddenMatchCode(current));
            setAppendCode(false);
          }
        }}>
          {ORIGIN_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </label>

      <details className="rt-links-utm">
        <summary>Campanha e conjunto (opcional)</summary>
        <div className="rt-links-utm__grid">
          <label className="rt-links-field">
            <span>ID da campanha</span>
            <Input name="campaign_id" aria-label="ID da campanha" inputMode="numeric" pattern="[0-9]{1,32}" maxLength={32} value={campaignId} onChange={(e) => setCampaignId(e.target.value)} />
          </label>
          <label className="rt-links-field">
            <span>Nome da campanha</span>
            <Input name="campaign_name" aria-label="Nome da campanha" maxLength={500} value={campaignName} onChange={(e) => setCampaignName(e.target.value)} />
          </label>
          <label className="rt-links-field">
            <span>ID do conjunto</span>
            <Input name="adset_id" aria-label="ID do conjunto" inputMode="numeric" pattern="[0-9]{1,32}" maxLength={32} value={adsetId} onChange={(e) => setAdsetId(e.target.value)} />
          </label>
          <label className="rt-links-field">
            <span>Nome do conjunto</span>
            <Input name="adset_name" aria-label="Nome do conjunto" maxLength={500} value={adsetName} onChange={(e) => setAdsetName(e.target.value)} />
          </label>
        </div>
      </details>

      <fieldset className="rt-links-utm">
        <legend>UTM no link (opcional)</legend>
        <p className="rt-links-field__hint" style={{ marginBottom: 8 }}>
          Entram na URL copiada e no clique se o site/anúncio não mandar UTM (ex.: Meta → site).
        </p>
        <div className="rt-links-utm__grid">
          <label className="rt-links-field">
            <span>utm_source</span>
            <Input value={utmSource} onChange={(e) => setUtmSource(e.target.value)} placeholder={origin === 'meta_ads' ? 'facebook' : origin === 'google_ads' ? 'google' : 'site'} />
          </label>
          <label className="rt-links-field">
            <span>utm_medium</span>
            <Input value={utmMedium} onChange={(e) => setUtmMedium(e.target.value)} placeholder="cpc" />
          </label>
          <label className="rt-links-field">
            <span>utm_campaign</span>
            <Input value={utmCampaign} onChange={(e) => setUtmCampaign(e.target.value)} placeholder="nome_da_campanha" />
          </label>
          <label className="rt-links-field">
            <span>utm_content</span>
            <Input value={utmContent} onChange={(e) => setUtmContent(e.target.value)} placeholder="anuncio_1" />
          </label>
          <label className="rt-links-field rt-links-field--full">
            <span>utm_term</span>
            <Input value={utmTerm} onChange={(e) => setUtmTerm(e.target.value)} placeholder="opcional" />
          </label>
        </div>
      </fieldset>

      <label className="rt-links-field">
        <span>Mensagem inicial (opcional)</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={DEFAULT_MESSAGE}
          maxLength={900}
          rows={4}
        />
        <small className="rt-links-field__hint">
          Mantenha o identificador na mensagem enviada para associar o clique e a campanha à conversa.
        </small>
      </label>

      <label className="rt-links-check">
        <input type="checkbox" checked={hiddenCode} onChange={(e) => {
          const enabled = e.target.checked;
          setMessage((current) => setHiddenMatchCode(current, enabled));
          if (enabled) setAppendCode(false);
        }} />
        <span>Identificar clique sem mostrar código</span>
      </label>
      <label className="rt-links-check">
        <input type="checkbox" checked={appendCode && !hiddenCode} disabled={hiddenCode} onChange={(e) => setAppendCode(e.target.checked)} />
        <span>Mostrar código de atendimento</span>
      </label>
      {!appendCode && !hiddenCode ? <p className="rt-links-field__hint">
        Sem código, a mensagem completa identifica a origem quando é exclusiva de um link deste cliente.
        As UTMs vêm da configuração do link; o clique individual não é identificado.
      </p> : null}

      <fieldset className="rt-links-open-modes">
        <legend>Como o link deve abrir o WhatsApp?</legend>
        {OPEN_MODE_OPTIONS.map((opt) => (
          <label key={opt.value} className={`rt-links-open-mode${openMode === opt.value ? ' is-active' : ''}`}>
            <input
              type="radio"
              name="whatsapp_open_mode"
              value={opt.value}
              checked={openMode === opt.value}
              onChange={() => setOpenMode(opt.value)}
            />
            <span>
              <strong>{opt.title}</strong>
              <small>{opt.hint}</small>
            </span>
          </label>
        ))}
      </fieldset>

      {mode === 'edit' ? (
        <label className="rt-links-field">
          <span>Status</span>
          <select value={isActive ? 'active' : 'inactive'} onChange={(e) => setIsActive(e.target.value === 'active')}>
            <option value="active">Ativo</option>
            <option value="inactive">Inativo</option>
          </select>
        </label>
      ) : null}

      <div className="rt-links-modal-form__footer">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" className="flex-1" disabled={busy || probing}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {mode === 'edit' ? 'Salvar alterações' : 'Criar link'}
        </Button>
      </div>
    </form>
  );
}
