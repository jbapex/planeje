/**
 * CRM-APICE — Integração Planeje (etiqueta em Contatos).
 * Copie para o repositório do Ápice, ajuste imports (supabase, useAuth).
 *
 * - Superadmin: secret do webhook de banco + URL padrão do Planeje (vale para todos os clientes).
 * - Qualquer usuário de cliente: Bearer do Planeje (Canais) + URL opcional só daquele cliente.
 */

import React, { useEffect, useState, useCallback } from 'react';

const GLOBAL_ID = 1;

export default function PlanejeIntegrationPageExample({ supabase, profile }) {
  const role = profile?.role ?? '';
  const clienteId = profile?.cliente_id ?? null;
  const isSuperadmin = role === 'superadmin';

  const [globalSecret, setGlobalSecret] = useState('');
  const [globalUrl, setGlobalUrl] = useState('');
  const [clientBearer, setClientBearer] = useState('');
  const [clientUrl, setClientUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [savingClient, setSavingClient] = useState(false);
  const [msg, setMsg] = useState(null);

  const apiceFnUrl =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL
      ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify-planeje-lead-status`
      : 'https://<SEU-PROJETO-APICE>.supabase.co/functions/v1/notify-planeje-lead-status';

  const load = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setMsg(null);
    try {
      if (isSuperadmin) {
        const { data: g, error: eg } = await supabase
          .from('crm_planeje_global_settings')
          .select('apice_database_webhook_secret, planeje_default_status_webhook_url')
          .eq('id', GLOBAL_ID)
          .maybeSingle();
        if (eg) throw eg;
        if (g) {
          setGlobalSecret(g.apice_database_webhook_secret ?? '');
          setGlobalUrl(g.planeje_default_status_webhook_url ?? '');
        }
      }
      if (clienteId) {
        const { data: c, error: ec } = await supabase
          .from('crm_planeje_status_sync')
          .select('planeje_bearer_secret, planeje_status_webhook_url')
          .eq('cliente_id', clienteId)
          .maybeSingle();
        if (ec) throw ec;
        if (c) {
          setClientBearer(c.planeje_bearer_secret ?? '');
          setClientUrl(c.planeje_status_webhook_url ?? '');
        }
      }
    } catch (e) {
      setMsg({ type: 'error', text: e?.message || String(e) });
    } finally {
      setLoading(false);
    }
  }, [supabase, isSuperadmin, clienteId]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveGlobal = async () => {
    if (!supabase || !isSuperadmin) return;
    setSavingGlobal(true);
    setMsg(null);
    const { error } = await supabase.from('crm_planeje_global_settings').upsert(
      {
        id: GLOBAL_ID,
        apice_database_webhook_secret: globalSecret.trim() || null,
        planeje_default_status_webhook_url: globalUrl.trim() || null,
      },
      { onConflict: 'id' }
    );
    setSavingGlobal(false);
    if (error) {
      setMsg({ type: 'error', text: error.message });
      return;
    }
    setMsg({
      type: 'ok',
      text: 'Configuração global salva. No Supabase → Database → Webhooks, use o mesmo Bearer acima no header Authorization.',
    });
  };

  const saveClient = async () => {
    if (!supabase || !clienteId) return;
    const b = clientBearer.trim();
    if (!b) {
      setMsg({ type: 'error', text: 'Cole o Bearer gerado no Planeje (Canais → bloco roxo).' });
      return;
    }
    setSavingClient(true);
    setMsg(null);
    const { error } = await supabase.from('crm_planeje_status_sync').upsert(
      {
        cliente_id: clienteId,
        planeje_bearer_secret: b,
        planeje_status_webhook_url: clientUrl.trim() || null,
      },
      { onConflict: 'cliente_id' }
    );
    setSavingClient(false);
    if (error) {
      setMsg({ type: 'error', text: error.message });
      return;
    }
    setMsg({ type: 'ok', text: 'Salvo. Cada cliente do Ápice pode ter sua própria configuração.' });
  };

  if (loading) {
    return <p className="p-6 text-sm text-muted-foreground">Carregando…</p>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-10 p-6">
      <div>
        <h1 className="text-xl font-semibold">Integração Planeje — etiqueta em Contatos</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Quando o status do lead muda no Ápice, o Planeje pode mostrar uma etiqueta na página Contatos. Cada{' '}
          <strong>cliente</strong> do sistema usa seu próprio Bearer do Planeje; o administrador define o segredo do
          webhook e a URL padrão uma vez.
        </p>
      </div>

      {isSuperadmin && (
        <section className="space-y-4 rounded-lg border p-4">
          <h2 className="text-sm font-semibold">Administrador — webhook de banco + URL padrão</h2>
          <p className="text-xs text-muted-foreground">
            O <strong>Secret do webhook (Database)</strong> deve ser copiado também para o painel Supabase → Database →
            Webhooks → header <code className="rounded bg-muted px-1">Authorization: Bearer …</code> ao chamar{' '}
            <code className="text-xs break-all">{apiceFnUrl}</code>
          </p>
          <div className="space-y-2">
            <label className="text-sm font-medium">Secret do webhook (Database)</label>
            <input
              type="password"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
              value={globalSecret}
              onChange={(e) => setGlobalSecret(e.target.value)}
              placeholder="String longa aleatória"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">URL padrão do webhook de status (Planeje)</label>
            <input
              type="url"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
              value={globalUrl}
              onChange={(e) => setGlobalUrl(e.target.value)}
              placeholder="https://xxx.supabase.co/functions/v1/crm-apice-contact-status-webhook"
            />
            <p className="text-xs text-muted-foreground">Usada para todos os clientes que não preencherem URL própria.</p>
          </div>
          <button
            type="button"
            disabled={savingGlobal}
            onClick={() => void saveGlobal()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {savingGlobal ? 'Salvando…' : 'Salvar configuração global'}
          </button>
        </section>
      )}

      {clienteId && (
        <section className="space-y-4 rounded-lg border p-4">
          <h2 className="text-sm font-semibold">Seu cliente — conexão com o Planeje</h2>
          <p className="text-xs text-muted-foreground">
            No <strong>Planeje</strong>, abra <strong>Canais</strong>, gere o secret no bloco roxo &quot;Status na página
            Contatos&quot; e cole abaixo. O UUID do cliente no Planeje deve ser o mesmo deste sistema (
            <code className="rounded bg-muted px-1">{clienteId}</code>).
          </p>
          <div className="space-y-2">
            <label className="text-sm font-medium">Bearer do Planeje (secret de Canais)</label>
            <input
              type="password"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
              value={clientBearer}
              onChange={(e) => setClientBearer(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">URL do webhook Planeje (opcional)</label>
            <input
              type="url"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
              value={clientUrl}
              onChange={(e) => setClientUrl(e.target.value)}
              placeholder="Deixe vazio para usar a URL padrão do administrador"
            />
          </div>
          <button
            type="button"
            disabled={savingClient}
            onClick={() => void saveClient()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {savingClient ? 'Salvando…' : 'Salvar'}
          </button>
        </section>
      )}

      {!clienteId && !isSuperadmin && (
        <p className="text-sm text-muted-foreground">Seu usuário não está vinculado a um cliente.</p>
      )}

      {msg && (
        <p
          className={`text-sm ${msg.type === 'error' ? 'text-destructive' : 'text-green-700 dark:text-green-400'}`}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
