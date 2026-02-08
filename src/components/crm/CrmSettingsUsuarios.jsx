import React, { useState, useEffect, useMemo } from 'react';
import { useClienteCrmSettings } from '@/contexts/ClienteCrmSettingsContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ClientUserManager from '@/components/admin/ClientUserManager';
import { Loader2, Plus, Trash2, Search, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

const PERFIL_OPTIONS = [
  { value: 'todos', label: 'Todos' },
  { value: 'administrador', label: 'Administrador' },
  { value: 'membro', label: 'Membro' },
];

function getInitials(fullName) {
  if (!fullName || typeof fullName !== 'string') return '?';
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function getShortName(fullName) {
  if (!fullName || typeof fullName !== 'string') return '';
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase() : '';
}

function getRoleBadges(user, index) {
  const badges = [];
  // Primeiro usuário pode ser considerado "Administrador da conta" (exemplo do layout)
  if (index === 0) {
    badges.push({ label: 'Administrador da conta', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' });
  }
  badges.push({ label: 'Membro da equipe', className: 'bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300' });
  return badges;
}

export default function CrmSettingsUsuarios() {
  const { profile } = useAuth();
  const { settings, loading: settingsLoading, saving, updateSettings, fetchSettings } = useClienteCrmSettings();
  const { toast } = useToast();
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [perfilFilter, setPerfilFilter] = useState('todos');
  const [sellers, setSellers] = useState([]);
  const [showUserManager, setShowUserManager] = useState(false);
  const [clientEmpresa, setClientEmpresa] = useState('');

  const effectiveClienteId = profile?.cliente_id;

  useEffect(() => {
    if (!effectiveClienteId) return;
    setMembersLoading(true);
    supabase
      .from('profiles')
      .select('id, full_name, avatar_url, allowed_pages')
      .eq('cliente_id', effectiveClienteId)
      .eq('role', 'cliente')
      .order('full_name')
      .then(({ data, error }) => {
        setMembersLoading(false);
        if (!error) setMembers(data || []);
      });
  }, [effectiveClienteId]);

  const refetchMembers = () => {
    if (!effectiveClienteId) return;
    setMembersLoading(true);
    supabase
      .from('profiles')
      .select('id, full_name, avatar_url, allowed_pages')
      .eq('cliente_id', effectiveClienteId)
      .eq('role', 'cliente')
      .order('full_name')
      .then(({ data, error }) => {
        setMembersLoading(false);
        if (!error) setMembers(data || []);
      });
  };

  useEffect(() => {
    if (settings) {
      setSellers(Array.isArray(settings.sellers) ? [...settings.sellers] : []);
    }
  }, [settings]);

  useEffect(() => {
    if (!effectiveClienteId) return;
    let cancelled = false;
    supabase
      .from('clientes')
      .select('empresa')
      .eq('id', effectiveClienteId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setClientEmpresa(data.empresa || '');
      });
    return () => { cancelled = true; };
  }, [effectiveClienteId]);

  const filteredMembers = useMemo(() => {
    let list = [...members];
    const q = (search || '').trim().toLowerCase();
    if (q) {
      list = list.filter((m) => (m.full_name || '').toLowerCase().includes(q) || getShortName(m.full_name).toLowerCase().includes(q));
    }
    if (perfilFilter === 'administrador') {
      list = list.filter((_, i) => i === 0);
    } else if (perfilFilter === 'membro') {
      list = list.filter((_, i) => i !== 0);
    }
    return list;
  }, [members, search, perfilFilter]);

  const handleAddSeller = () => setSellers((p) => [...p, '']);
  const handleRemoveSeller = (i) => setSellers((p) => p.filter((_, idx) => idx !== i));
  const handleSellerChange = (i, value) => setSellers((p) => p.map((s, idx) => (idx === i ? value : s)));

  const handleSaveSellers = async () => {
    const validSellers = sellers.map((s) => (s || '').trim()).filter(Boolean);
    const ok = await updateSettings({ ...settings, sellers: validSellers }, true);
    if (ok) await fetchSettings();
  };

  if (settingsLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const cardClass = 'dark:bg-gray-800/50 dark:border-gray-700/50 border border-gray-200/50 shadow-sm rounded-xl';
  const headerClass = 'p-3 sm:p-4';
  const titleClass = 'text-sm font-semibold dark:text-white';
  const descClass = 'text-xs text-muted-foreground dark:text-gray-400 mt-0.5';

  return (
    <div className="flex flex-col gap-6 w-full min-w-0 pb-10">
      {/* Seção Usuários – estilo exemplo */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Usuários
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {members.length} {members.length === 1 ? 'membro na equipe' : 'membros na equipe'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {profile?.role === 'superadmin' && (
              <Button
                type="button"
                onClick={() => setShowUserManager(true)}
                className="bg-violet-600 hover:bg-violet-700 text-white rounded-lg"
              >
                <Plus className="h-4 w-4 mr-2" />
                Novo
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-full shrink-0"
              onClick={refetchMembers}
              disabled={membersLoading}
              title="Atualizar lista"
            >
              <RefreshCw className={cn('h-4 w-4', membersLoading && 'animate-spin')} />
            </Button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Pesquisar"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 rounded-lg bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Perfil:</span>
            <Select value={perfilFilter} onValueChange={setPerfilFilter}>
              <SelectTrigger className="w-[140px] h-10 rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERFIL_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200/80 dark:border-gray-700/80 bg-white dark:bg-gray-900/50 overflow-hidden">
          {membersLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Carregando usuários...</span>
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              {members.length === 0 ? 'Nenhum membro vinculado a esta conta.' : 'Nenhum resultado para a pesquisa.'}
            </div>
          ) : (
            <ul className="divide-y divide-gray-200/80 dark:divide-gray-700/80">
              {filteredMembers.map((m, indexInFiltered) => {
                const indexInFull = members.findIndex((x) => x.id === m.id);
                const badges = getRoleBadges(m, indexInFull);
                return (
                  <li
                    key={m.id}
                    className="flex items-center gap-4 px-4 py-4 sm:px-5 sm:py-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <Avatar className="h-12 w-12 rounded-full border border-gray-200/80 dark:border-gray-600 flex-shrink-0 bg-slate-100 dark:bg-slate-700">
                      <AvatarImage src={m.avatar_url} alt={m.full_name} />
                      <AvatarFallback className="text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-200 dark:bg-slate-600">
                        {getInitials(m.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {m.full_name || 'Sem nome'}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">
                        {getShortName(m.full_name) || '—'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 justify-end">
                      {badges.map((b) => (
                        <span
                          key={b.label}
                          className={cn(
                            'inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium',
                            b.className
                          )}
                        >
                          {b.label}
                        </span>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Container Vendedores */}
      <Card className={cardClass}>
        <CardHeader className={headerClass}>
          <CardTitle className={titleClass}>Vendedores</CardTitle>
          <CardDescription className={descClass}>
            Lista de vendedores para associar aos leads.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-3 sm:p-4 pt-0">
          {sellers.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                placeholder="Nome do vendedor"
                value={s}
                onChange={(e) => handleSellerChange(i, e.target.value)}
                className="flex-1"
              />
              <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveSeller(i)} title="Remover">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={handleAddSeller}>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar vendedor
          </Button>
        </CardContent>
      </Card>

      <Button onClick={handleSaveSellers} disabled={saving} className="w-full sm:w-auto">
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Salvando...
          </>
        ) : (
          'Salvar vendedores'
        )}
      </Button>

      {showUserManager && effectiveClienteId && profile?.role === 'superadmin' && (
        <ClientUserManager
          clientId={effectiveClienteId}
          clientName={clientEmpresa || 'Sua empresa'}
          onClose={() => {
            setShowUserManager(false);
            refetchMembers();
          }}
        />
      )}
    </div>
  );
}
