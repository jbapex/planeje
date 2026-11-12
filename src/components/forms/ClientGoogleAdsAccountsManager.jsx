import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link2, Plus, X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getGoogleAdAccountsErrorMessage,
} from '@/lib/googleAdAccountsResponse';
import {
  GOOGLE_ADS_SETTINGS_PATH,
  googleAdsCredentialsMissingMessage,
} from '@/lib/googleAdsAgency';

const ClientGoogleAdsAccountsManager = ({ clientId, clientName, searchable = false, focusAccountId }) => {
  const { toast } = useToast();
  const [linkedAccounts, setLinkedAccounts] = useState([]);
  const [availableCustomers, setAvailableCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [selectedToLink, setSelectedToLink] = useState('');
  const [accountSearch, setAccountSearch] = useState('');
  const [credentialsMissing, setCredentialsMissing] = useState(false);
  const emptyToastShownRef = useRef(false);

  const fetchLinkedAccounts = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('cliente_google_ads_accounts')
        .select('*')
        .eq('cliente_id', clientId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setLinkedAccounts(data || []);
    } catch (err) {
      toast({
        title: 'Erro ao carregar contas Google',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [clientId, toast]);

  const fetchAvailableCustomers = useCallback(async () => {
    setLoadingCustomers(true);
    try {
      const { data, error } = await supabase.functions.invoke('google-ads-api', {
        body: { action: 'get-customers' },
      });
      if (error) throw error;
      if (googleAdsCredentialsMissingMessage(data)) {
        setCredentialsMissing(true);
        setAvailableCustomers([]);
        return;
      }
      setCredentialsMissing(false);
      if (data?.error?.message && (!data.customers || data.customers.length === 0)) {
        if (!emptyToastShownRef.current) {
          emptyToastShownRef.current = true;
          toast({
            title: 'Google Ads',
            description: getGoogleAdAccountsErrorMessage(data),
          });
        }
        setAvailableCustomers([]);
        return;
      }
      emptyToastShownRef.current = false;
      setAvailableCustomers(data?.customers || []);
    } catch (err) {
      setCredentialsMissing(false);
      toast({
        title: 'Erro ao buscar contas Google Ads',
        description: err.message,
        variant: 'destructive',
      });
      setAvailableCustomers([]);
    } finally {
      setLoadingCustomers(false);
    }
  }, [toast]);

  useEffect(() => {
    if (clientId) {
      setLoadingCustomers(true);
      fetchLinkedAccounts();
      fetchAvailableCustomers();
    } else {
      setLoadingCustomers(false);
      setAvailableCustomers([]);
    }
  }, [clientId, fetchLinkedAccounts, fetchAvailableCustomers]);

  const handleLinkAccount = async () => {
    if (!selectedToLink || !clientId) return;
    const account = availableCustomers.find((c) => c.id === selectedToLink);
    if (!account) return;

    try {
      const { error } = await supabase.from('cliente_google_ads_accounts').insert({
        cliente_id: clientId,
        google_customer_id: account.id,
        google_customer_name: account.name || account.id,
        is_active: true,
      });

      if (error) {
        if (error.code === '23505') {
          const { error: upErr } = await supabase
            .from('cliente_google_ads_accounts')
            .update({ is_active: true, google_customer_name: account.name })
            .eq('cliente_id', clientId)
            .eq('google_customer_id', account.id);
          if (upErr) throw upErr;
          toast({ title: 'Conta Google reativada' });
        } else {
          throw error;
        }
      } else {
        toast({ title: 'Conta Google Ads vinculada' });
      }
      setSelectedToLink('');
      fetchLinkedAccounts();
    } catch (err) {
      toast({
        title: 'Erro ao vincular',
        description: err.message,
        variant: 'destructive',
      });
    }
  };

  const handleUnlinkAccount = async (linkId) => {
    try {
      const { error } = await supabase
        .from('cliente_google_ads_accounts')
        .update({ is_active: false })
        .eq('id', linkId);
      if (error) throw error;
      toast({ title: 'Conta desvinculada' });
      fetchLinkedAccounts();
    } catch (err) {
      toast({
        title: 'Erro ao desvincular',
        description: err.message,
        variant: 'destructive',
      });
    }
  };

  const availableToLink = availableCustomers.filter(
    (c) => !linkedAccounts.some((l) => l.google_customer_id === c.id)
  );
  const query = accountSearch.trim().toLocaleLowerCase('pt-BR');
  const visibleAccounts = query ? availableToLink.filter(({ id, name }) => `${name || ''} ${id}`.toLocaleLowerCase('pt-BR').includes(query)) : availableToLink;

  if (!clientId) {
    return (
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 dark:text-white">
            <Link2 className="h-5 w-5" />
            Contas Google Ads
          </CardTitle>
          <CardDescription className="dark:text-gray-400">
            Salve o cliente primeiro para vincular contas Google Ads.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="dark:bg-gray-800 dark:border-gray-700">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 dark:text-white">
          <Link2 className="h-5 w-5" />
          Contas Google Ads
        </CardTitle>
        <CardDescription className="dark:text-gray-400">
          Vincule contas Google Ads a {clientName || 'este cliente'} para ver campanhas em Tráfego Pago.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : linkedAccounts.length > 0 ? (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Contas vinculadas ({linkedAccounts.length})</Label>
            {linkedAccounts.map((link) => (
              <div
                key={link.id}
                className={`flex items-center justify-between p-3 bg-muted/50 rounded-lg border${focusAccountId && focusAccountId === link.google_customer_id ? ' ring-2 ring-blue-500/60' : ''}`}
              >
                <div>
                  <div className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    {link.google_customer_name || link.google_customer_id}
                    {focusAccountId && focusAccountId === link.google_customer_id && <small className="ml-2 text-muted-foreground">Selecionada</small>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">ID: {link.google_customer_id}</p>
                </div>
                <Button type="button" variant="ghost" size="icon" aria-label={`Desvincular ${link.google_customer_name || link.google_customer_id}`} onClick={() => handleUnlinkAccount(link.id)}>
                  <X className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center py-8 text-center text-sm text-muted-foreground">
            <AlertCircle className="h-8 w-8 mb-2 opacity-50" />
            Nenhuma conta Google Ads vinculada.
          </div>
        )}

        <div className="pt-4 border-t space-y-2">
          {credentialsMissing ? (
            <div className="rounded-lg border border-amber-300/70 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
              A agência ainda não configurou Google Ads no servidor.{' '}
              <Link to={GOOGLE_ADS_SETTINGS_PATH} className="underline font-medium">
                Configurações → Google Ads da agência
              </Link>
            </div>
          ) : null}
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Vincular nova conta</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loadingCustomers}
              onClick={fetchAvailableCustomers}
            >
              {loadingCustomers ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Atualizar lista'}
            </Button>
          </div>
          {searchable && <Input type="search" aria-label="Buscar conta Google Ads" placeholder="Buscar por nome ou ID" value={accountSearch} onChange={(event) => { setAccountSearch(event.target.value); setSelectedToLink(''); }} />}
          <div className="flex gap-2">
            <Select value={selectedToLink} onValueChange={setSelectedToLink} disabled={loadingCustomers || credentialsMissing || Boolean(query && !visibleAccounts.length)}>
              <SelectTrigger aria-label="Conta Google Ads para vincular" className="flex-1">
                <SelectValue
                  placeholder={
                    loadingCustomers
                      ? 'Carregando contas…'
                      : credentialsMissing
                        ? 'Configure a agência primeiro'
                        : availableToLink.length === 0
                          ? 'Nenhuma conta disponível'
                          : visibleAccounts.length === 0 ? 'Nenhuma conta encontrada' : 'Selecione a conta'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {visibleAccounts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.id})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" onClick={handleLinkAccount} disabled={!selectedToLink || loadingCustomers}>
              <Plus className="h-4 w-4 mr-1" />
              Vincular
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ClientGoogleAdsAccountsManager;
