import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, UserCheck, UserX, Users } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import ClientUserManager from '@/components/admin/ClientUserManager';
import SuperAdminPageHeader from '@/components/superadmin/SuperAdminPageHeader';
import { cn } from '@/lib/utils';

const LOGIN_FILTER = {
  all: 'all',
  with_login: 'with_login',
  without_login: 'without_login',
};

function aggregateLoginCounts(profiles) {
  const counts = {};
  const namesByClient = {};
  for (const profile of profiles || []) {
    const clientId = profile.cliente_id;
    if (!clientId) continue;
    counts[clientId] = (counts[clientId] || 0) + 1;
    if (!namesByClient[clientId]) namesByClient[clientId] = [];
    if (profile.full_name) namesByClient[clientId].push(profile.full_name);
  }
  return { counts, namesByClient };
}

const ClientUsersSuperAdmin = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState([]);
  const [loginFilter, setLoginFilter] = useState(LOGIN_FILTER.all);
  const [searchTerm, setSearchTerm] = useState('');

  const [showUserManager, setShowUserManager] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);

  const fetchClients = useCallback(async () => {
    setLoading(true);

    const [clientsRes, profilesRes] = await Promise.all([
      supabase.from('clientes').select('id, empresa, etapa').order('empresa', { ascending: true }),
      supabase
        .from('profiles')
        .select('id, cliente_id, full_name')
        .eq('role', 'cliente')
        .not('cliente_id', 'is', null),
    ]);

    if (clientsRes.error) {
      toast({
        title: 'Erro ao buscar clientes',
        description: clientsRes.error.message,
        variant: 'destructive',
      });
      setClients([]);
      setLoading(false);
      return;
    }

    if (profilesRes.error) {
      toast({
        title: 'Erro ao buscar logins',
        description: profilesRes.error.message,
        variant: 'destructive',
      });
    }

    const { counts, namesByClient } = aggregateLoginCounts(profilesRes.data);

    setClients(
      (clientsRes.data || []).map((client) => ({
        ...client,
        loginCount: counts[client.id] || 0,
        loginNames: namesByClient[client.id] || [],
      }))
    );
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const stats = useMemo(() => {
    const total = clients.length;
    const withLogin = clients.filter((c) => c.loginCount > 0).length;
    const withoutLogin = total - withLogin;
    const totalLogins = clients.reduce((sum, c) => sum + c.loginCount, 0);
    return { total, withLogin, withoutLogin, totalLogins };
  }, [clients]);

  const filteredClients = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return clients.filter((client) => {
      if (loginFilter === LOGIN_FILTER.with_login && client.loginCount === 0) return false;
      if (loginFilter === LOGIN_FILTER.without_login && client.loginCount > 0) return false;
      if (!term) return true;
      const inName = (client.empresa || '').toLowerCase().includes(term);
      const inLogins = (client.loginNames || []).some((n) => n.toLowerCase().includes(term));
      return inName || inLogins;
    });
  }, [clients, searchTerm, loginFilter]);

  const handleOpenUserManager = (client) => {
    setSelectedClient(client);
    setShowUserManager(true);
  };

  const handleCloseUserManager = () => {
    setShowUserManager(false);
    setSelectedClient(null);
    fetchClients();
  };

  return (
    <div className="planeje-super-admin-page space-y-6">
      <SuperAdminPageHeader
        sectionLabel="Equipe & acesso"
        title="Usuários de cliente"
        description="Gerencie logins e, em «Gerenciar logins» → aba Meta WhatsApp, o token Meta e conversões por canal de cada cliente."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border bg-card px-4 py-3 dark:border-gray-700">
          <p className="text-2xl font-bold tabular-nums">{stats.total}</p>
          <p className="text-xs text-muted-foreground">Clientes</p>
        </div>
        <div className="rounded-xl border bg-card px-4 py-3 dark:border-gray-700">
          <p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{stats.withLogin}</p>
          <p className="text-xs text-muted-foreground">Com login</p>
        </div>
        <div className="rounded-xl border bg-card px-4 py-3 dark:border-gray-700">
          <p className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">{stats.withoutLogin}</p>
          <p className="text-xs text-muted-foreground">Sem login</p>
        </div>
        <div className="rounded-xl border bg-card px-4 py-3 dark:border-gray-700">
          <p className="text-2xl font-bold tabular-nums">{stats.totalLogins}</p>
          <p className="text-xs text-muted-foreground">Logins no total</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por cliente ou nome do login..."
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            { id: LOGIN_FILTER.all, label: 'Todos', count: stats.total },
            { id: LOGIN_FILTER.with_login, label: 'Com login', count: stats.withLogin },
            { id: LOGIN_FILTER.without_login, label: 'Sem login', count: stats.withoutLogin },
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setLoginFilter(opt.id)}
              className={cn(
                'planeje-super-admin-module-chip',
                loginFilter === opt.id && 'is-on'
              )}
            >
              {opt.label} ({opt.count})
            </button>
          ))}
        </div>

        <Select value={loginFilter} onValueChange={setLoginFilter}>
          <SelectTrigger className="w-full lg:w-[200px] lg:hidden">
            <SelectValue placeholder="Filtrar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={LOGIN_FILTER.all}>Todos ({stats.total})</SelectItem>
            <SelectItem value={LOGIN_FILTER.with_login}>Com login ({stats.withLogin})</SelectItem>
            <SelectItem value={LOGIN_FILTER.without_login}>Sem login ({stats.withoutLogin})</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="p-0 overflow-hidden dark:border-gray-700">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead className="w-[100px]">Logins</TableHead>
              <TableHead className="hidden md:table-cell">Usuários vinculados</TableHead>
              <TableHead className="w-[120px]">Status</TableHead>
              <TableHead className="text-right w-[160px]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Carregando clientes...
                </TableCell>
              </TableRow>
            ) : filteredClients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  {loginFilter === LOGIN_FILTER.without_login
                    ? 'Nenhum cliente sem login encontrado.'
                    : loginFilter === LOGIN_FILTER.with_login
                      ? 'Nenhum cliente com login encontrado.'
                      : 'Nenhum cliente encontrado.'}
                </TableCell>
              </TableRow>
            ) : (
              filteredClients.map((client) => (
                <TableRow key={client.id} className="dark:border-gray-700">
                  <TableCell className="font-medium dark:text-white">
                    <div className="flex items-center gap-2 min-w-0">
                      <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate">{client.empresa}</span>
                    </div>
                    {client.etapa ? (
                      <p className="text-xs text-muted-foreground mt-0.5 pl-6 capitalize">{client.etapa}</p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <span className="font-semibold tabular-nums">{client.loginCount}</span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell max-w-[280px]">
                    {client.loginCount === 0 ? (
                      <span className="text-sm text-muted-foreground">—</span>
                    ) : (
                      <span className="text-sm text-muted-foreground truncate block" title={client.loginNames.join(', ')}>
                        {client.loginNames.join(', ')}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {client.loginCount === 0 ? (
                      <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-400 gap-1">
                        <UserX className="h-3 w-3" />
                        Sem login
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-emerald-500/50 text-emerald-700 dark:text-emerald-400 gap-1">
                        <UserCheck className="h-3 w-3" />
                        {client.loginCount === 1 ? '1 login' : `${client.loginCount} logins`}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant={client.loginCount === 0 ? 'default' : 'outline'}
                      onClick={() => handleOpenUserManager(client)}
                    >
                      {client.loginCount === 0 ? 'Criar login' : 'Gerenciar logins'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {showUserManager && selectedClient && (
        <ClientUserManager
          clientId={selectedClient.id}
          clientName={selectedClient.empresa}
          onClose={handleCloseUserManager}
        />
      )}
    </div>
  );
};

export default ClientUsersSuperAdmin;
