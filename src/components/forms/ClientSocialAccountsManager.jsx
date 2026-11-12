import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Facebook, Instagram, Link2, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import {
  displaySocialAccount,
  fetchClienteSocialAccounts,
  filterAvailableToLink,
  platformLabel,
} from '@/lib/clienteSocialAccounts';

async function loadMetaCatalog() {
  const [pagesRes, igRes] = await Promise.all([
    supabase.functions.invoke('meta-ads-api', { body: { action: 'get-pages' } }),
    supabase.functions.invoke('meta-ads-api', { body: { action: 'get-instagram-accounts' } }),
  ]);
  if (pagesRes.error) throw pagesRes.error;
  if (pagesRes.data?.error) throw new Error(pagesRes.data.error.message || 'Erro ao listar páginas');
  if (igRes.error) throw igRes.error;
  if (igRes.data?.error) throw new Error(igRes.data.error.message || 'Erro ao listar Instagram');

  const pages = (pagesRes.data?.pages || []).map((page) => ({
    id: String(page.id),
    name: page.name || page.id,
    category: page.category || '',
    hasInstagram: Boolean(page.instagram_business_account || page.hasInstagram),
  }));

  const instagram = (igRes.data?.instagramAccounts || []).map((account) => ({
    id: String(account.id),
    name: account.username || account.name || account.id,
    username: account.username || '',
    page_id: account.page_id ? String(account.page_id) : null,
    page_name: account.page_name || '',
    profile_picture_url: account.profile_picture_url || null,
  }));

  return { pages, instagram };
}

