import React, { useCallback, useEffect, useState } from 'react';
import { BarChart2, Loader2, Save, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/components/ui/use-toast';
import {
  fetchClienteMetaCtwaSettings,
  saveClienteMetaCtwaToken,
} from '@/lib/metaCtwaClientToken';

/**
 * Token Meta do BM do cliente (conversões CTWA). Não usa MADS / token global de agência.
 */
export default function ClienteMetaCtwaSettings({ clienteId, className }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [businessId, setBusinessId] = useState('');
  const [tokenInput, setTokenInput] = useState('');

  const load = useCallback(async () => {
    if (!clienteId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const s = await fetchClienteMetaCtwaSettings(clienteId);
      setBusinessId(s.businessId);
      setHasToken(s.hasToken);
      setUpdatedAt(s.updatedAt);
      setTokenInput('');
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao carregar', description: e?.message });
    } finally {
      setLoading(false);
    }
  }, [clienteId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    if (!clienteId) return;
    const token = tokenInput.trim();
    if (!token && !hasToken && !businessId.trim()) {
      toast({ variant: 'destructive', title: 'Cole o token ou o ID do BM do cliente' });
      return;
    }
    setSaving(true);
    try {
      await saveClienteMetaCtwaToken(clienteId, {
        token: token || undefined,
        businessId: businessId.trim(),
      });
      toast({
        title: token ? 'Token Meta do cliente salvo' : 'Configuração atualizada',
        description: 'Use «Listar contas» nos canais abaixo com o BM deste cliente.',
      });
      setTokenInput('');
      await load();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  if (!clienteId) return null;

  return (
    <div
      className={
        className ||
        'rounded-xl border border-amber-200/80 dark:border-amber-800/50 bg-amber-50/40 dark:bg-amber-950/20 p-4 space-y-4 mb-0'
      }
    >
      <div className="flex items-start gap-3">
        <Shield className="h-5 w-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <BarChart2 className="h-4 w-4" />
            Token Meta do cliente (conversões WhatsApp)
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Configuração da <strong>empresa (cliente)</strong> — vale para todos os logins desta conta.
            A agência (MADS) não vincula WhatsApp no BM parceiro. Gere o token no{' '}
            <strong>Business Manager do cliente</strong> e cole abaixo.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">ID do Business Manager do cliente</Label>
              <Input
                className="h-9 font-mono text-xs"
                placeholder="Ex.: 123456789012345"
                value={businessId}
                onChange={(e) => setBusinessId(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">
                Configurações do negócio → Informações da empresa → ID do portfólio (opcional se o token listar
                sozinho).
              </p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">
                Token do System User (cliente)
                {hasToken ? (
                  <span className="ml-2 text-emerald-600 font-medium">· configurado</span>
                ) : (
                  <span className="ml-2 text-amber-600 font-medium">· pendente</span>
                )}
              </Label>
              <Input
                type="password"
                className="h-9 font-mono text-xs"
                placeholder={hasToken ? 'Cole um novo token para substituir' : 'Cole o token aqui'}
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                autoComplete="off"
              />
              {updatedAt && (
                <p className="text-[10px] text-muted-foreground">
                  Atualizado em {new Date(updatedAt).toLocaleString('pt-BR')}
                </p>
              )}
            </div>
          </div>

          <Alert className="py-2 bg-background/60">
            <AlertDescription className="text-[10px] leading-relaxed">
              Permissões no app Meta: <code>whatsapp_business_management</code>,{' '}
              <code>whatsapp_business_manage_events</code>, <code>business_management</code>.
              No BM do cliente: atribuir <strong>Conta do WhatsApp</strong> ao System User (não na MADS).
            </AlertDescription>
          </Alert>

          <Button type="button" className="h-9" disabled={saving} onClick={() => void handleSave()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar token do cliente
          </Button>
        </>
      )}
    </div>
  );
}
