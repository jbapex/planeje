import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link2, Plus, X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getMetaAdAccountsErrorMessage,
  isMetaNoAdAccountsError,
  isMetaNoAdAccountsResponse,
} from '@/lib/metaAdAccountsResponse';

const ClientMetaAccountsManager = ({ clientId, clientName, searchable = false, focusAccountId }) => {
  const { toast } = useToast();
  const [linkedAccounts, setLinkedAccounts] = useState([]);
  const [availableAccounts, setAvailableAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  /** true no arranque evita placeholder enganoso antes do primeiro fetch. */
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [selectedAccountToLink, setSelectedAccountToLink] = useState('');
  const [accountSearch, setAccountSearch] = useState('');
  const emptyMetaAvailableToastShownRef = useRef(false);
  /** true quando a API respondeu com 0 contas por configuração Meta (token/System User), não “já vinculadas”. */
  const [metaReturnedNoAccounts, setMetaReturnedNoAccounts] = useState(false);

  // Busca contas vinculadas ao cliente
  const fetchLinkedAccounts = useCallback(async () => {
    if (!clientId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('cliente_meta_accounts')
        .select('*')
        .eq('cliente_id', clientId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLinkedAccounts(data || []);
    } catch (err) {
      console.error('Erro ao buscar contas vinculadas:', err);
      toast({
        title: 'Erro ao carregar contas',
        description: err.message || 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [clientId, toast]);

  // Busca contas disponíveis do Meta
  const fetchAvailableAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    try {
      const { data, error } = await supabase.functions.invoke('meta-ads-api', {
        body: { action: 'get-ad-accounts' }
      });

      if (error) throw error;

      if (data?.error) {
        if (isMetaNoAdAccountsResponse(data)) {
          setMetaReturnedNoAccounts(true);
          setAvailableAccounts([]);
          if (!emptyMetaAvailableToastShownRef.current) {
            emptyMetaAvailableToastShownRef.current = true;
            console.warn(
              '[ClientMetaAccountsManager] Sem contas de anúncio no Meta:',
              getMetaAdAccountsErrorMessage(data)
            );
            toast({
              title: 'Nenhuma conta de anúncio no Meta',
              description:
                'Atribua contas ao System User no Business Manager ou confira META_BUSINESS_ID / token.',
              variant: 'default',
            });
          }
          return;
        }
        throw new Error(getMetaAdAccountsErrorMessage(data));
      }

      if (data?.adAccounts && Array.isArray(data.adAccounts)) {
        emptyMetaAvailableToastShownRef.current = false;
        setMetaReturnedNoAccounts(false);
        setAvailableAccounts(data.adAccounts);
      } else if (!data?.error) {
        setMetaReturnedNoAccounts(false);
        setAvailableAccounts([]);
      }
    } catch (err) {
      if (isMetaNoAdAccountsError(err)) {
        setMetaReturnedNoAccounts(true);
        setAvailableAccounts([]);
        if (!emptyMetaAvailableToastShownRef.current) {
          emptyMetaAvailableToastShownRef.current = true;
          console.warn('[ClientMetaAccountsManager] Sem contas de anúncio no Meta:', err.message);
          toast({
            title: 'Nenhuma conta de anúncio no Meta',
            description:
              'Atribua contas ao System User no Business Manager ou confira META_BUSINESS_ID / token.',
            variant: 'default',
          });
        }
        return;
      }
      setMetaReturnedNoAccounts(false);
      console.error('Erro ao buscar contas do Meta:', err);
      toast({
        title: 'Erro ao buscar contas',
        description: err.message || 'Não foi possível buscar contas do Meta. Verifique a configuração.',
        variant: 'destructive',
      });
    } finally {
      setLoadingAccounts(false);
    }
  }, [toast]);

  // Carrega dados iniciais
  useEffect(() => {
    if (clientId) {
      setLoadingAccounts(true);
      fetchLinkedAccounts();
      fetchAvailableAccounts();
    } else {
      setLoadingAccounts(false);
      setAvailableAccounts([]);
      setMetaReturnedNoAccounts(false);
    }
  }, [clientId, fetchLinkedAccounts, fetchAvailableAccounts]);

  // Vincula uma conta ao cliente
  const handleLinkAccount = async () => {
    if (!selectedAccountToLink || !clientId) return;

    const account = availableAccounts.find(acc => acc.id === selectedAccountToLink);
    if (!account) return;

    try {
      const { error } = await supabase
        .from('cliente_meta_accounts')
        .insert({
          cliente_id: clientId,
          meta_account_id: account.id,
          meta_account_name: account.name || account.id,
          is_active: true,
        });

      if (error) {
        // Se já existe, apenas reativa
        if (error.code === '23505') { // Unique violation
          const { error: updateError } = await supabase
            .from('cliente_meta_accounts')
            .update({ is_active: true })
            .eq('cliente_id', clientId)
            .eq('meta_account_id', account.id);

          if (updateError) throw updateError;
          
          toast({
            title: 'Conta reativada',
            description: `A conta "${account.name || account.id}" já estava vinculada e foi reativada.`,
            variant: 'default',
          });
        } else {
          throw error;
        }
      } else {
        toast({
          title: 'Conta vinculada',
          description: `A conta "${account.name || account.id}" foi vinculada com sucesso.`,
          variant: 'default',
        });
      }

      setSelectedAccountToLink('');
      fetchLinkedAccounts();
    } catch (err) {
      console.error('Erro ao vincular conta:', err);
      toast({
        title: 'Erro ao vincular conta',
        description: err.message || 'Erro desconhecido',
        variant: 'destructive',
      });
    }
  };

  // Remove/desativa uma vinculação
  const handleUnlinkAccount = async (linkId) => {
    if (!linkId) return;

    try {
      // Soft delete: apenas desativa
      const { error } = await supabase
        .from('cliente_meta_accounts')
        .update({ is_active: false })
        .eq('id', linkId);

      if (error) throw error;

      toast({
        title: 'Conta desvinculada',
        description: 'A conta foi desvinculada do cliente.',
        variant: 'default',
      });

      fetchLinkedAccounts();
    } catch (err) {
      console.error('Erro ao desvincular conta:', err);
      toast({
        title: 'Erro ao desvincular conta',
        description: err.message || 'Erro desconhecido',
        variant: 'destructive',
      });
    }
  };

  // Filtra contas já vinculadas das opções disponíveis
  const availableToLink = availableAccounts.filter(
    acc => !linkedAccounts.some(linked => linked.meta_account_id === acc.id)
  );
  const query = accountSearch.trim().toLocaleLowerCase('pt-BR');
  const visibleAccounts = query ? availableToLink.filter(({ id, name }) => `${name || ''} ${id}`.toLocaleLowerCase('pt-BR').includes(query)) : availableToLink;

  if (!clientId) {
    return (
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 dark:text-white">
            <Link2 className="h-5 w-5" />
            Contas de Anúncios Meta
          </CardTitle>
          <CardDescription className="dark:text-gray-400">
            Salve o cliente primeiro para vincular contas de anúncios.
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
          Contas de Anúncios Meta
        </CardTitle>
        <CardDescription className="dark:text-gray-400">
          Vincule contas de anúncios do Meta/Facebook a este cliente para facilitar a visualização dos dados.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Lista de contas vinculadas */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : linkedAccounts.length > 0 ? (
          <div className="space-y-2">
            <Label className="text-sm font-medium dark:text-gray-300">
              Contas Vinculadas ({linkedAccounts.length})
            </Label>
            <div className="space-y-2">
              {linkedAccounts.map((link) => (
                <div
                  key={link.id}
                  className={`flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border dark:border-gray-600${focusAccountId && focusAccountId === link.meta_account_id ? ' ring-2 ring-blue-500/60' : ''}`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span className="font-medium dark:text-white">
                        {link.meta_account_name || link.meta_account_id}
                        {focusAccountId && focusAccountId === link.meta_account_id && <small className="ml-2 text-muted-foreground">Selecionada</small>}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      ID: {link.meta_account_id}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Desvincular ${link.meta_account_name || link.meta_account_id}`}
                    onClick={() => handleUnlinkAccount(link.id)}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <AlertCircle className="h-8 w-8 text-gray-400 mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Nenhuma conta vinculada ainda.
            </p>
          </div>
        )}

        {/* Formulário para vincular nova conta */}
        <div className="pt-4 border-t dark:border-gray-700">
          <div className="flex items-center justify-between gap-2 mb-2">
            <Label className="text-sm font-medium dark:text-gray-300 block mb-0">
              Vincular Nova Conta
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 dark:border-gray-600"
              disabled={loadingAccounts}
              onClick={() => {
                setMetaReturnedNoAccounts(false);
                fetchAvailableAccounts();
              }}
            >
              {loadingAccounts ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Atualizar lista'
              )}
            </Button>
          </div>
          {searchable && <Input className="mb-2" type="search" aria-label="Buscar conta Meta" placeholder="Buscar por nome ou ID" value={accountSearch} onChange={(event) => { setAccountSearch(event.target.value); setSelectedAccountToLink(''); }} />}
          <div className="flex gap-2">
            <Select
              value={selectedAccountToLink}
              onValueChange={setSelectedAccountToLink}
              disabled={
                loadingAccounts ||
                availableAccounts.length === 0 ||
                visibleAccounts.length === 0
              }
            >
              <SelectTrigger aria-label="Conta Meta Ads para vincular" className="flex-1 dark:bg-gray-700 dark:text-white dark:border-gray-600">
                <SelectValue
                  placeholder={
                    loadingAccounts
                      ? 'Carregando contas...'
                      : availableAccounts.length === 0
                        ? metaReturnedNoAccounts
                          ? 'Meta não devolveu contas para este token'
                          : 'Nenhuma conta disponível'
                        : availableToLink.length === 0
                          ? 'Todas as contas já estão vinculadas a este cliente'
                          : visibleAccounts.length === 0 ? 'Nenhuma conta encontrada' : 'Selecione uma conta'
                  }
                />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-700 dark:text-white">
                {visibleAccounts.map(account => (
                  <SelectItem 
                    key={account.id} 
                    value={account.id}
                    className="dark:hover:bg-gray-600"
                  >
                    {account.name || account.id} ({account.id})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              onClick={handleLinkAccount}
              disabled={!selectedAccountToLink || loadingAccounts}
              className="dark:bg-blue-600 dark:hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Vincular
            </Button>
          </div>
          {availableToLink.length === 0 && availableAccounts.length > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Todas as contas disponíveis já estão vinculadas a este cliente.
            </p>
          )}
          {!loadingAccounts && availableAccounts.length === 0 && metaReturnedNoAccounts && (
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">
              A busca correu, mas o Meta não listou contas de anúncio. Confirme no Business Manager se o
              System User tem acesso às contas <code className="text-xs">act_…</code> e se os segredos da
              função (token, <code className="text-xs">META_BUSINESS_ID</code>) estão corretos.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ClientMetaAccountsManager;

