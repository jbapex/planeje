import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Copy, ExternalLink, Loader2, RefreshCw, Save } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import WorkspacePageHeader from '@/components/layout/WorkspacePageHeader';
import { supabase } from '@/lib/customSupabaseClient';
import {
  GOOGLE_ADS_CLIENT_ID_SECRET,
  GOOGLE_ADS_CLIENT_SECRET_SECRET,
  GOOGLE_ADS_DEVELOPER_TOKEN_SECRET,
  GOOGLE_ADS_LOGIN_CUSTOMER_ID_SECRET,
  GOOGLE_ADS_OAUTH_REDIRECT_URI,
  GOOGLE_ADS_REFRESH_TOKEN_SECRET,
  GOOGLE_DATA_MANAGER_PROJECT_ID_SECRET,
  buildGoogleAdsAuthUrl,
  cleanLoginCustomerId,
  extractOauthCodeFromInput,
  looksLikeGoogleClientId,
  looksLikeRefreshToken,
  previewSecret,
  summarizeGoogleAdsConnection,
} from '@/lib/googleAdsAgency';
import './MetaAgencySettings.css';

async function readSecret(name) {
  const { data, error } = await supabase.rpc('get_encrypted_secret', { p_secret_name: name });
  if (error) throw error;
  return String(data || '').trim();
}

async function writeSecret(name, value) {
  const { error } = await supabase.rpc('set_encrypted_secret', {
    p_secret_name: name,
    p_secret_value: value,
  });
  if (error) throw error;
}

