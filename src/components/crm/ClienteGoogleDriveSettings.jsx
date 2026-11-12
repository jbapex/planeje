import React, { useCallback, useEffect, useState } from 'react';
import { HardDrive, Loader2, Unplug, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import {
  GOOGLE_DRIVE_SETTINGS_PATH,
  OAUTH_NOT_CONFIGURED_MESSAGE,
  googleDriveOAuthErrorMessage,
} from '@/lib/googleDriveAgency';
import {
  disconnectGoogleDrive,
  fetchGoogleDriveStatus,
  getGoogleDriveAuthUrl,
} from '@/lib/googleDriveClient';

/**
 * Conecta o Google Drive da empresa (cliente) via OAuth.
 * Usado em Canais → Integrações e no seletor de anexos.
 */
export default function ClienteGoogleDriveSettings({ clienteId, className }) {
  const { toast } = useToast();
  const { profile } = useAuth();
  const isSuperAdmin = profile?.role === 'superadmin';
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [status, setStatus] = useState(null);

  const load = useCallback(async () => {
    if (!clienteId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const s = await fetchGoogleDriveStatus(clienteId);
      setStatus(s);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao carregar Drive', description: e?.message });
    } finally {
      setLoading(false);
    }
  }, [clienteId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
    if (params.get('google_drive') === 'connected') {
      void load();
      toast({ title: 'Google Drive conectado' });
      const base = window.location.hash.split('?')[0];
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${base}`);
    }
  }, [load, toast]);

  const handleConnect = async () => {
    if (!clienteId) return;
    setConnecting(true);
    try {
      const { url } = await getGoogleDriveAuthUrl(clienteId);
      if (!url) throw new Error('URL de autorização não retornada');
      window.open(url, '_blank', 'noopener,noreferrer');
      toast({
        title: 'Autorize no Google',
        description: 'Após permitir o acesso, volte aqui — o status atualiza automaticamente.',
      });
      // Recarrega status após alguns segundos (usuário pode ter concluído)
      setTimeout(() => void load(), 8000);
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível iniciar OAuth',
        description: googleDriveOAuthErrorMessage(e),
      });
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!clienteId) return;
    setDisconnecting(true);
    try {
      await disconnectGoogleDrive(clienteId);
      toast({ title: 'Google Drive desconectado' });
      await load();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao desconectar', description: e?.message });
    } finally {
      setDisconnecting(false);
    }
  };

  if (!clienteId) return null;

  const connected = !!status?.connected;

  return (
    <div
      className={
        className ||
        'rounded-xl border border-sky-200/80 dark:border-sky-800/50 bg-sky-50/40 dark:bg-sky-950/20 p-4 space-y-4'
      }
    >
      <div className="flex items-start gap-3">
        <HardDrive className="h-5 w-5 text-sky-700 dark:text-sky-400 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            Google Drive da empresa
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Conecte o Drive desta empresa. Na tarefa, Anexos → Google Drive: abra a pasta, escolha o
            vídeo. O arquivo permanece no Drive; o Planeje só guarda o vínculo e toca daqui.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {connected ? (
              <>
                <span className="inline-flex items-center rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 px-2 py-1 text-xs font-medium">
                  Conectado
                </span>
                {status?.email && (
                  <span className="text-xs text-muted-foreground truncate">{status.email}</span>
                )}
                {status?.connectedAt && (
                  <span className="text-[10px] text-muted-foreground">
                    desde {new Date(status.connectedAt).toLocaleString('pt-BR')}
                  </span>
                )}
              </>
            ) : (
              <span className="inline-flex items-center rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 px-2 py-1 text-xs font-medium">
                {status?.status === 'error' ? 'Erro na conexão' : 'Não conectado'}
              </span>
            )}
          </div>

          {status?.lastError && (
            <Alert className="py-2 bg-background/60">
              <AlertDescription className="text-[10px] leading-relaxed text-destructive">
                {googleDriveOAuthErrorMessage(status.lastError)}
              </AlertDescription>
            </Alert>
          )}

          {!status?.oauthConfigured && (
            <Alert className="py-2 bg-background/60">
              <AlertDescription className="text-[10px] leading-relaxed">
                {OAUTH_NOT_CONFIGURED_MESSAGE}
                {isSuperAdmin ? (
                  <>
                    {' '}
                    <Link to={GOOGLE_DRIVE_SETTINGS_PATH} className="underline">
                      Abrir configuração
                    </Link>
                    .
                  </>
                ) : null}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            {!connected ? (
              <Button
                size="sm"
                className="bg-sky-600 hover:bg-sky-700"
                onClick={handleConnect}
                disabled={connecting || !status?.oauthConfigured}
              >
                {connecting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <ExternalLink className="h-4 w-4 mr-2" />
                )}
                Conectar Google Drive
              </Button>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={handleConnect} disabled={connecting}>
                  {connecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Reconectar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                >
                  {disconnecting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Unplug className="h-4 w-4 mr-2" />
                  )}
                  Desconectar
                </Button>
              </>
            )}
            <Button size="sm" variant="outline" onClick={() => void load()}>
              Atualizar status
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
