import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Loader2, MessageCircle, Plus, RefreshCw, ShoppingBag, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { RastreamentoSectionTitle } from '@/components/crm/RastreamentoUi';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { cn } from '@/lib/utils';

function ActionSelect({ label, hint, value, onChange, options, placeholder, disabled, required }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.resourceName === value);
  const allowNone = !required && options.length > 0;
  return (
    <label className="meta-manual-field gads-conv-field">
      <span>
        {label}
        {required ? ' *' : ''}
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="gads-conv-select"
          >
            <span className={cn('truncate', !selected && 'text-muted-foreground')}>
              {selected ? selected.name : placeholder || 'Selecionar…'}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-40" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar ação…" />
            <CommandEmpty>Nenhuma ação de upload de cliques.</CommandEmpty>
            <CommandGroup className="max-h-56 overflow-auto">
              {allowNone ? (
                <CommandItem
                  value="__none__"
                  onSelect={() => {
                    onChange('');
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4', !value ? 'opacity-100' : 'opacity-0')} />
                  Sem mapeamento
                </CommandItem>
              ) : null}
              {options.map((opt) => (
                <CommandItem
                  key={opt.resourceName}
                  value={`${opt.name} ${opt.resourceName}`}
                  onSelect={() => {
                    onChange(opt.resourceName);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === opt.resourceName ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="truncate">{opt.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function statusForAccount(account) {
  if (account.conversions_enabled && account.conv_action_lead) return { id: 'active', label: 'Devolvendo' };
  if (account.conversions_enabled) return { id: 'draft', label: 'Falta ação de conversa' };
  return { id: 'not_connected', label: 'Desligado' };
}

/**
 * Integrações: devolver conversões Google Ads (gclid) por conta vinculada.
 */
export default function RastreamentoGoogleAdsConversions({ clienteId, onChanged }) {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [actionInfo, setActionInfo] = useState({});
  const [loadingActions, setLoadingActions] = useState('');

  const loadAccounts = useCallback(async () => {
    if (!clienteId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('cliente_google_ads_accounts')
        .select(
          'id, google_customer_id, google_customer_name, conversions_enabled, conv_action_lead, conv_action_qualified, conv_action_purchase',
        )
        .eq('cliente_id', clienteId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setAccounts(data || []);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar contas Google',
        description: err.message,
      });
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, [clienteId, toast]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const loadActions = useCallback(
    async (customerId) => {
      if (!customerId) return;
      setLoadingActions(customerId);
      try {
        const { data, error } = await supabase.functions.invoke('google-ads-api', {
          body: { action: 'list-conversion-actions', customerId },
        });
        if (error) throw error;
        const actions = data?.actions || [];
        const listError = data?.error?.message || '';
        if (listError && !actions.length) {
          toast({
            title: 'Ações de conversão',
            description: listError,
          });
        }
        setActionInfo((prev) => ({
          ...prev,
          [customerId]: {
            actions,
            otherCount: Number(data?.otherCount || 0),
            error: listError,
          },
        }));
      } catch (err) {
        toast({
          variant: 'destructive',
          title: 'Erro ao listar ações Google',
          description: err.message,
        });
        setActionInfo((prev) => ({
          ...prev,
          [customerId]: { actions: [], otherCount: 0, error: err.message },
        }));
      } finally {
        setLoadingActions('');
      }
    },
    [toast],
  );

  useEffect(() => {
    accounts.forEach((acc) => {
      if (!actionInfo[acc.google_customer_id]) {
        void loadActions(acc.google_customer_id);
      }
    });
  }, [accounts, actionInfo, loadActions]);

  const persistAccount = async (account, patch, { requireLead = true } = {}) => {
    const next = { ...account, ...patch };
    if (requireLead && next.conversions_enabled && !String(next.conv_action_lead || '').trim()) {
      toast({
        variant: 'destructive',
        title: 'Ação de conversa obrigatória',
        description: 'Escolha ou crie a ação da 1ª mensagem (upload de cliques) antes de ligar.',
      });
      return false;
    }
    const { error } = await supabase
      .from('cliente_google_ads_accounts')
      .update({
        conversions_enabled: !!next.conversions_enabled,
        conv_action_lead: next.conv_action_lead || null,
        conv_action_qualified: next.conv_action_qualified || null,
        conv_action_purchase: next.conv_action_purchase || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', account.id);
    if (error) throw error;
    setAccounts((prev) => prev.map((row) => (row.id === account.id ? { ...row, ...next } : row)));
    onChanged?.();
    return true;
  };

  const saveAccount = async (account, patch) => {
    setSavingId(account.id);
    try {
      const ok = await persistAccount(account, patch);
      if (ok) toast({ title: 'Conversões Google salvas' });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar',
        description: err.message,
      });
    } finally {
      setSavingId('');
    }
  };

  const ensureActions = async (account, enableAfter = true) => {
    setSavingId(account.id);
    try {
      const { data, error } = await supabase.functions.invoke('google-ads-api', {
        body: {
          action: 'ensure-conversion-actions',
          customerId: account.google_customer_id,
        },
      });
      if (error) throw error;
      if (data?.error?.message) throw new Error(data.error.message);
      const actions = data?.actions || [];
      const mapped = data?.mapped || {};
      setActionInfo((prev) => ({
        ...prev,
        [account.google_customer_id]: {
          actions,
          otherCount: Number(data?.otherCount || 0),
          error: '',
        },
      }));
      if (!mapped.lead) {
        toast({
          variant: 'destructive',
          title: 'Ação de conversa não criada',
          description: 'O Google não devolveu a ação Planeje — Conversa.',
        });
        return;
      }
      const ok = await persistAccount(
        account,
        {
          conversions_enabled: enableAfter ? true : account.conversions_enabled,
          conv_action_lead: mapped.lead,
          conv_action_qualified: mapped.qualified || account.conv_action_qualified || '',
          conv_action_purchase: mapped.purchase || account.conv_action_purchase || '',
        },
        { requireLead: false },
      );
      if (ok) {
        const createdCount = Array.isArray(data?.created) ? data.created.length : 0;
        toast({
          title: createdCount ? 'Ações criadas no Google Ads' : 'Ações do Planeje mapeadas',
          description: 'Conversa, Qualificado e Compra prontos para devolver o gclid.',
        });
      }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível criar as ações',
        description: err.message,
      });
    } finally {
      setSavingId('');
    }
  };

  const onToggle = (account, checked, actions) => {
    if (checked && !String(account.conv_action_lead || '').trim() && !actions.length) {
      void ensureActions(account, true);
      return;
    }
    void saveAccount(account, { conversions_enabled: checked });
  };

  const mappedCount = useMemo(
    () => accounts.filter((a) => a.conversions_enabled).length,
    [accounts],
  );

  if (!clienteId) return null;

  return (
    <div className="meta-manual">
      <div className="meta-manual-head">
        <div>
          <p className="meta-manual-kicker">Google Ads</p>
          <RastreamentoSectionTitle
            as="h3"
            title="Devolver conversões (gclid)"
            help="A 1ª mensagem com gclid envia a ação de conversa. Qualificado e Compra só se mapeados. Se a conta não tiver ação de upload de cliques, o Planeje cria Conversa, Qualificado e Compra no Google Ads."
            helpLabel="Sobre conversões Google"
          />
        </div>
        <div className="gads-conv-head-actions">
          <div className={`meta-manual-status is-${mappedCount ? 'active' : 'not_connected'}`}>
            {mappedCount ? `${mappedCount} conta${mappedCount > 1 ? 's' : ''} ligada${mappedCount > 1 ? 's' : ''}` : 'Desligado'}
          </div>
          <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => loadAccounts()}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
            Atualizar
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !accounts.length ? (
        <p className="meta-manual-note" style={{ marginTop: '1rem' }}>
          Nenhuma conta Google Ads neste cliente. Vincule na ficha do cliente e volte aqui.
        </p>
      ) : (
        accounts.map((account) => {
          const info = actionInfo[account.google_customer_id] || { actions: [], otherCount: 0, error: '' };
          const actions = info.actions || [];
          const busy = savingId === account.id || loadingActions === account.google_customer_id;
          const status = statusForAccount(account);
          const needsCreate = actions.length === 0;
          return (
            <div key={account.id} className="gads-conv-account">
              <div className="meta-manual-summary">
                <div>
                  <strong>{account.google_customer_name || account.google_customer_id}</strong>
                  <small>ID {account.google_customer_id}</small>
                </div>
                <div>
                  <strong>{actions.length}</strong>
                  <small>{actions.length === 1 ? 'ação UPLOAD_CLICKS' : 'ações UPLOAD_CLICKS'}</small>
                </div>
                <span className={`meta-manual-status is-${status.id}`}>{status.label}</span>
                <div className="gads-conv-actions">
                  <div className="gads-conv-switch">
                    <label htmlFor={`gconv-${account.id}`}>Devolver ao Google</label>
                    <Switch
                      id={`gconv-${account.id}`}
                      checked={!!account.conversions_enabled}
                      disabled={busy}
                      onCheckedChange={(checked) => onToggle(account, checked, actions)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => loadActions(account.google_customer_id)}
                  >
                    {loadingActions === account.google_customer_id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5 mr-1" />
                    )}
                    Recarregar ações
                  </Button>
                </div>
              </div>

              {needsCreate ? (
                <div className="gads-conv-empty">
                  <p>
                    {info.error
                      ? info.error
                      : info.otherCount
                        ? `A conta tem ${info.otherCount} ação(ões) no Google, mas nenhuma de importação / upload de cliques — é esse tipo que devolve o gclid.`
                        : 'Esta conta ainda não tem ação de importação / upload de cliques. Sem ela o seletor fica vazio e o interruptor não liga.'}
                  </p>
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => ensureActions(account, true)}
                  >
                    {savingId === account.id ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <Plus className="h-4 w-4 mr-1" />
                    )}
                    Criar ações no Google
                  </Button>
                </div>
              ) : null}

              <div className="meta-manual-grid gads-conv-grid">
                <section className="meta-manual-card">
                  <div className="meta-manual-card__title">
                    <MessageCircle className="h-4 w-4" />
                    <div>
                      <span>1. Conversa</span>
                      <strong>1ª mensagem</strong>
                    </div>
                  </div>
                  <ActionSelect
                    label="Ação no Google Ads"
                    required={!!account.conversions_enabled}
                    value={account.conv_action_lead || ''}
                    options={actions}
                    disabled={busy}
                    placeholder={busy ? 'Carregando…' : needsCreate ? 'Nenhuma ação ainda' : 'Escolher ação'}
                    hint="Obrigatória se o interruptor estiver ligado."
                    onChange={(resourceName) =>
                      saveAccount(account, { conv_action_lead: resourceName })
                    }
                  />
                </section>
                <section className="meta-manual-card">
                  <div className="meta-manual-card__title">
                    <UserCheck className="h-4 w-4" />
                    <div>
                      <span>2. Qualificado</span>
                      <strong>Opcional</strong>
                    </div>
                  </div>
                  <ActionSelect
                    label="Ação no Google Ads"
                    value={account.conv_action_qualified || ''}
                    options={actions}
                    disabled={busy}
                    placeholder="Sem mapeamento"
                    hint="Só envia se esta ação existir."
                    onChange={(resourceName) =>
                      saveAccount(account, { conv_action_qualified: resourceName })
                    }
                  />
                </section>
                <section className="meta-manual-card">
                  <div className="meta-manual-card__title">
                    <ShoppingBag className="h-4 w-4" />
                    <div>
                      <span>3. Compra</span>
                      <strong>Opcional</strong>
                    </div>
                  </div>
                  <ActionSelect
                    label="Ação no Google Ads"
                    value={account.conv_action_purchase || ''}
                    options={actions}
                    disabled={busy}
                    placeholder="Sem mapeamento"
                    hint="Envia valor em BRL quando houver."
                    onChange={(resourceName) =>
                      saveAccount(account, { conv_action_purchase: resourceName })
                    }
                  />
                </section>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
