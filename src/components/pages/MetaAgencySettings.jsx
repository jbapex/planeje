import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw, Save } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import WorkspacePageHeader from '@/components/layout/WorkspacePageHeader';
import { supabase } from '@/lib/customSupabaseClient';
import {
  META_AGENCY_TOKEN_SECRET,
  explainMetaTokenError,
  permissionChecklist,
  previewSecret,
  summarizeInspect,
} from '@/lib/metaAgencyToken';
import './MetaAgencySettings.css';

export default function MetaAgencySettings() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const isSuperAdmin = profile?.role === 'superadmin';
  const [tokenInput, setTokenInput] = useState('');
  const [savedPreview, setSavedPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [inspect, setInspect] = useState(null);
  const [error, setError] = useState('');

  const readSaved = useCallback(async () => {
    const { data, error: readError } = await supabase.rpc('get_encrypted_secret', {
      p_secret_name: META_AGENCY_TOKEN_SECRET,
    });
    if (readError) throw readError;
    return String(data || '').trim();
  }, []);

  const runInspect = useCallback(async () => {
    const { data, error: fnError } = await supabase.functions.invoke('meta-ads-api', {
      body: { action: 'inspect-agency-token' },
    });
    if (fnError) throw fnError;
    return summarizeInspect(data);
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
      setSavedPreview(previewSecret(saved));
      const summary = await runInspect();
      setInspect(summary);
      if (!summary.connected) setError(summary.error);
    } catch (err) {
      setInspect(null);
      setError(explainMetaTokenError(err));
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, readSaved, runInspect]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const saveAndTest = async () => {
    const next = tokenInput.trim();
    if (!next && !savedPreview) {
      toast({ title: 'Cole o token', description: 'Gere o token do System User no Business Manager e cole aqui.', variant: 'destructive' });
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (next) {
        const { error: saveError } = await supabase.rpc('set_encrypted_secret', {
          p_secret_name: META_AGENCY_TOKEN_SECRET,
          p_secret_value: next,
        });
        if (saveError) throw saveError;
        setSavedPreview(previewSecret(next));
        setTokenInput('');
      }
      const summary = await runInspect();
      setInspect(summary);
      if (!summary.connected) {
        setError(summary.error);
        toast({ title: 'Token salvo, mas a Meta recusou', description: summary.error, variant: 'destructive' });
      } else {
        toast({
          title: 'Token da agência validado',
          description: `${summary.adAccounts.length} contas, ${summary.pages.length} páginas, ${summary.instagramAccounts.length} Instagram.`,
        });
      }
    } catch (err) {
      const message = explainMetaTokenError(err);
      setError(message);
      toast({ title: 'Não foi possível salvar', description: message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="meta-agency">
        <WorkspacePageHeader
          title="Meta da agência"
          description="Somente o superadmin configura o token que puxa anúncios, páginas e Instagram."
        />
        <div className="meta-agency-card">
          <p>Peça a um superadmin para colar o token do System User. O token do Rastreamento (cliente) é outro e não serve para o Tráfego.</p>
        </div>
      </div>
    );
  }

  const uses = permissionChecklist(inspect?.permissions || []);
  const statusClass = inspect?.connected ? 'is-ok' : savedPreview ? 'is-bad' : 'is-wait';
  const statusLabel = inspect?.connected ? 'Conectado à Meta' : savedPreview ? 'Token recusado' : 'Sem token';

  return (
    <div className="meta-agency">
      <WorkspacePageHeader
        title="Meta da agência"
        description="Um token do System User para Tráfego, páginas, Instagram e postagem."
        help="Este token é da agência. Não use o token Meta do cliente em Rastreamento. Salvar aqui libera Tráfego e a leitura/postagem em Redes Sociais → Perfil e feed."
      />

      <div className="meta-agency-grid">
        <section className="meta-agency-card">
          <p className="meta-agency-kicker">Token</p>
          <h2>System User da agência</h2>
          <p>Cole um token novo quando quiser. O valor completo não aparece de novo; só um recorte para você conferir.</p>

          {savedPreview ? (
            <div className="meta-agency-preview">
              <span>Salvo:</span>
              <code>{savedPreview}</code>
              <span className={`meta-agency-status ${statusClass}`}>{statusLabel}</span>
            </div>
          ) : null}

          <div className="meta-agency-field">
            <Label htmlFor="meta-agency-token">Token de acesso</Label>
            <Input
              id="meta-agency-token"
              type="password"
              autoComplete="off"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              placeholder={savedPreview ? 'Cole um token novo para substituir' : 'Cole o token gerado no Business Manager'}
            />
          </div>

          <div className="meta-agency-actions">
            <Button type="button" onClick={saveAndTest} disabled={busy || loading}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {tokenInput.trim() ? 'Salvar e testar' : 'Testar conexão'}
            </Button>
            <Button type="button" variant="outline" onClick={refresh} disabled={busy || loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Atualizar
            </Button>
          </div>
          {error ? <p className="meta-agency-error" role="alert">{error}</p> : null}

          {inspect?.connected ? (
            <>
              <div className="meta-agency-stats">
                <div className="meta-agency-stat">
                  <strong>{inspect.adAccounts.length}</strong>
                  <span>Contas de anúncio</span>
                </div>
                <div className="meta-agency-stat">
                  <strong>{inspect.pages.length}</strong>
                  <span>Páginas</span>
                </div>
                <div className="meta-agency-stat">
                  <strong>{inspect.instagramAccounts.length}</strong>
                  <span>Instagram</span>
                </div>
              </div>
              <p className="meta-agency-hint">
                {inspect.userName ? `Conectado como ${inspect.userName}. ` : ''}
                O Tráfego usa as contas. Páginas e Instagram ficam prontos para métricas e, mais tarde, postagem.
              </p>
              {inspect.adAccounts.length ? (
                <ul className="meta-agency-list">
                  {inspect.adAccounts.slice(0, 12).map((account) => (
                    <li key={account.id}>
                      <span>{account.name}</span>
                      <small>{account.account_id || account.id}</small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="meta-agency-hint" style={{ marginTop: '0.75rem' }}>
                  Nenhuma conta de anúncio visível. No BM, atribua as contas ao System User.
                </p>
              )}
              {inspect.pages.length ? (
                <ul className="meta-agency-list">
                  {inspect.pages.slice(0, 12).map((page) => (
                    <li key={page.id}>
                      <span>{page.name}</span>
                      <small>{page.hasInstagram ? 'com Instagram' : page.category || 'página'}</small>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : null}
        </section>

        <aside className="meta-agency-card">
          <p className="meta-agency-kicker">Permissões</p>
          <h2>O que este token pode fazer</h2>
          <p>Marque no BM ao gerar o token. Anúncios já ligam o Tráfego; o restante fica pronto para Facebook e Instagram.</p>
          {uses.map((use) => (
            <div className="meta-agency-use" key={use.id}>
              <div className="meta-agency-use-head">
                <strong>{use.label}</strong>
                <span className={`meta-agency-status ${use.ready ? 'is-ok' : 'is-wait'}`}>
                  {use.ready ? <><CheckCircle2 className="h-3.5 w-3.5" /> Pronto</> : 'Falta permissão'}
                </span>
              </div>
              <p>{use.detail}</p>
              <div className="meta-agency-scopes">
                {use.scopes.map((item) => (
                  <span key={item.scope} className={`meta-agency-scope ${item.ok ? 'is-ok' : 'is-missing'}`}>
                    {item.scope}
                  </span>
                ))}
              </div>
            </div>
          ))}

          <h2 style={{ marginTop: '1.25rem' }}>Como gerar</h2>
          <ol className="meta-agency-steps">
            <li>No Business Manager: Usuários → Usuários do sistema.</li>
            <li>Atribua contas de anúncio, páginas e Instagram (controle total ou gerenciar campanhas).</li>
            <li>Gere um token no aplicativo da agência, com as permissões da lista ao lado.</li>
            <li>Cole aqui e clique em Salvar e testar. Não use o token do cliente no Rastreamento.</li>
          </ol>
          <p className="meta-agency-hint" style={{ marginTop: '0.85rem' }}>
            <a href="https://business.facebook.com/settings/" target="_blank" rel="noreferrer">Abrir Business Manager</a>
            {' · '}
            <Link to="/meta-integration-help">Guia completo</Link>
            {' · '}
            <Link to="/paid-traffic/dashboard">Voltar ao Tráfego</Link>
          </p>
        </aside>
      </div>
    </div>
  );
}
