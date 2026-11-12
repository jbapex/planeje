import React, { useCallback, useEffect, useState } from 'react';
import { Copy, KeyRound, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  MCP_PUBLIC_ENDPOINT,
  buildMcpClientConfig,
  generateMcpUserToken,
  listMcpUserTokens,
  revokeMcpUserToken,
} from '@/lib/mcpUserTokenClient';

/**
 * Token MCP pessoal — Configurações → Conta (equipe interna).
 */
export default function McpUserTokenCard({ enabled = true }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tokens, setTokens] = useState([]);
  const [freshToken, setFreshToken] = useState(null);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [confirmRevokeId, setConfirmRevokeId] = useState(null);

  const load = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await listMcpUserTokens();
      setTokens(rows.filter((t) => !t.revoked_at));
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar tokens MCP',
        description: e?.message || String(e),
      });
    } finally {
      setLoading(false);
    }
  }, [enabled, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const copy = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${label} copiado` });
    } catch {
      toast({ variant: 'destructive', title: 'Não foi possível copiar' });
    }
  };

  const handleGenerate = async () => {
    setBusy(true);
    try {
      const data = await generateMcpUserToken({ label: 'default' });
      setFreshToken(data?.token || null);
      toast({
        title: 'Token MCP gerado',
        description: 'Copie agora — ele não aparece de novo.',
      });
      await load();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Erro ao gerar token',
        description: e?.message || String(e),
      });
    } finally {
      setBusy(false);
      setConfirmRegen(false);
    }
  };

  const handleRevoke = async (id) => {
    setBusy(true);
    try {
      await revokeMcpUserToken(id);
      if (freshToken) setFreshToken(null);
      toast({ title: 'Token revogado' });
      await load();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Erro ao revogar',
        description: e?.message || String(e),
      });
    } finally {
      setBusy(false);
      setConfirmRevokeId(null);
    }
  };

  if (!enabled) return null;

  const active = tokens[0] || null;
  const configJson = freshToken
    ? JSON.stringify(buildMcpClientConfig(freshToken), null, 2)
    : null;

  return (
    <>
      <article className="planeje-settings-card">
        <div className="planeje-settings-card-header">
          <div className="planeje-settings-card-icon planeje-settings-card-icon--key">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h2 className="planeje-settings-card-title">Token MCP (pessoal)</h2>
            <p className="planeje-settings-card-desc">
              Conecte ChatGPT, Claude ou Cursor ao Planeje com o seu usuário da equipe. Depois de
              atualizar o MCP, reconecte o conector para aparecerem as abas novas (tráfego, redes,
              rastreamento).
            </p>
          </div>
        </div>

        <div className="planeje-settings-card-body space-y-4">
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="planeje-settings-info-row">
                <span className="planeje-settings-info-label">Endpoint</span>
                <span className="planeje-settings-info-value font-mono text-xs break-all">
                  {MCP_PUBLIC_ENDPOINT}
                </span>
              </div>

              {active ? (
                <div className="planeje-settings-info-row">
                  <span className="planeje-settings-info-label">Token ativo</span>
                  <span className="planeje-settings-info-value font-mono text-xs">
                    {active.token_prefix}…
                  </span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhum token ativo. Gere um para autenticar no MCP.
                </p>
              )}

              {freshToken && (
                <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/80 p-3 dark:border-amber-900 dark:bg-amber-950/40">
                  <p className="text-xs font-medium text-amber-900 dark:text-amber-100">
                    Token (copie agora — não será mostrado de novo)
                  </p>
                  <div className="flex gap-2">
                    <Input readOnly value={freshToken} className="font-mono text-[11px] h-9" />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      onClick={() => void copy(freshToken, 'Token')}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  {configJson && (
                    <div className="space-y-1">
                      <p className="text-[11px] text-muted-foreground">Exemplo de config</p>
                      <pre className="max-h-40 overflow-auto rounded-md bg-black/5 p-2 text-[10px] dark:bg-white/5">
                        {configJson}
                      </pre>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2"
                        onClick={() => void copy(configJson, 'Config')}
                      >
                        <Copy className="h-3.5 w-3.5 mr-1" />
                        Copiar JSON
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="planeje-settings-card-footer flex flex-col sm:flex-row gap-2">
          <Button
            type="button"
            className="w-full sm:flex-1"
            disabled={busy || loading}
            onClick={() => (active ? setConfirmRegen(true) : void handleGenerate())}
          >
            {busy ? (
              <Loader2 className="animate-spin mr-2 h-4 w-4" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {active ? 'Regenerar token' : 'Gerar token'}
          </Button>
          {active && (
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              disabled={busy}
              onClick={() => setConfirmRevokeId(active.id)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Revogar
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => void copy(MCP_PUBLIC_ENDPOINT, 'Endpoint')}
          >
            <Copy className="mr-2 h-4 w-4" />
            Endpoint
          </Button>
        </div>
      </article>

      <AlertDialog open={confirmRegen} onOpenChange={setConfirmRegen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerar token MCP?</AlertDialogTitle>
            <AlertDialogDescription>
              O token atual deixa de funcionar imediatamente. Atualize a config no G4 OS / Cursor.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => void handleGenerate()}>
              Regenerar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(confirmRevokeId)}
        onOpenChange={(open) => !open && setConfirmRevokeId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revogar token MCP?</AlertDialogTitle>
            <AlertDialogDescription>
              Clientes que usam este token perderão o acesso ao Planeje via MCP.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={() => confirmRevokeId && void handleRevoke(confirmRevokeId)}
            >
              Revogar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
