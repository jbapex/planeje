import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link2, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/customSupabaseClient';
import { RastreamentoSectionTitle } from '@/components/crm/RastreamentoUi';

function errorText(error) {
  const code = typeof error === 'string' ? error : error?.message || '';
  const messages = {
    crm_sync_forbidden: 'Somente o administrador da agência pode configurar esta conexão.',
    crm_sync_worker_offline: 'O serviço de sincronização está indisponível. Tente novamente mais tarde.',
    crm_sync_invalid_url: 'Informe o endereço do CRM Ápice fornecido para esta loja.',
    crm_sync_invalid_key: 'Informe uma chave de integração válida.',
    crm_sync_changed: 'A conexão foi alterada. Atualize o estado antes de continuar.',
    crm_sync_test_required: 'Teste a conexão antes de ativar a sincronização.',
    crm_sync_paused: 'Ative a sincronização antes de atualizar os status.',
    crm_sync_timeout: 'A consulta demorou demais. Atualize o estado para conferir se o pedido foi recebido.',
    source_read_failed: 'Não foi possível consultar o CRM. Confira o endereço e a chave.',
    invalid_source_identity: 'O CRM não identificou a loja. Confira a conexão.',
    database_failed: 'Não foi possível concluir a atualização. Confira se a loja já está vinculada a outro cliente.',
  };
  if (error?.code === 'PGRST202') return 'A integração ainda não foi instalada neste ambiente.';
  return messages[code] || 'Não foi possível concluir. Tente novamente ou solicite suporte.';
}

