import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Check,
  CheckCircle2,
  Copy,
  Database,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Unplug,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { RastreamentoSectionTitle } from '@/components/crm/RastreamentoUi';
import { rastreamentoTabHelp } from '@/lib/rastreamentoHub';
import {
  activateClienteMetaConnection,
  discoverClienteMetaAssets,
  fetchClienteMetaCtwaSettings,
  listClienteMetaTokenSources,
  reuseClienteMetaToken,
  testClienteMetaConnection,
  validateClienteMetaToken,
} from '@/lib/metaCtwaClientToken';
import { supabase } from '@/lib/customSupabaseClient';
import {
  canActivateManualMeta,
  formatMetaTokenSourceLabel,
  groupMetaTokenSources,
  hydrateConnectionFromCliente,
  metaManualSetupSteps,
  metaManualStatusLabel,
  pageSelectPlaceholder,
  parseMetaAdAccountIds,
  pixelSelectPlaceholder,
  resolveManualMetaDraft,
  withSavedManualAsset,
} from '@/lib/rastreamentoMetaManual';

function AssetSelect({ label, value, onChange, options, placeholder, disabled }) {
  return (
    <label className="meta-manual-field">
      <span>{label}</span>
      <select
        className="meta-manual-select"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        disabled={disabled}
      >
        <option value="">{placeholder}</option>
        {(options || []).map((item) => (
          <option key={item.id} value={item.id}>
            {item.name} · {item.id}
          </option>
        ))}
      </select>
    </label>
  );
}

function StepPills({ steps }) {
  return (
    <ol className="meta-manual-steps" aria-label="Etapas da conexão Meta">
      {steps.map((step, index) => (
        <li
          key={step.id}
          className={step.done ? 'is-done' : step.active ? 'is-active' : ''}
        >
          <span>{index + 1}</span>
          {step.label}
        </li>
      ))}
    </ol>
  );
}

const emptyDiscovery = { businesses: [], adAccounts: [], pixels: [], pages: [] };

/**
 * Integrações Meta no padrão TRACK: token no front, back só valida e guarda. Sem OAuth.
 */