const ClientSocialAccountsManager = ({ clientId, clientName }) => {
  const { toast } = useToast();
  const [linked, setLinked] = useState([]);
  const [pages, setPages] = useState([]);
  const [instagram, setInstagram] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [selectedPage, setSelectedPage] = useState('');
  const [selectedIg, setSelectedIg] = useState('');
  const [busy, setBusy] = useState(false);

  const loadLinked = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const rows = await fetchClienteSocialAccounts(supabase, clientId, { activeOnly: true });
      setLinked(rows);
    } catch (err) {
      toast({
        title: 'Erro ao carregar redes',
        description: err.message || 'Não foi possível carregar os vínculos.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [clientId, toast]);

  const loadCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    try {
      const catalog = await loadMetaCatalog();
      setPages(catalog.pages);
      setInstagram(catalog.instagram);
    } catch (err) {
      setPages([]);
      setInstagram([]);
      toast({
        title: 'Catálogo Meta indisponível',
        description: err.message || 'Confira o token em Configurações → Meta da agência.',
        variant: 'destructive',
      });
    } finally {
      setLoadingCatalog(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!clientId) return;
    void loadLinked();
    void loadCatalog();
  }, [clientId, loadLinked, loadCatalog]);

  const pagesToLink = useMemo(
    () => filterAvailableToLink(pages, linked, 'facebook_page'),
    [pages, linked]
  );
  const igToLink = useMemo(
    () => filterAvailableToLink(instagram, linked, 'instagram'),
    [instagram, linked]
  );

  const linkAccount = async (platform, selectedId, catalog) => {
    if (!clientId || !selectedId) return;
    const item = catalog.find((row) => String(row.id) === String(selectedId));
    if (!item) return;
    setBusy(true);
    try {
      const payload = {
        cliente_id: clientId,
        platform,
        meta_id: String(item.id),
        display_name: item.name || item.username || item.id,
        username: item.username || null,
        page_id: item.page_id || (platform === 'facebook_page' ? String(item.id) : null),
        profile_picture_url: item.profile_picture_url || null,
        is_active: true,
      };
      const { error } = await supabase.from('cliente_social_accounts').insert(payload);
      if (error) {
        if (error.code === '23505') {
          const { error: updateError } = await supabase
            .from('cliente_social_accounts')
            .update({
              is_active: true,
              display_name: payload.display_name,
              username: payload.username,
              page_id: payload.page_id,
              profile_picture_url: payload.profile_picture_url,
            })
            .eq('cliente_id', clientId)
            .eq('platform', platform)
            .eq('meta_id', payload.meta_id);
          if (updateError) throw updateError;
          toast({
            title: 'Vínculo reativado',
            description: `${platformLabel(platform)} ${displaySocialAccount(payload)} já estava ligado.`,
          });
        } else {
          throw error;
        }
      } else {
        toast({
          title: 'Rede vinculada',
          description: `${platformLabel(platform)} ${displaySocialAccount(payload)} ligado a ${clientName || 'este cliente'}.`,
        });
      }
      if (platform === 'facebook_page') setSelectedPage('');
      else setSelectedIg('');
      await loadLinked();
    } catch (err) {
      toast({
        title: 'Não foi possível vincular',
        description: err.message || 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const unlinkAccount = async (rowId) => {
    if (!rowId) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from('cliente_social_accounts')
        .update({ is_active: false })
        .eq('id', rowId);
      if (error) throw error;
      toast({ title: 'Rede desvinculada', description: 'O destino foi removido deste cliente.' });
      await loadLinked();
    } catch (err) {
      toast({
        title: 'Erro ao desvincular',
        description: err.message || 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  if (!clientId) {
    return (
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 dark:text-white">
            <Link2 className="h-5 w-5" />
            Página e Instagram
          </CardTitle>
          <CardDescription className="dark:text-gray-400">
            Salve o cliente primeiro para vincular a página e o Instagram.
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
          Página e Instagram
        </CardTitle>
        <CardDescription className="dark:text-gray-400">
          Ligue a página do Facebook e o Instagram Business deste cliente (mesmo token da Meta da agência).
          Serve para ver feed, conferir postagem e publicar pela tarefa.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : linked.length > 0 ? (
          <div className="space-y-2">
            <Label className="text-sm dark:text-gray-300">Vinculados ({linked.length})</Label>
            <div className="space-y-2">
              {linked.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3 dark:border-gray-600 dark:bg-gray-700/60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                      {row.platform === 'instagram' ? (
                        <Instagram className="h-4 w-4 text-pink-500" />
                      ) : (
                        <Facebook className="h-4 w-4 text-blue-500" />
                      )}
                      <span className="truncate font-medium dark:text-white">
                        {displaySocialAccount(row)}
                      </span>
                      <Badge variant="secondary" className="shrink-0 dark:bg-gray-600">
                        {platformLabel(row.platform)}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
                      ID: {row.meta_id}
                      {row.page_id && row.platform === 'instagram' ? ` · Página ${row.page_id}` : ''}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={busy}
                    onClick={() => unlinkAccount(row.id)}
                    aria-label="Desvincular"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Nenhuma página ou Instagram ligado ainda.
          </p>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="dark:text-gray-300">Adicionar página Facebook</Label>
            <div className="flex gap-2">
              <Select
                value={selectedPage}
                onValueChange={setSelectedPage}
                disabled={loadingCatalog || busy || pagesToLink.length === 0}
              >
                <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600">
                  <SelectValue
                    placeholder={
                      loadingCatalog
                        ? 'Carregando…'
                        : pagesToLink.length
                          ? 'Escolha a página'
                          : 'Nenhuma página disponível'
                    }
                  />
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-700 dark:text-white">
                  {pagesToLink.map((page) => (
                    <SelectItem key={page.id} value={page.id}>
                      {page.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                disabled={!selectedPage || busy}
                onClick={() => linkAccount('facebook_page', selectedPage, pages)}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Ligar'}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="dark:text-gray-300">Adicionar Instagram</Label>
            <div className="flex gap-2">
              <Select
                value={selectedIg}
                onValueChange={setSelectedIg}
                disabled={loadingCatalog || busy || igToLink.length === 0}
              >
                <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600">
                  <SelectValue
                    placeholder={
                      loadingCatalog
                        ? 'Carregando…'
                        : igToLink.length
                          ? 'Escolha a conta'
                          : 'Nenhuma conta disponível'
                    }
                  />
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-700 dark:text-white">
                  {igToLink.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      @{String(account.username || account.name).replace(/^@/, '')}
                      {account.page_name ? ` · ${account.page_name}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                disabled={!selectedIg || busy}
                onClick={() => linkAccount('instagram', selectedIg, instagram)}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Ligar'}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ClientSocialAccountsManager;
