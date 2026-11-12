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
  GOOGLE_DATA_OAUTH_REDIRECT_URI,
  GOOGLE_DATA_REFRESH_TOKEN_SECRET,
  GOOGLE_DATA_SETTINGS_PATH,
  buildGoogleDataAuthUrl,
  extractOauthCodeFromInput,
  looksLikeRefreshToken,
  previewSecret,
  summarizeGoogleDataConnection,
} from '@/lib/googleDataAgency';
import { GOOGLE_ADS_CLIENT_ID_SECRET } from '@/lib/googleAdsAgency';
import { googleDataProductErrorCopy } from '@/lib/googleDataInsightsView';
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

export default function GoogleDataAgencySettings() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const isSuperAdmin = profile?.role === 'superadmin';
  const [refreshTokenInput, setRefreshTokenInput] = useState('');
  const [savedRefreshPreview, setSavedRefreshPreview] = useState('');
  const [savedRefreshValid, setSavedRefreshValid] = useState(false);
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
      const [id, token] = await Promise.all([
        readSecret(GOOGLE_ADS_CLIENT_ID_SECRET),
        readSecret(GOOGLE_DATA_REFRESH_TOKEN_SECRET),
      ]);
      setSavedClientIdFull(id || '');
      setSavedRefreshPreview(token ? previewSecret(token) : '');
      setSavedRefreshValid(looksLikeRefreshToken(token));
      const { data, error: fnError } = await supabase.functions.invoke('google-data-api', {
        body: { action: 'check-connection' },
      });
      if (fnError) throw fnError;
      const summary = summarizeGoogleDataConnection(data);
      setStatus(summary);
      if (!summary.connected) setError(summary.error || '');
    } catch (err) {
      setStatus(null);
      setError(err?.message || 'Não foi possível ler o Google dados.');
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveAndTest = async () => {
    const nextRefresh = refreshTokenInput.trim();
    if (!nextRefresh && !savedRefreshValid) {
      toast({
        title: 'Ainda falta autorizar no Chrome',
        description: 'Copie a URL, autorize Analytics + Meu Negócio + Tag Manager e cole http://127.0.0.1:8080/?code=...',
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
        const { data: exchanged, error: exErr } = await supabase.functions.invoke('google-data-api', {
          body: {
            action: 'exchange-oauth-code',
            code: oauthCode,
            redirectUri: GOOGLE_DATA_OAUTH_REDIRECT_URI,
          },
        });
        if (exErr) throw exErr;
        if (exchanged?.error) throw new Error(exchanged.error.message || 'Não foi possível trocar o code');
        if (!exchanged?.refreshToken) {
          throw new Error('O code expirou. Copie a URL de novo, autorize e cole a barra com code=.');
        }
        refreshToSave = exchanged.refreshToken;
      } else if (nextRefresh && !looksLikeRefreshToken(nextRefresh)) {
        throw new Error('Cole a URL inteira http://127.0.0.1:8080/?code=... depois de autorizar.');
      }
      if (refreshToSave) {
        await writeSecret(GOOGLE_DATA_REFRESH_TOKEN_SECRET, refreshToSave);
        setSavedRefreshPreview(previewSecret(refreshToSave));
        setSavedRefreshValid(looksLikeRefreshToken(refreshToSave));
        setRefreshTokenInput('');
      }
      const { data, error: fnError } = await supabase.functions.invoke('google-data-api', {
        body: { action: 'check-connection' },
      });
      if (fnError) throw fnError;
      const summary = summarizeGoogleDataConnection(data);
      setStatus(summary);
      if (!summary.connected) {
        setError(summary.error);
        toast({ title: 'Salvo, mas a conexão falhou', description: summary.error, variant: 'destructive' });
      } else {
        toast({
          title: 'Google dados autorizado',
          description: `${summary.email || 'Conta ok'}. Agora vincule a propriedade/ficha/contêiner na ficha do cliente.`,
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
    const url = buildGoogleDataAuthUrl(savedClientIdFull);
    if (!url) {
      toast({
        title: 'Falta o Client ID do Google Ads',
        description: 'Configure primeiro Configurações → Google Ads da agência.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'URL copiada', description: 'Cole no Chrome e aceite Analytics, Meu Negócio e Tag Manager.' });
    } catch {
      toast({ title: 'Copie manualmente', description: url, variant: 'destructive' });
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="meta-agency">
        <WorkspacePageHeader
          title="Google dados da agência"
          description="Somente o superadmin autoriza Analytics, Meu Negócio e Tag Manager."
        />
        <div className="meta-agency-card">
          <p>
            Peça a um superadmin para abrir <Link to={GOOGLE_DATA_SETTINGS_PATH}>Configurações → Google dados</Link>.
          </p>
        </div>
      </div>
    );
  }

  const statusClass = status?.readyToLink ? 'is-ok' : status?.connected ? 'is-wait' : 'is-bad';
  const statusLabel = loading
    ? 'Lendo…'
    : status?.readyToLink
      ? `Pronto${status.email ? ` · ${status.email}` : ''}`
      : status?.connected
        ? 'Conectado, produto ainda sem permissão'
        : savedRefreshPreview
          ? 'Falta autorizar ou testar'
          : 'Ainda sem autorização';

  return (
    <div className="meta-agency">
      <WorkspacePageHeader
        title="Google dados da agência"
        description="Um login da agência para Analytics, Meu Negócio e Tag Manager. Não mistura com Ads nem com a Meta."
        help="Usa o Client ID já salvo no Google Ads. Depois vincule propriedade, ficha e contêiner na ficha do cliente — nunca em massa."
      />

      <div className="meta-agency-grid">
        <section className="meta-agency-card">
          <p className="meta-agency-kicker">OAuth</p>
          <h2>Analytics · Meu Negócio · Tag Manager</h2>
          <p>
            Reaproveita o Client ID/Secret do Google Ads. Este token é outro: o do Ads só serve para anúncios.
            Ative as APIs no mesmo projeto Cloud e autorize as três caixas.
          </p>

          <div className="meta-agency-preview">
            <span>Salvo:</span>
            <code>Refresh {savedRefreshPreview || '—'}</code>
            {!savedRefreshValid && savedRefreshPreview ? (
              <span className="meta-agency-status is-bad">não é o token — autorize de novo</span>
            ) : null}
            <span className={`meta-agency-status ${statusClass}`}>
              {status?.readyToLink ? <CheckCircle2 className="inline h-3.5 w-3.5 mr-1" /> : null}
              {statusLabel}
            </span>
          </div>

          {status?.connected ? (
            <ul className="meta-agency-steps">
              <li>
                Analytics: {status.analyticsOk ? 'ok' : googleDataProductErrorCopy(status.analyticsError) || 'sem acesso'}
              </li>
              <li>
                Meu Negócio: {status.businessOk ? 'ok' : googleDataProductErrorCopy(status.businessError) || 'sem acesso'}
              </li>
              <li>
                Tag Manager: {status.tagmanagerOk ? 'ok' : googleDataProductErrorCopy(status.tagmanagerError) || 'sem acesso'}
              </li>
            </ul>
          ) : null}

          <div className="meta-agency-field">
            <Label htmlFor="gdata-refresh">URL com code= ou Refresh Token</Label>
            <Input
              id="gdata-refresh"
              autoComplete="off"
              value={refreshTokenInput}
              onChange={(e) => setRefreshTokenInput(e.target.value)}
              placeholder="Cole http://127.0.0.1:8080/?code=..."
            />
          </div>

          {error ? <p className="meta-agency-error">{error}</p> : null}

          <div className="meta-agency-actions">
            <Button type="button" onClick={() => void saveAndTest()} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar e testar
            </Button>
            <Button type="button" variant="outline" onClick={() => void refresh()} disabled={loading || busy}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Atualizar
            </Button>
          </div>
        </section>

        <aside className="meta-agency-card">
          <p className="meta-agency-kicker">Passos</p>
          <h2>Como ligar</h2>
          <ol className="meta-agency-steps">
            <li>
              No Google Cloud do mesmo OAuth, ative <strong>Google Analytics Data API</strong>,{' '}
              <strong>Admin API</strong>, <strong>My Business Account Management</strong>,{' '}
              <strong>Business Information</strong>, <strong>Business Profile Performance</strong> e{' '}
              <strong>Tag Manager API</strong>.
            </li>
            <li>Copie a URL de autorização, autorize com a conta da agência e aceite as três caixas.</li>
            <li>Cole aqui a barra <code>http://127.0.0.1:8080/?code=...</code> e salve.</li>
            <li>Na ficha do cliente, vincule só a propriedade / ficha / contêiner daquele cliente.</li>
          </ol>
          <div className="meta-agency-actions" style={{ marginTop: '1rem' }}>
            <Button type="button" variant="outline" size="sm" onClick={() => void copyAuthUrl()}>
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              Copiar URL de autorização
            </Button>
            <Button type="button" variant="outline" size="sm" asChild>
              <a href="https://console.cloud.google.com/apis/library" target="_blank" rel="noreferrer">
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                Biblioteca de APIs
              </a>
            </Button>
          </div>
          <p className="meta-agency-hint" style={{ marginTop: '0.85rem' }}>
            <Link to="/clients">Ficha do cliente</Link>
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