export default function RastreamentoMetaManual({ clienteId, onChanged }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [connection, setConnection] = useState(null);
  const [discovery, setDiscovery] = useState(emptyDiscovery);
  const [credentialLabel, setCredentialLabel] = useState('Token BM do cliente');
  const [accessToken, setAccessToken] = useState('');
  const [businessId, setBusinessId] = useState('');
  const [businessLookupId, setBusinessLookupId] = useState('');
  const [selectedAccountIds, setSelectedAccountIds] = useState([]);
  const [directAccountIds, setDirectAccountIds] = useState('');
  const [pixelId, setPixelId] = useState('');
  const [pageId, setPageId] = useState('');
  const [directPixelId, setDirectPixelId] = useState('');
  const [directPageId, setDirectPageId] = useState('');
  const [ownerBusinessManagerId, setOwnerBusinessManagerId] = useState('');
  const [tokenSources, setTokenSources] = useState([]);
  const [sourceGroupKey, setSourceGroupKey] = useState('');

  const applyConnection = useCallback((next, channels = [], tokenPresent = true) => {
    const parsed = hydrateConnectionFromCliente({
      connection: next,
      businessId: next?.businessId,
      hasToken: tokenPresent,
      channels,
    });
    setConnection(parsed);
    setCredentialLabel(parsed.credentialLabel || 'Token BM do cliente');
    if (parsed.businessId) setBusinessId(parsed.businessId);
    if (parsed.adAccountIds?.length) setSelectedAccountIds(parsed.adAccountIds);
    if (parsed.pixelId) setPixelId(parsed.pixelId);
    if (parsed.pageId) setPageId(parsed.pageId);
    if (parsed.ownerBusinessManagerId) setOwnerBusinessManagerId(parsed.ownerBusinessManagerId);
  }, []);

  const load = useCallback(async () => {
    if (!clienteId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setAccessToken('');
    setBusinessLookupId('');
    setDirectAccountIds('');
    setDirectPixelId('');
    setDirectPageId('');
    setSelectedAccountIds([]);
    setPixelId('');
    setPageId('');
    setBusinessId('');
    setOwnerBusinessManagerId('');
    setDiscovery(emptyDiscovery);
    try {
      const [settings, channelsRes, sourcesRes] = await Promise.all([
        fetchClienteMetaCtwaSettings(clienteId),
        supabase
          .from('cliente_whatsapp_config')
          .select('meta_page_id, meta_dataset_id')
          .eq('cliente_id', clienteId),
        listClienteMetaTokenSources(clienteId).catch(() => ({ sources: [] })),
      ]);
      const grouped = groupMetaTokenSources(sourcesRes?.sources || []);
      setTokenSources(grouped);
      setSourceGroupKey((current) => current || grouped[0]?.key || '');
      setHasToken(Boolean(settings.hasToken));
      const channels = channelsRes.data || [];
      applyConnection(
        {
          ...(settings.connection || {}),
          businessId: settings.connection?.businessId || settings.businessId,
        },
        channels,
        Boolean(settings.hasToken),
      );
      const readyChannel = channels.find((channel) => channel?.meta_dataset_id && channel?.meta_page_id);
      if (readyChannel) {
        setPixelId((current) => current || String(readyChannel.meta_dataset_id));
        setPageId((current) => current || String(readyChannel.meta_page_id));
      }
      if (settings.hasToken && (settings.connection?.businessId || settings.businessId || readyChannel)) {
        try {
          const savedAccounts = Array.isArray(settings.connection?.adAccountIds)
            ? settings.connection.adAccountIds
            : [];
          const found = await discoverClienteMetaAssets(
            clienteId,
            settings.connection?.businessId || settings.businessId,
            savedAccounts,
          );
          if (found.discovery) {
            setDiscovery(found.discovery);
            const listedBm = found.discovery.businesses?.[0]?.id;
            if (listedBm) setBusinessId((current) => current || listedBm);
          }
        } catch {
          setDiscovery(emptyDiscovery);
        }
      }
    } catch (error) {
      toast({ variant: 'destructive', title: 'Não carregou a Meta', description: error.message });
    } finally {
      setLoading(false);
    }
  }, [applyConnection, clienteId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const draft = resolveManualMetaDraft({
    credentialLabel,
    businessId,
    businessLookupId,
    selectedAccountIds,
    directAccountIds,
    pixelId,
    pageId,
    directPixelId,
    directPageId,
    ownerBusinessManagerId,
  });
  const destinationReady = Boolean(draft.pixelId && draft.pageId);
  const steps = metaManualSetupSteps({
    hasToken,
    businessId: draft.businessId,
    accountCount: draft.adAccountIds.length,
    destinationReady,
  });
  const canActivate = canActivateManualMeta({
    hasToken,
    businessId: draft.businessId,
    pixelId: draft.pixelId,
    pageId: draft.pageId,
    adAccountIds: draft.adAccountIds,
  });

  const selectedBusinessName = useMemo(() => {
    return discovery.businesses.find((item) => item.id === draft.businessId)?.name || connection?.businessName || '';
  }, [connection?.businessName, discovery.businesses, draft.businessId]);

  const pixelOptions = useMemo(
    () => withSavedManualAsset(discovery.pixels, draft.pixelId, connection?.pixelName),
    [connection?.pixelName, discovery.pixels, draft.pixelId],
  );
  const pageOptions = useMemo(
    () => withSavedManualAsset(discovery.pages, draft.pageId, connection?.pageName),
    [connection?.pageName, discovery.pages, draft.pageId],
  );

  const notify = (title, description, variant) => {
    toast({ title, description, variant });
    onChanged?.();
  };

  const handleValidateToken = async (event) => {
    event.preventDefault();
    setPending('credential');
    try {
      const result = await validateClienteMetaToken(clienteId, {
        accessToken,
        credentialLabel,
        businessId: draft.businessId,
      });
      setHasToken(true);
      setAccessToken('');
      if (result.discovery) setDiscovery(result.discovery);
      if (result.connection) applyConnection(result.connection, [], true);
      notify(
        'Token validado e protegido',
        result.user?.name
          ? `Conectado como ${result.user.name}. O valor completo não aparece de novo.`
          : 'O token ficou salvo no backend. Cole outro só se for trocar.',
      );
    } catch (error) {
      toast({ variant: 'destructive', title: 'Token recusado', description: error.message });
    } finally {
      setPending('');
    }
  };

  const handleReuse = async () => {
    const group = tokenSources.find((item) => item.key === sourceGroupKey) || tokenSources[0];
    const sourceClienteId = group?.sourceClienteId;
    if (!sourceClienteId) {
      toast({ variant: 'destructive', title: 'Escolha uma conta já conectada' });
      return;
    }
    setPending('reuse');
    try {
      const result = await reuseClienteMetaToken(clienteId, sourceClienteId);
      setHasToken(true);
      setAccessToken('');
      if (result.discovery) setDiscovery(result.discovery);
      if (result.connection) {
        applyConnection(result.connection, [], true);
        if (!result.connection.adAccountIds?.length) setSelectedAccountIds([]);
      }
      const fromName = result.reusedFrom?.clienteNome || group.clientes?.[0]?.nome || 'outra conta';
      notify(
        'Token reaproveitado',
        `Usamos o mesmo token de ${fromName}. A BM veio junto. Agora escolha as contas, o Pixel e a Página deste cliente.`,
      );
    } catch (error) {
      toast({ variant: 'destructive', title: 'Não reaproveitou o token', description: error.message });
    } finally {
      setPending('');
    }
  };

  const handleDiscover = async (nextBusinessId, accountIds = selectedAccountIds) => {
    const id = String(nextBusinessId || '').trim();
    if (!id) return;
    setPending('assets');
    try {
      const result = await discoverClienteMetaAssets(clienteId, id, accountIds);
      if (result.discovery) {
        setDiscovery(result.discovery);
      }
      toast({
        title: 'BM validada',
        description: accountIds.length
          ? 'Pixel e Página vieram da conta de anúncio marcada.'
          : 'Marque a conta deste cliente para listar o Pixel e a Página.',
      });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Não validou a BM', description: error.message });
    } finally {
      setPending('');
    }
  };

  const refreshDestinations = async (accountIds) => {
    const bm = String(businessId || businessLookupId || '').trim();
    if (!clienteId || !bm) {
      setDiscovery((current) => ({ ...current, pixels: [], pages: [] }));
      return;
    }
    setPending('assets');
    try {
      const result = await discoverClienteMetaAssets(clienteId, bm, accountIds);
      if (result.discovery) {
        setDiscovery((current) => ({
          businesses: result.discovery.businesses?.length ? result.discovery.businesses : current.businesses,
          adAccounts: result.discovery.adAccounts?.length ? result.discovery.adAccounts : current.adAccounts,
          pixels: result.discovery.pixels || [],
          pages: result.discovery.pages || [],
        }));
        const pixels = result.discovery.pixels || [];
        const pages = result.discovery.pages || [];
        setPixelId((current) => {
          if (pixels.some((item) => item.id === current)) return current;
          return pixels.length === 1 ? pixels[0].id : '';
        });
        setPageId((current) => {
          if (pages.some((item) => item.id === current)) return current;
          return pages.length === 1 ? pages[0].id : '';
        });
      }
    } catch (error) {
      toast({ variant: 'destructive', title: 'Não listou Pixel da conta', description: error.message });
    } finally {
      setPending('');
    }
  };

  const handleBusinessSelect = (nextId) => {
    setBusinessId(nextId);
    setBusinessLookupId('');
    setSelectedAccountIds([]);
    setPixelId('');
    setPageId('');
    if (nextId) void handleDiscover(nextId, []);
  };

  const handleAddDirectAccounts = (event) => {
    event.preventDefault();
    const added = parseMetaAdAccountIds(directAccountIds);
    if (!added.length) {
      toast({ variant: 'destructive', title: 'Informe IDs no formato act_…' });
      return;
    }
    setSelectedAccountIds((current) => [...new Set([...current, ...added])]);
    setDirectAccountIds('');
    void refreshDestinations([...new Set([...selectedAccountIds, ...added])]);
  };

  const toggleAccount = (id) => {
    const next = selectedAccountIds.includes(id)
      ? selectedAccountIds.filter((item) => item !== id)
      : [...selectedAccountIds, id];
    setSelectedAccountIds(next);
    void refreshDestinations(next);
  };

  const handleActivate = async () => {
    if (!canActivate) return;
    setPending('activate');
    try {
      const result = await activateClienteMetaConnection(clienteId, {
        credentialLabel,
        businessId: draft.businessId,
        businessName: selectedBusinessName,
        adAccountIds: draft.adAccountIds,
        pixelId: draft.pixelId,
        pageId: draft.pageId,
        ownerBusinessManagerId: draft.ownerBusinessManagerId,
      });
      if (result.connection) applyConnection(result.connection, [], true);
      notify(
        'Conexão Meta ativada',
        'Pixel e Página foram gravados nos canais WhatsApp já ligados. Nada foi enviado à Meta.',
      );
    } catch (error) {
      toast({ variant: 'destructive', title: 'Não ativou', description: error.message });
    } finally {
      setPending('');
    }
  };

  const handleTest = async () => {
    setPending('test');
    try {
      const result = await testClienteMetaConnection(clienteId, {
        businessId: draft.businessId,
        pixelId: draft.pixelId,
        pageId: draft.pageId,
      });
      if (result.connection) applyConnection(result.connection, [], true);
      notify('Conexão testada', result.message || 'A Meta respondeu.');
    } catch (error) {
      toast({ variant: 'destructive', title: 'Teste falhou', description: error.message });
    } finally {
      setPending('');
    }
  };

  if (!clienteId) return null;
  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="meta-manual">
      <div className="meta-manual-head">
        <div>
          <p className="meta-manual-kicker">Meta Ads</p>
          <RastreamentoSectionTitle
            as="h3"
            title="Conexão por token permanente"
            help={rastreamentoTabHelp('integracoes')}
            helpLabel="Sobre a conexão Meta"
          />
        </div>
        <div className={`meta-manual-status is-${connection?.status || 'not_connected'}`}>
          {metaManualStatusLabel(connection?.status)}
        </div>
      </div>

      {hasToken ? (
        <div className="meta-manual-summary">
          <div>
            <strong>{connection?.credentialLabel || 'Credencial'}</strong>
            <small>
              {connection?.tokenLast4 ? `final ${connection.tokenLast4}` : 'Token protegido'}
              {connection?.userName ? ` · ${connection.userName}` : ''}
            </small>
          </div>
          <div>
            <strong>{connection?.businessName || connection?.businessId || selectedBusinessName || 'BM pendente'}</strong>
            <small>{connection?.businessId || draft.businessId || 'Informe o ID da BM'}</small>
          </div>
          <div>
            <strong>{(connection?.adAccountIds?.length || draft.adAccountIds.length) || 0} contas</strong>
            <small>
              {connection?.pixelName || draft.pixelId || 'Pixel'} / {connection?.pageName || draft.pageId || 'Página'}
            </small>
          </div>
          <Button type="button" variant="outline" size="sm" disabled={Boolean(pending)} onClick={() => void handleTest()}>
            {pending === 'test' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Unplug className="h-4 w-4 mr-1" />}
            Testar conexão
          </Button>
        </div>
      ) : null}

      {connection?.testMessage ? (
        <p className="meta-manual-note">{connection.testMessage}</p>
      ) : null}

      <StepPills steps={steps} />

      <div className="meta-manual-grid">
        <section className="meta-manual-card">
          <div className="meta-manual-card__title">
            <KeyRound className="h-4 w-4" />
            <div>
              <span>1. Credencial</span>
              <strong>Token do System User</strong>
            </div>
          </div>
          {tokenSources.length ? (
            <div className="meta-manual-reuse">
              <p className="meta-manual-reuse__title">Já conectou outra conta na mesma BM</p>
              <label className="meta-manual-field">
                <span>Reaproveitar token já salvo</span>
                <select
                  className="meta-manual-select"
                  value={sourceGroupKey}
                  onChange={(event) => setSourceGroupKey(event.currentTarget.value)}
                  disabled={Boolean(pending)}
                >
                  {tokenSources.map((group) => (
                    <option key={group.key} value={group.key}>
                      {formatMetaTokenSourceLabel(group)}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                type="button"
                disabled={Boolean(pending) || !sourceGroupKey}
                onClick={() => void handleReuse()}
              >
                {pending === 'reuse' ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Copy className="h-4 w-4 mr-2" />
                )}
                {hasToken ? 'Trocar por este token' : 'Usar este token'}
              </Button>
              <p className="meta-manual-note">
                A BM é a mesma. Contas de anúncio, Pixel e Página você escolhe para este cliente. O token não aparece na tela.
              </p>
            </div>
          ) : null}
          <form className="space-y-3" onSubmit={handleValidateToken}>
            {tokenSources.length ? (
              <p className="meta-manual-reuse__or">ou cole um token novo</p>
            ) : null}
            <label className="meta-manual-field">
              <span>Nome da credencial</span>
              <Input
                value={credentialLabel}
                onChange={(event) => setCredentialLabel(event.target.value)}
                placeholder="Ex.: Token BM principal"
              />
            </label>
            <label className="meta-manual-field">
              <span>Token permanente</span>
              <Input
                type="password"
                autoComplete="off"
                value={accessToken}
                onChange={(event) => setAccessToken(event.target.value)}
                placeholder={hasToken ? 'Cole um token novo para substituir' : 'Cole o token gerado no BM'}
              />
            </label>
            <Button type="submit" disabled={Boolean(pending) || (!accessToken.trim() && !hasToken)}>
              {pending === 'credential' ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <ShieldCheck className="h-4 w-4 mr-2" />
              )}
              Validar e proteger
            </Button>
          </form>
          <p className="meta-manual-note">
            Depois de salvo, o token não volta para a tela. Nas próximas contas, reaproveite o token da mesma BM em vez de criar outro.
          </p>
        </section>

        <section className="meta-manual-card">
          <div className="meta-manual-card__title">
            <Building2 className="h-4 w-4" />
            <div>
              <span>2. Estrutura anunciante</span>
              <strong>BM e contas de anúncio</strong>
            </div>
          </div>
          <AssetSelect
            label="Business Manager"
            value={businessId}
            onChange={handleBusinessSelect}
            options={discovery.businesses}
            placeholder="Escolher BM listada"
            disabled={!hasToken || Boolean(pending)}
          />
          <form
            className="meta-manual-inline"
            onSubmit={(event) => {
              event.preventDefault();
              setBusinessId(businessLookupId.trim());
              void handleDiscover(businessLookupId);
            }}
          >
            <label className="meta-manual-field">
              <span>ID da BM (se não listar)</span>
              <Input
                value={businessLookupId}
                onChange={(event) => setBusinessLookupId(event.target.value)}
                placeholder="Ex.: 123456789012345"
                inputMode="numeric"
                disabled={!hasToken || Boolean(pending)}
              />
            </label>
            <Button type="submit" variant="outline" disabled={!businessLookupId.trim() || Boolean(pending)}>
              {pending === 'assets' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Validar BM
            </Button>
          </form>
          <div className="meta-account-picker">
            {discovery.adAccounts.length ? (
              discovery.adAccounts.map((account) => {
                const checked = selectedAccountIds.includes(account.id);
                return (
                  <label key={account.id} className={checked ? 'is-on' : ''}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAccount(account.id)}
                    />
                    <span>
                      <strong>{account.name}</strong>
                      <small>{account.id}</small>
                    </span>
                    {checked ? <Check className="h-4 w-4" /> : null}
                  </label>
                );
              })
            ) : (
              <p className="meta-manual-note">
                {pending === 'assets'
                  ? 'Consultando ativos…'
                  : draft.businessId
                    ? 'A Meta não listou contas. Informe os IDs abaixo.'
                    : 'Escolha um token e uma BM para carregar as contas.'}
              </p>
            )}
          </div>
          {selectedAccountIds
            .filter((id) => !discovery.adAccounts.some((account) => account.id === id))
            .map((id) => (
              <div key={id} className="meta-manual-chip">
                <span>
                  Conta informada <code>{id}</code>
                </span>
                <button type="button" onClick={() => toggleAccount(id)}>
                  remover
                </button>
              </div>
            ))}
          <form className="meta-manual-inline" onSubmit={handleAddDirectAccounts}>
            <label className="meta-manual-field">
              <span>IDs das contas de anúncio</span>
              <textarea
                className="meta-manual-textarea"
                rows={2}
                value={directAccountIds}
                onChange={(event) => setDirectAccountIds(event.target.value)}
                placeholder="act_1234567890, act_9876543210"
                disabled={Boolean(pending)}
              />
            </label>
            <Button type="submit" variant="outline" disabled={!directAccountIds.trim() || Boolean(pending)}>
              <Plus className="h-4 w-4 mr-1" />
              Adicionar IDs
            </Button>
          </form>
        </section>

        <section className="meta-manual-card">
          <div className="meta-manual-card__title">
            <Database className="h-4 w-4" />
            <div>
              <span>3. Destino CAPI</span>
              <strong>Pixel/Dataset e Página</strong>
            </div>
          </div>
          <AssetSelect
            label="Pixel ou Dataset"
            value={pixelId}
            onChange={setPixelId}
            options={pixelOptions}
            placeholder={pixelSelectPlaceholder(draft.adAccountIds.length)}
            disabled={!hasToken || !draft.adAccountIds.length}
          />
          <AssetSelect
            label="Página Facebook"
            value={pageId}
            onChange={setPageId}
            options={pageOptions}
            placeholder={pageSelectPlaceholder(draft.adAccountIds.length)}
            disabled={!hasToken || !draft.adAccountIds.length}
          />
          <p className="meta-manual-note">
            {draft.adAccountIds.length
              ? 'Pixel e Página vêm da conta de anúncio marcada, não da BM inteira.'
              : 'Marque a conta deste cliente no quadro 2 para listar o Pixel dela.'}
          </p>
          <div className="meta-manual-ids">
            <label className="meta-manual-field">
              <span>ID do Pixel/Dataset</span>
              <Input
                value={directPixelId}
                onChange={(event) => setDirectPixelId(event.target.value)}
                placeholder="Se a lista vier vazia, cole o ID"
              />
            </label>
            <label className="meta-manual-field">
              <span>ID da Página</span>
              <Input
                value={directPageId}
                onChange={(event) => setDirectPageId(event.target.value)}
                placeholder="Página do anúncio Click to WhatsApp"
              />
            </label>
            <label className="meta-manual-field">
              <span>BM proprietária dos ativos</span>
              <Input
                value={ownerBusinessManagerId}
                onChange={(event) => setOwnerBusinessManagerId(event.target.value)}
                placeholder="Opcional, se Pixel/Página forem de outra BM"
              />
            </label>
          </div>
        </section>

        <section className="meta-manual-card">
          <div className="meta-manual-card__title">
            <CheckCircle2 className="h-4 w-4" />
            <div>
              <span>4. Revisão</span>
              <strong>Ativar conexão</strong>
            </div>
          </div>
          <dl className="meta-manual-review">
            <div>
              <dt>Token</dt>
              <dd>{hasToken ? `final ${connection?.tokenLast4 || '••••'}` : 'Pendente'}</dd>
            </div>
            <div>
              <dt>BM</dt>
              <dd>{selectedBusinessName || draft.businessId || '—'}</dd>
            </div>
            <div>
              <dt>Contas</dt>
              <dd>{draft.adAccountIds.length || '—'}</dd>
            </div>
            <div>
              <dt>Destino</dt>
              <dd>
                {draft.pixelId && draft.pageId ? `${draft.pixelId} / ${draft.pageId}` : 'Pixel e Página'}
              </dd>
            </div>
          </dl>
          <Button type="button" disabled={!canActivate || Boolean(pending)} onClick={() => void handleActivate()}>
            {pending === 'activate' ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <ShieldCheck className="h-4 w-4 mr-2" />
            )}
            Validar e ativar
          </Button>
          <p className="meta-manual-note">
            Ativar grava Pixel e Página na conexão Meta. Não reenvia eventos antigos.
          </p>
        </section>
      </div>
    </div>
  );
}
