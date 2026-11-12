import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Phone, Search, UserPlus, Users } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/customSupabaseClient';
import {
  countAtendimentoDestinoByKind,
  filterAtendimentoDestinoOptions,
  formatContactPhoneLabel,
  loadAtendimentoDestinoList,
  NEW_CONV_DESTINO_GROUP,
  NEW_CONV_FILTER_ALL,
  NEW_CONV_FILTER_OPTIONS,
  openAtendimentoConversation,
  phoneToWhatsAppJid,
} from '@/lib/atendimentoNewConversation';

function channelLabel(ch) {
  return ch.name || ch.subdomain || ch.id?.slice(0, 8) || 'Canal';
}

export default function AtendimentoNewConversationDialog({
  open,
  onOpenChange,
  clienteId,
  userId,
  channels = [],
  defaultChannelId,
  onStarted,
}) {
  const [tab, setTab] = useState('lista');
  const [kindFilter, setKindFilter] = useState(NEW_CONV_FILTER_ALL);
  const [search, setSearch] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [channelId, setChannelId] = useState('');
  const [loadingList, setLoadingList] = useState(false);
  const [allItems, setAllItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const allowedConfigIds = useMemo(() => channels.map((ch) => ch.id).filter(Boolean), [channels]);
  const resolvedChannelId = channelId || defaultChannelId || channels[0]?.id || '';

  useEffect(() => {
    if (!open) {
      setTab('lista');
      setKindFilter(NEW_CONV_FILTER_ALL);
      setSearch('');
      setPhoneInput('');
      setNameInput('');
      setChannelId('');
      setAllItems([]);
      setSelected(null);
      setError('');
      return;
    }
    setChannelId(defaultChannelId && defaultChannelId !== 'all' ? defaultChannelId : channels[0]?.id || '');
  }, [open, defaultChannelId, channels]);

  useEffect(() => {
    if (!open || !clienteId || tab !== 'lista') return undefined;

    let cancelled = false;
    setLoadingList(true);
    loadAtendimentoDestinoList(supabase, clienteId, {
      allowedWhatsappConfigIds: allowedConfigIds,
    })
      .then((rows) => {
        if (!cancelled) setAllItems(rows);
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, clienteId, tab, allowedConfigIds.join(',')]);

  const kindCounts = useMemo(() => countAtendimentoDestinoByKind(allItems), [allItems]);

  const filteredItems = useMemo(
    () => filterAtendimentoDestinoOptions(allItems, { query: search, kindFilter }),
    [allItems, search, kindFilter],
  );

  const phonePreview = useMemo(() => formatContactPhoneLabel(phoneInput), [phoneInput]);
  const phoneJid = useMemo(() => phoneToWhatsAppJid(phoneInput), [phoneInput]);

  const resetAndClose = () => onOpenChange(false);

  const handlePickItem = (item) => {
    setSelected(item);
    setError('');
  };

  const handleKindFilterChange = (next) => {
    setKindFilter(next);
    setSelected(null);
  };

  const handleStart = async () => {
    if (!clienteId || !userId) {
      setError('Usuário ou cliente não identificado.');
      return;
    }
    if (!resolvedChannelId) {
      setError('Você não tem permissão para enviar em nenhum canal WhatsApp.');
      return;
    }

    let jid;
    let displayName;
    let profilePicUrl;

    if (tab === 'lista') {
      if (!selected?.jid) {
        setError('Selecione um contato ou grupo da lista.');
        return;
      }
      jid = selected.jid;
      displayName = selected.name;
      profilePicUrl = selected.profilePicUrl;
    } else {
      jid = phoneJid;
      if (!jid) {
        setError('Digite um número válido com DDD (ex.: 11 99999-9999).');
        return;
      }
      displayName = nameInput.trim() || phonePreview;
      profilePicUrl = null;
    }

    setSubmitting(true);
    setError('');
    try {
      const conv = await openAtendimentoConversation({
        supabase,
        clienteId,
        userId,
        phoneOrJid: jid,
        displayName,
        whatsappConfigId: resolvedChannelId,
        profilePicUrl,
      });
      onStarted?.(conv);
      resetAndClose();
    } catch (err) {
      setError(err?.message || 'Não foi possível abrir a conversa.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Nova conversa</DialogTitle>
        </DialogHeader>

        {channels.length === 0 ? (
          <p className="text-sm text-muted-foreground rounded-md border border-dashed p-3">
            Nenhum canal disponível para envio com seu usuário. Peça acesso ao administrador.
          </p>
        ) : channels.length === 1 ? (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Canal WhatsApp</Label>
            <p className="text-sm font-medium">{channelLabel(channels[0])}</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Canal WhatsApp</Label>
            <Select value={resolvedChannelId} onValueChange={setChannelId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Selecione o canal" />
              </SelectTrigger>
              <SelectContent>
                {channels.map((ch) => (
                  <SelectItem key={ch.id} value={ch.id}>
                    {channelLabel(ch)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <Tabs value={tab} onValueChange={setTab} className="flex-1 min-h-0 flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="lista">Lista</TabsTrigger>
            <TabsTrigger value="numero">Número</TabsTrigger>
          </TabsList>

          <TabsContent value="lista" className="mt-3 space-y-3 flex-1 min-h-0 flex flex-col">
            <div className="wa-audience-filter">
              {NEW_CONV_FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleKindFilterChange(opt.value)}
                  className={cn('wa-audience-filter-btn', kindFilter === opt.value && 'is-active')}
                >
                  {opt.label}
                  <span className="wa-audience-filter-count">{kindCounts[opt.value] ?? 0}</span>
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filtrar por nome ou telefone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <p className="wa-text-caption text-muted-foreground">
              Contatos e grupos que já conversaram com a operação. Para número novo, use a aba Número.
            </p>

            <ul className="flex-1 min-h-[200px] max-h-[260px] overflow-y-auto border rounded-lg divide-y">
              {loadingList ? (
                <li className="p-6 flex justify-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </li>
              ) : allItems.length === 0 ? (
                <li className="p-4 wa-text-caption text-center">
                  Nenhum contato ou grupo ainda. Use a aba Número para um WhatsApp novo.
                </li>
              ) : filteredItems.length === 0 ? (
                <li className="p-4 wa-text-caption text-center">Nenhum resultado para o filtro.</li>
              ) : (
                filteredItems.map((item) => {
                  const isGroup = item.kind === NEW_CONV_DESTINO_GROUP;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/60 transition-colors',
                          selected?.id === item.id && 'bg-[var(--wa-brand-light)]',
                        )}
                        onClick={() => handlePickItem(item)}
                      >
                        <Avatar className="h-9 w-9 shrink-0">
                          <AvatarImage src={item.profilePicUrl || undefined} alt="" />
                          <AvatarFallback className="text-xs bg-[#dfe5e7]">
                            {isGroup ? (
                              <Users className="h-4 w-4 text-[#54656f]" />
                            ) : (
                              (item.name || '?').charAt(0).toUpperCase()
                            )}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="wa-list-name truncate flex items-center gap-1.5">
                            {isGroup && <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                            {item.name}
                          </p>
                          <p className="wa-list-preview truncate">
                            {isGroup
                              ? 'Grupo WhatsApp'
                              : formatContactPhoneLabel(item.phone) || item.jid.replace(/@.*$/, '')}
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </TabsContent>

          <TabsContent value="numero" className="mt-3 space-y-3">
            <p className="wa-text-caption text-muted-foreground">
              Para falar com alguém que ainda não está na lista (somente conversa individual).
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="wa-new-phone">WhatsApp (com DDD)</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="wa-new-phone"
                  placeholder="11 99999-9999"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  className="pl-9"
                />
              </div>
              {phonePreview && <p className="text-xs text-muted-foreground">Será enviado para {phonePreview}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wa-new-name">Nome (opcional)</Label>
              <Input
                id="wa-new-name"
                placeholder="Como aparece no chat"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
              />
            </div>
          </TabsContent>
        </Tabs>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={resetAndClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleStart}
            disabled={submitting || !resolvedChannelId || channels.length === 0}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserPlus className="h-4 w-4 mr-2" />}
            Iniciar conversa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