function when(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) return 'Ainda não sincronizou';
  return new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export default function RastreamentoCrmApice({ clienteId }) {
  const [info, setInfo] = useState(null);
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const serial = useRef(0);
  const busyRef = useRef(false);
  const initialized = useRef(false);
  const mounted = useRef(false);
  const reading = useRef(false);
  const controllers = useRef(new Set());

  const request = useCallback(async (args) => {
    const controller = new AbortController();
    controllers.current.add(controller);
    let timer;
    try {
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject({ message: 'crm_sync_timeout' }); }, 20000);
      });
      return await Promise.race([supabase.rpc('crm_apice_sync_control', args).abortSignal(controller.signal), timeout]);
    } finally {
      clearTimeout(timer);
      controllers.current.delete(controller);
    }
  }, []);

  const load = useCallback(async () => {
    if (!clienteId || busyRef.current || reading.current) return;
    reading.current = true;
    const ticket = ++serial.current;
    try {
      const result = await request({ p_cliente_id: clienteId, p_action: 'status' });
      if (!mounted.current || ticket !== serial.current) return;
      if (result.error) throw result.error;
      setInfo(result.data); setError('');
      if (!initialized.current) { setUrl(result.data.source_url || ''); initialized.current = true; }
    } catch (failure) {
      if (mounted.current && ticket === serial.current) setError(errorText(failure));
    } finally {
      reading.current = false;
    }
  }, [clienteId, request]);

  useEffect(() => {
    const activeControllers = controllers.current;
    mounted.current = true;
    void load();
    const timer = window.setInterval(() => { void load(); }, 5000);
    return () => {
      mounted.current = false; serial.current += 1; window.clearInterval(timer);
      for (const controller of activeControllers) controller.abort();
    };
  }, [load]);

  const act = async (action) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    const ticket = ++serial.current;
    try {
      const result = await request({
        p_cliente_id: clienteId, p_action: action, p_revision: info?.revision || null,
        ...(action === 'test' ? { p_url: url.trim(), p_secret: secret.trim() || null } : {}),
      });
      if (!mounted.current || ticket !== serial.current) return;
      if (result.error) throw result.error;
      setInfo(result.data);
      if (action === 'test') { setSecret(''); setUrl(result.data.source_url || url); }
    } catch (failure) {
      if (mounted.current && ticket === serial.current) setError(errorText(failure));
    } finally {
      busyRef.current = false;
      if (mounted.current && ticket === serial.current) setBusy(false);
    }
  };

  if (!clienteId) return null;
  const pending = Boolean(info?.command || info?.working);
  const dirty = url.trim() !== (info?.source_url || '') || Boolean(secret.trim());
  const available = Boolean(info?.worker_alive) && !busy && !error;
  const ready = available && !pending && !dirty && Boolean(info?.tested_at);
  const state = !info ? 'Carregando…' : !info.worker_alive ? 'Serviço indisponível'
    : info.command === 'test' ? 'Testando conexão…' : pending ? 'Sincronização solicitada…'
      : info.last_error ? 'Precisa de atenção' : info.enabled ? 'Sincronização ativa'
        : info.tested_at ? 'Conexão validada · pausada' : 'Não conectado';

  return (
    <section className="wa-instances" id="integration-crm-apice" aria-label="Integração CRM Ápice">
      <div className="meta-manual-head flex-wrap gap-3">
        <div>
          <p className="meta-manual-kicker">Status dos leads</p>
          <RastreamentoSectionTitle as="h3" title="CRM Ápice" help="Consulta os status do CRM e exibe na coluna Etiqueta dos leads com o mesmo telefone, nesta loja. Telefones com status conflitantes ficam preservados." />
        </div>
        <span role="status" className="rounded-full border px-3 py-1 text-xs font-medium">{state}</span>
      </div>
      <p className="meta-manual-note mt-3">Conecte o CRM desta loja para acompanhar os status no Rastreamento.</p>
      {error ? <p role="alert" className="mt-3 text-sm text-destructive">{error}</p> : null}
      {info ? <>
        <form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); void act('test'); }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor={`crm-url-${clienteId}`}>Endereço do CRM</Label>
              <Input id={`crm-url-${clienteId}`} type="url" required placeholder="https://dadoscrm.jbapex.com.br" value={url} onChange={(e) => { setUrl(e.target.value); setError(''); }} disabled={busy || pending} />
            </div>
            <div className="space-y-2"><Label htmlFor={`crm-key-${clienteId}`}>Chave de integração</Label>
              <Input id={`crm-key-${clienteId}`} type="password" autoComplete="new-password" value={secret} onChange={(e) => { setSecret(e.target.value); setError(''); }} placeholder={info.configured ? 'Chave salva · preencha para trocar' : 'Cole a chave fornecida pelo CRM'} disabled={busy || pending} />
            </div>
          </div>
          {dirty && info.enabled ? <p className="text-sm text-muted-foreground">Testar os novos dados pausa a sincronização atual até você ativar novamente.</p> : null}
          <Button type="submit" variant="outline" disabled={!available || pending || !url.trim() || (!info.configured && !secret.trim())}>
            {busy || info.command === 'test' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}Testar conexão
          </Button>
        </form>
        {info.tested_at ? <div className="mt-5 rounded-xl border bg-muted/30 p-4">
          <p className="text-sm">Loja encontrada no CRM: <strong className="break-words">{info.organization_name}</strong></p>
          <p className="mt-1 text-xs text-muted-foreground">Confira se corresponde à loja selecionada antes de ativar.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {info.enabled ? <Button variant="outline" disabled={busy} onClick={() => void act('pause')}>Pausar sincronização</Button>
              : <Button disabled={!ready} onClick={() => void act('enable')}>Ativar sincronização</Button>}
            <Button variant="outline" disabled={!ready || !info.enabled} onClick={() => void act('sync')}>Sincronizar agora</Button>
          </div>
        </div> : null}
        {info.last_error ? <p role="alert" className="mt-3 text-sm text-destructive">{errorText(info.last_error)}</p> : null}
        <div className="mt-5 flex flex-wrap items-start justify-between gap-3 border-t pt-4 text-sm">
          <div><p className="font-medium">Última sincronização</p><p className="text-muted-foreground">{when(info.last_success_at)}</p>
            {info.last_success_at ? <p className="mt-1 text-xs text-muted-foreground">{info.report?.applied || 0} registros atualizados · {info.report?.conflicting_phones || 0} telefones com conflito ou status vazio</p> : null}
          </div>
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={busy}><RefreshCw className="mr-2 h-4 w-4" />Atualizar estado</Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Quando ativa, a consulta se repete cerca de um minuto após cada sincronização. O resultado aparece como CRM-Apice na coluna Etiqueta.</p>
      </> : <Button variant="ghost" className="mt-3" onClick={() => void load()}>{error ? 'Tentar novamente' : 'Carregando conexão…'}</Button>}
    </section>
  );
}
