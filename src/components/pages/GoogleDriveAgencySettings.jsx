import { useCallback, useEffect, useState } from 'react';
import { Copy, Loader2, RefreshCw, Save } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import WorkspacePageHeader from '@/components/layout/WorkspacePageHeader';
import { supabase, supabaseUrl } from '@/lib/customSupabaseClient';
import {
  GOOGLE_DRIVE_APP_ORIGIN_SECRET,
  GOOGLE_DRIVE_CLIENT_ID_SECRET,
  GOOGLE_DRIVE_CLIENT_SECRET_SECRET,
  looksLikeGoogleClientId,
  previewSecret,
  resolveGoogleDriveRedirectUri,
  summarizeGoogleDriveOAuth,
} from '@/lib/googleDriveAgency';
import { fetchGoogleDriveOAuthConfig } from '@/lib/googleDriveClient';
import './MetaAgencySettings.css';

export default function GoogleDriveAgencySettings() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const isSuperAdmin = profile?.role === 'superadmin';
  const [clientIdInput, setClientIdInput] = useState('');
  const [clientSecretInput, setClientSecretInput] = useState('');
  const [savedIdPreview, setSavedIdPreview] = useState('');
  const [savedSecretPreview, setSavedSecretPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState(null);
  const [error, setError] = useState('');

  const readSaved = useCallback(async () => {
    const [idRes, secretRes] = await Promise.all([
      supabase.rpc('get_encrypted_secret', { p_secret_name: GOOGLE_DRIVE_CLIENT_ID_SECRET }),
      supabase.rpc('get_encrypted_secret', { p_secret_name: GOOGLE_DRIVE_CLIENT_SECRET_SECRET }),
    ]);
    if (idRes.error) throw idRes.error;
    if (secretRes.error) throw secretRes.error;
    return {
      clientId: String(idRes.data || '').trim(),
      clientSecret: String(secretRes.data || '').trim(),
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!isSuperAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const saved = await readSaved();
      setSavedIdPreview(saved.clientId ? previewSecret(saved.clientId) : '');
      setSavedSecretPreview(saved.clientSecret ? previewSecret(saved.clientSecret) : '');
      const remote = summarizeGoogleDriveOAuth(await fetchGoogleDriveOAuthConfig(), supabaseUrl);
      setConfig(remote);
      if (!remote.oauthConfigured) setError(remote.error);
    } catch (err) {
      setConfig(null);
      setError(err?.message || 'Não foi possível ler a configuração do Drive.');
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, readSaved]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const saveAndCheck = async () => {
    const nextId = clientIdInput.trim();
    const nextSecret = clientSecretInput.trim();
    if (!nextId && !savedIdPreview) {
      toast({
        title: 'Cole o Client ID',
        description: 'No Google Cloud, copie o ID do cliente OAuth 2.0 (aplicativo da web).',
        variant: 'destructive',
      });
      return;
    }
    if (!nextSecret && !savedSecretPreview) {
      toast({
        title: 'Cole o Secret',
        description: 'O Client Secret fica no mesmo cliente OAuth, em Credenciais.',
        variant: 'destructive',
      });
      return;
    }
    if (nextId && !looksLikeGoogleClientId(nextId)) {
      toast({
        title: 'Client ID estranho',
        description: 'O ID do Google costuma terminar em .apps.googleusercontent.com. Confira se copiou o valor certo.',
        variant: 'destructive',
      });
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (nextId) {
        const { error: saveIdError } = await supabase.rpc('set_encrypted_secret', {
          p_secret_name: GOOGLE_DRIVE_CLIENT_ID_SECRET,
          p_secret_value: nextId,
        });
        if (saveIdError) throw saveIdError;
        setSavedIdPreview(previewSecret(nextId));
        setClientIdInput('');
      }
      if (nextSecret) {
        const { error: saveSecretError } = await supabase.rpc('set_encrypted_secret', {
          p_secret_name: GOOGLE_DRIVE_CLIENT_SECRET_SECRET,
          p_secret_value: nextSecret,
        });
        if (saveSecretError) throw saveSecretError;
        setSavedSecretPreview(previewSecret(nextSecret));
        setClientSecretInput('');
      }
      const origin = String(window.location.origin || '').replace(/\/$/, '');
      if (origin) {
        await supabase.rpc('set_encrypted_secret', {
          p_secret_name: GOOGLE_DRIVE_APP_ORIGIN_SECRET,
          p_secret_value: origin,
        });
      }
      let remote;
      try {
        remote = summarizeGoogleDriveOAuth(await fetchGoogleDriveOAuthConfig(), supabaseUrl);
      } catch (err) {
        toast({
          title: 'IDs salvos',
          description: err?.message || 'Recarregue a página em alguns segundos para conferir o servidor.',
        });
        return;
      }
      setConfig(remote);
      if (!remote.oauthConfigured) {
        setError(remote.error);
        toast({ title: 'Salvo, mas o Drive ainda não está pronto', description: remote.error, variant: 'destructive' });
      } else {
        toast({
          title: 'Google Drive da agência salvo',
          description: 'Agora conecte o Drive do cliente em Canais → Integrações ou na tarefa → Anexos.',
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

  const copyRedirect = async () => {
    const uri = resolveGoogleDriveRedirectUri({
      explicitUri: config?.redirectUri,
      appOrigin: config?.appOrigin || (typeof window !== 'undefined' ? window.location.origin : ''),
      supabaseUrl,
    });
    try {
      await navigator.clipboard.writeText(uri);
      toast({ title: 'URI copiada', description: 'Cole em URIs de redirecionamento autorizados no Google Cloud.' });
    } catch {
      toast({ title: 'Copie manualmente', description: uri, variant: 'destructive' });
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="meta-agency">
        <WorkspacePageHeader
          title="Google Drive da agência"
          description="Somente o superadmin cola o Client ID e o Secret do Google."
        />
        <div className="meta-agency-card">
          <p>Peça a um superadmin para configurar o aplicativo Google. Depois cada empresa conecta a própria conta em Canais → Integrações.</p>
        </div>
      </div>
    );
  }

  const redirectUri = resolveGoogleDriveRedirectUri({
    explicitUri: config?.redirectUri,
    appOrigin: config?.appOrigin || (typeof window !== 'undefined' ? window.location.origin : ''),
    supabaseUrl,
  });
  const statusClass = config?.oauthConfigured ? 'is-ok' : savedIdPreview || savedSecretPreview ? 'is-bad' : 'is-wait';
  const statusLabel = config?.oauthConfigured ? 'Pronto para conectar clientes' : 'Falta Client ID ou Secret';

  return (
    <div className="meta-agency">
      <WorkspacePageHeader
        title="Google Drive da agência"
        description="Um aplicativo Google para a equipe anexar arquivos do Drive nas tarefas."
        help="Estes IDs são do aplicativo da agência no Google Cloud. Não misture com a chave Gemini do Neuro Ápice. Depois de salvar, cada cliente ainda precisa clicar em Conectar Drive."
      />

      <div className="meta-agency-grid">
        <section className="meta-agency-card">
          <p className="meta-agency-kicker">OAuth</p>
          <h2>Client ID e Secret</h2>
          <p>Cole os valores do cliente OAuth 2.0 (aplicativo da web). O Secret completo não aparece de novo; só um recorte para conferir.</p>

          {savedIdPreview || savedSecretPreview ? (
            <div className="meta-agency-preview">
              <span>Salvo:</span>
              <code>ID {savedIdPreview || '—'}</code>
              <code>Secret {savedSecretPreview || '—'}</code>
              <span className={`meta-agency-status ${statusClass}`}>{statusLabel}</span>
            </div>
          ) : null}

          <div className="meta-agency-field">
            <Label htmlFor="google-drive-client-id">Client ID</Label>
            <Input
              id="google-drive-client-id"
              autoComplete="off"
              value={clientIdInput}
              onChange={(event) => setClientIdInput(event.target.value)}
              placeholder={savedIdPreview ? 'Cole um Client ID novo para substituir' : '….apps.googleusercontent.com'}
            />
          </div>
          <div className="meta-agency-field">
            <Label htmlFor="google-drive-client-secret">Client Secret</Label>
            <Input
              id="google-drive-client-secret"
              type="password"
              autoComplete="off"
              value={clientSecretInput}
              onChange={(event) => setClientSecretInput(event.target.value)}
              placeholder={savedSecretPreview ? 'Cole um Secret novo para substituir' : 'Cole o Client Secret'}
            />
          </div>

          <div className="meta-agency-actions">
            <Button type="button" onClick={saveAndCheck} disabled={busy || loading}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {clientIdInput.trim() || clientSecretInput.trim() ? 'Salvar e conferir' : 'Conferir'}
            </Button>
            <Button type="button" variant="outline" onClick={refresh} disabled={busy || loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Atualizar
            </Button>
          </div>
          {error ? <p className="meta-agency-error" role="alert">{error}</p> : null}
          {config?.usingAdsFallback ? (
            <p className="meta-agency-hint" style={{ marginTop: '0.75rem' }}>
              O servidor ainda está reusando as credenciais do Google Ads. Depois de salvar o Drive aqui, passa a usar só estes IDs.
            </p>
          ) : null}
        </section>

        <aside className="meta-agency-card">
          <p className="meta-agency-kicker">Google Cloud</p>
          <h2>URI de redirecionamento</h2>
          <p>Cole este endereço exatamente nas credenciais OAuth, em URIs de redirecionamento autorizados. Sem <code>?action=callback</code> — o Google bloqueia.</p>
          <div className="meta-agency-preview" style={{ marginTop: '0.85rem' }}>
            <code style={{ wordBreak: 'break-all' }}>{redirectUri}</code>
            <Button type="button" size="sm" variant="outline" onClick={() => void copyRedirect()}>
              <Copy className="mr-1 h-3.5 w-3.5" />
              Copiar
            </Button>
          </div>

          <h2 style={{ marginTop: '1.25rem' }}>Como gerar</h2>
          <ol className="meta-agency-steps">
            <li>No Google Cloud, ative a API Google Drive.</li>
            <li>Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da Web.</li>
            <li>Cole a URI de redirecionamento acima (também se o cliente OAuth for o do Neuro Ápice). Origem JavaScript: {typeof window !== 'undefined' ? window.location.origin : 'https://planeje.jbapex.com.br'}.</li>
            <li>Copie o Client ID e o Secret, cole à esquerda e salve.</li>
            <li>No cliente, Canais → Integrações → Conectar Google Drive (conta da empresa).</li>
          </ol>
          <p className="meta-agency-hint" style={{ marginTop: '0.85rem' }}>
            <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Abrir credenciais Google</a>
            {' · '}
            <Link to="/crm/canais">Canais do cliente</Link>
            {' · '}
            <Link to="/settings">Voltar às configurações</Link>
          </p>
        </aside>
      </div>
    </div>
  );
}