export default function GoogleAdsAgencySettings() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const isSuperAdmin = profile?.role === 'superadmin';

  const [developerTokenInput, setDeveloperTokenInput] = useState('');
  const [clientIdInput, setClientIdInput] = useState('');
  const [clientSecretInput, setClientSecretInput] = useState('');
  const [refreshTokenInput, setRefreshTokenInput] = useState('');
  const [loginCustomerInput, setLoginCustomerInput] = useState('');
  const [projectIdInput, setProjectIdInput] = useState('');

  const [savedDeveloperPreview, setSavedDeveloperPreview] = useState('');
  const [savedIdPreview, setSavedIdPreview] = useState('');
  const [savedSecretPreview, setSavedSecretPreview] = useState('');
  const [savedRefreshPreview, setSavedRefreshPreview] = useState('');
  const [savedRefreshValid, setSavedRefreshValid] = useState(false);
  const [savedLoginCustomer, setSavedLoginCustomer] = useState('');
  const [savedClientIdFull, setSavedClientIdFull] = useState('');

  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!isSuperAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [dev, id, secret, refreshTok, loginId, projectId] = await Promise.all([
        readSecret(GOOGLE_ADS_DEVELOPER_TOKEN_SECRET),
        readSecret(GOOGLE_ADS_CLIENT_ID_SECRET),
        readSecret(GOOGLE_ADS_CLIENT_SECRET_SECRET),
        readSecret(GOOGLE_ADS_REFRESH_TOKEN_SECRET),
        readSecret(GOOGLE_ADS_LOGIN_CUSTOMER_ID_SECRET),
        readSecret(GOOGLE_DATA_MANAGER_PROJECT_ID_SECRET),
      ]);
      setSavedDeveloperPreview(dev ? previewSecret(dev) : '');
      setSavedIdPreview(id ? previewSecret(id) : '');
      setSavedClientIdFull(id || '');
      setSavedSecretPreview(secret ? previewSecret(secret) : '');
      setSavedRefreshPreview(refreshTok ? previewSecret(refreshTok) : '');
      setSavedRefreshValid(looksLikeRefreshToken(refreshTok));
      const cleanLogin = loginId ? cleanLoginCustomerId(loginId) : '';
      setSavedLoginCustomer(cleanLogin);
      setLoginCustomerInput((prev) => (prev.trim() ? prev : cleanLogin));
      setProjectIdInput((prev) => (prev.trim() ? prev : projectId));

      const [checkRes, customersRes] = await Promise.all([
        supabase.functions.invoke('google-ads-api', { body: { action: 'check-connection' } }),
        supabase.functions.invoke('google-ads-api', { body: { action: 'get-customers' } }),
      ]);
      if (checkRes.error) throw checkRes.error;
      const summary = summarizeGoogleAdsConnection(checkRes.data, customersRes.data);
      setStatus(summary);
      if (!summary.connected || !summary.readyToLink) setError(summary.error || '');
    } catch (err) {
      setStatus(null);
      setError(err?.message || 'Não foi possível ler a configuração Google Ads.');
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveAndTest = async () => {
    const nextDev = developerTokenInput.trim();
    const nextId = clientIdInput.trim();
    const nextSecret = clientSecretInput.trim();
    const nextRefresh = refreshTokenInput.trim();
    const nextLogin = cleanLoginCustomerId(loginCustomerInput);
    const nextProject = projectIdInput.trim();
    if (nextProject && !/^(?:[a-z][a-z0-9-]{4,28}[a-z0-9]|\d{6,20})$/.test(nextProject)) {
      toast({ title: 'Confira o projeto Google Cloud', description: 'Informe o ID ou número do projeto com a Data Manager API ativada.', variant: 'destructive' });
      return;
    }

    if (!nextId && !savedIdPreview) {
      toast({
        title: 'Cole o Client ID',
        description: 'OAuth 2.0 no Google Cloud (API Google Ads).',
        variant: 'destructive',
      });
      return;
    }
    if (!nextSecret && !savedSecretPreview) {
      toast({
        title: 'Cole o Client Secret',
        description: 'No mesmo cliente OAuth do Google Cloud.',
        variant: 'destructive',
      });
      return;
    }
    if (!nextRefresh && !savedRefreshValid) {
      toast({
        title: 'Ainda falta autorizar no Chrome',
        description:
          'O valor salvo é o code, não o token. Clique em Copiar URL de autorização, autorize, e cole neste campo a barra inteira http://127.0.0.1:8080/?code=...',
        variant: 'destructive',
      });
      return;
    }
    if (nextId && !looksLikeGoogleClientId(nextId)) {
      toast({
        title: 'Client ID estranho',
        description: 'Costuma terminar em .apps.googleusercontent.com.',
        variant: 'destructive',
      });
      return;
    }

    setBusy(true);
    setError('');
    try {
      let refreshToSave = nextRefresh;
      const oauthCode = extractOauthCodeFromInput(nextRefresh);
      if (oauthCode) {
        const { data: exchanged, error: exErr } = await supabase.functions.invoke('google-ads-api', {
          body: {
            action: 'exchange-oauth-code',
            code: oauthCode,
            clientId: nextId || undefined,
            clientSecret: nextSecret || undefined,
            redirectUri: GOOGLE_ADS_OAUTH_REDIRECT_URI,
          },
        });
        if (exErr) throw exErr;
        if (exchanged?.error) throw new Error(exchanged.error.message || 'Não foi possível trocar o code');
        if (!exchanged?.refreshToken) {
          throw new Error('O code expirou ou já foi usado. Copie a URL de autorização de novo, autorize e cole a barra com code=.');
        }
        refreshToSave = exchanged.refreshToken;
      } else if (nextRefresh && !looksLikeRefreshToken(nextRefresh)) {
        throw new Error(
          'Isso não é um Refresh Token. Autorize no Chrome e cole a URL inteira que começa com http://127.0.0.1:8080/?code=',
        );
      }
      // A recusa da nova permissão não pode sobrescrever a conexão anterior.
      if (nextDev) {
        await writeSecret(GOOGLE_ADS_DEVELOPER_TOKEN_SECRET, nextDev);
        setSavedDeveloperPreview(previewSecret(nextDev));
        setDeveloperTokenInput('');
      }
      if (nextId) {
        await writeSecret(GOOGLE_ADS_CLIENT_ID_SECRET, nextId);
        setSavedIdPreview(previewSecret(nextId));
        setSavedClientIdFull(nextId);
        setClientIdInput('');
      }
      if (nextSecret) {
        await writeSecret(GOOGLE_ADS_CLIENT_SECRET_SECRET, nextSecret);
        setSavedSecretPreview(previewSecret(nextSecret));
        setClientSecretInput('');
      }
      if (nextProject) await writeSecret(GOOGLE_DATA_MANAGER_PROJECT_ID_SECRET, nextProject);
      if (refreshToSave) {
        await writeSecret(GOOGLE_ADS_REFRESH_TOKEN_SECRET, refreshToSave);
        setSavedRefreshPreview(previewSecret(refreshToSave));
        setSavedRefreshValid(looksLikeRefreshToken(refreshToSave));
        setRefreshTokenInput('');
      }
      if (nextLogin) {
        await writeSecret(GOOGLE_ADS_LOGIN_CUSTOMER_ID_SECRET, nextLogin);
        setSavedLoginCustomer(nextLogin);
      }

      const [checkRes, customersRes] = await Promise.all([
        supabase.functions.invoke('google-ads-api', { body: { action: 'check-connection' } }),
        supabase.functions.invoke('google-ads-api', { body: { action: 'get-customers' } }),
      ]);
      if (checkRes.error) throw checkRes.error;
      const summary = summarizeGoogleAdsConnection(checkRes.data, customersRes.data);
      setStatus(summary);
      if (!summary.connected) {
        setError(summary.error);
        toast({
          title: 'Salvo, mas a conexão falhou',
          description: summary.error || 'Confira Developer Token e OAuth.',
          variant: 'destructive',
        });
      } else if (!summary.readyToLink) {
        setError(summary.error || 'Nenhuma conta acessível.');
        toast({
          title: 'Conectado, mas sem contas na lista',
          description:
            summary.error ||
            'Vincule as contas dos clientes à MCC e confira GOOGLE_ADS_LOGIN_CUSTOMER_ID.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Google Ads da agência pronto',
          description: `${summary.customersCount} conta(s) acessível(is). Agora vincule na ficha do cliente.`,
        });
      }
    } catch (err) {
      const message = err?.message || 'Não foi possível salvar.';
      setError(message);
      toast({ title: 'Não foi possível salvar', description: message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const copyAuthUrl = async () => {
    const url = buildGoogleAdsAuthUrl(clientIdInput.trim() || savedClientIdFull);
    if (!url) {
      toast({
        title: 'Ainda não há Client ID salvo',
        description: 'Cole o Client ID uma vez, salve, e depois copie a URL.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'URL copiada', description: 'Cole no Chrome (accounts.google.com) e autorize.' });
    } catch {
      toast({ title: 'Copie manualmente', description: url, variant: 'destructive' });
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="meta-agency">
        <WorkspacePageHeader
          title="Google Ads da agência"
          description="Somente o superadmin configura Developer Token e OAuth."
        />
        <div className="meta-agency-card">
          <p>
            Peça a um superadmin para abrir{' '}
            <Link to="/settings/google-ads">Configurações → Google Ads da agência</Link>. Depois
            cada cliente vincula a própria conta na ficha.
          </p>
        </div>
      </div>
    );
  }

  const statusClass = status?.readyToLink ? 'is-ok' : status?.connected ? 'is-wait' : 'is-bad';
  const statusLabel = status?.readyToLink
    ? `Pronto · ${status.customersCount} conta(s)`
    : status?.connected
      ? 'Conectado, sem contas na lista'
      : savedDeveloperPreview || savedIdPreview
        ? 'Falta configurar ou testar'
        : 'Ainda sem secrets';

  return (
    <div className="meta-agency">
      <WorkspacePageHeader
        title="Google Ads da agência"
        description="Google Ads API e Data Manager API no Cloud, com OAuth da MCC."
        help="Secrets da agência (Vault). Não misture com Google Drive. Depois de salvar, vincule a conta na ficha do cliente e mapeie ações em Rastreamento → Integrações."
      />

      <div className="meta-agency-grid">
        <section className="meta-agency-card">
          <p className="meta-agency-kicker">Secrets</p>
          <h2>API e OAuth</h2>
          <p>
            Obrigatório: Client ID, Secret e Refresh Token do mesmo projeto Cloud com a Google Ads
            API e a Data Manager API ativadas. Para enviar conversões, copie uma nova URL de autorização
            e aprove as permissões Google Ads e Data Manager. Developer Token é opcional. Campos
            vazios mantêm o que já está salvo.
          </p>

          {(savedDeveloperPreview || savedIdPreview || savedRefreshPreview) && (
            <div className="meta-agency-preview">
              <span>Salvo:</span>
              <code>Token {savedDeveloperPreview || '—'}</code>
              <code>ID {savedIdPreview || '—'}</code>
              <code>Secret {savedSecretPreview || '—'}</code>
              <code>Refresh {savedRefreshPreview || '—'}</code>
              {!savedRefreshValid && savedRefreshPreview ? (
                <span className="meta-agency-status is-bad">não é o token — autorize de novo</span>
              ) : null}
              <code>MCC {savedLoginCustomer || '—'}</code>
              <span className={`meta-agency-status ${statusClass}`}>
                {status?.readyToLink ? <CheckCircle2 className="inline h-3.5 w-3.5 mr-1" /> : null}
                {statusLabel}
              </span>
            </div>
          )}

          <div className="meta-agency-field">
            <Label htmlFor="gads-client-id">Client ID</Label>
            <Input
              id="gads-client-id"
              autoComplete="off"
              value={clientIdInput}
              onChange={(e) => setClientIdInput(e.target.value)}
              placeholder={savedIdPreview ? 'Novo Client ID para substituir' : '….apps.googleusercontent.com'}
            />
          </div>
          <div className="meta-agency-field">
            <Label htmlFor="gads-client-secret">Client Secret</Label>
            <Input
              id="gads-client-secret"
              type="password"
              autoComplete="off"
              value={clientSecretInput}
              onChange={(e) => setClientSecretInput(e.target.value)}
              placeholder={savedSecretPreview ? 'Novo Secret para substituir' : 'Client Secret OAuth'}
            />
          </div>
          <div className="meta-agency-field">
            <Label htmlFor="gads-refresh">URL com code= ou Refresh Token</Label>
            <Input
              id="gads-refresh"
              autoComplete="off"
              value={refreshTokenInput}
              onChange={(e) => setRefreshTokenInput(e.target.value)}
              placeholder="Cole http://127.0.0.1:8080/?code=...  (não o code sozinho no lugar do token)"
            />
          </div>
          <div className="meta-agency-field">
            <Label htmlFor="gads-cloud-project">Projeto Google Cloud (ID ou número)</Label>
            <Input id="gads-cloud-project" autoComplete="off" value={projectIdInput}
              onChange={(e) => setProjectIdInput(e.target.value)} placeholder="Ex.: meu-projeto-google" />
            <p className="meta-agency-hint">Obrigatório para conversões via Data Manager. Use o projeto autorizado, com a API ativada.</p>
          </div>
          <div className="meta-agency-field">
            <Label htmlFor="gads-mcc">Login Customer ID (MCC, só números)</Label>
            <Input
              id="gads-mcc"
              autoComplete="off"
              value={loginCustomerInput}
              onChange={(e) => setLoginCustomerInput(e.target.value)}
              placeholder={savedLoginCustomer || 'Ex.: 1234567890'}
            />
          </div>
          <div className="meta-agency-field">
            <Label htmlFor="gads-dev-token">Developer Token (opcional)</Label>
            <Input
              id="gads-dev-token"
              type="password"
              autoComplete="off"
              value={developerTokenInput}
              onChange={(e) => setDeveloperTokenInput(e.target.value)}
              placeholder={savedDeveloperPreview ? 'Novo token para substituir' : 'Pode deixar em branco'}
            />
            <p className="meta-agency-hint">
              Desde 09/09/2026 a Google ignora este token. O acesso é o da Google Ads API no projeto Cloud do OAuth.
            </p>
          </div>

          <div className="meta-agency-actions">
            <Button type="button" onClick={saveAndTest} disabled={busy || loading}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar e testar
            </Button>
            <Button type="button" variant="outline" onClick={refresh} disabled={busy || loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Atualizar
            </Button>
          </div>
          {error ? (
            <p className="meta-agency-error" role="alert">
              {error}
            </p>
          ) : null}
        </section>

        <aside className="meta-agency-card">
          <p className="meta-agency-kicker">Como obter</p>
          <h2>Passo a passo</h2>
          <ol className="meta-agency-steps">
            <li>
              No Google Cloud, ative a <strong>Google Ads API</strong> e a <strong>Data Manager API</strong> no mesmo projeto do OAuth e
              peça o nível de acesso na visão geral da API (não na Central de API da MCC).
            </li>
            <li>
              Credenciais → OAuth (Aplicativo da Web ou Desktop) com redirect{' '}
              <code>{GOOGLE_ADS_OAUTH_REDIRECT_URI}</code>.
            </li>
            <li>
              Cole o Client ID, copie a <strong>URL de autorização</strong>, autorize com a conta da
              MCC, aprove as duas permissões e troque o <code>code</code> por refresh token (
              <code>scripts/google-ads-oauth-token.sh</code>).
            </li>
            <li>
              Cole Refresh Token, projeto Google Cloud e ID numérico da MCC. Developer Token não é obrigatório.
            </li>
            <li>Salvar e testar. Depois vincule a conta na ficha do cliente.</li>
          </ol>

          <div className="meta-agency-actions" style={{ marginTop: '1rem' }}>
            <Button type="button" variant="outline" size="sm" onClick={() => void copyAuthUrl()}>
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              Copiar URL de autorização
            </Button>
            <Button type="button" variant="outline" size="sm" asChild>
              <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                Credenciais Google
              </a>
            </Button>
            <Button type="button" variant="outline" size="sm" asChild>
              <a
                href="https://console.cloud.google.com/apis/library/googleads.googleapis.com"
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                Google Ads API
              </a>
            </Button>
          </div>

          <p className="meta-agency-hint" style={{ marginTop: '0.85rem' }}>
            <Link to="/clients">Ficha do cliente → Contas Google Ads</Link>
            {' · '}
            <Link to="/crm/rastreamento?aba=integracoes">Rastreamento → Integrações</Link>
            {' · '}
            <Link to="/settings">Voltar</Link>
          </p>
        </aside>
      </div>
    </div>
  );
}
