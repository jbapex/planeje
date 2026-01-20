import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Users } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import ClientUserManager from '@/components/admin/ClientUserManager';

const ClientUsersSuperAdmin = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  const [showUserManager, setShowUserManager] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('clientes')
      .select('id, empresa')
      .order('empresa', { ascending: true });

    if (error) {
      toast({
        title: 'Erro ao buscar clientes',
        description: error.message,
        variant: 'destructive',
      });
      setClients([]);
    } else {
      setClients(data || []);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const filteredClients = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return clients;
    return clients.filter((c) => (c.empresa || '').toLowerCase().includes(term));
  }, [clients, searchTerm]);

  const handleOpenUserManager = (client) => {
    setSelectedClient(client);
    setShowUserManager(true);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold dark:text-white">Usuários de Cliente</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie logins vinculados a clientes (apenas perfis com role = cliente).
          </p>
        </div>
        <div className="relative w-full md:w-[360px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar cliente por nome..."
            className="pl-9"
          />
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={2} className="py-8 text-center text-muted-foreground">
                  Carregando clientes...
                </TableCell>
              </TableRow>
            ) : filteredClients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} className="py-10 text-center text-muted-foreground">
                  Nenhum cliente encontrado.
                </TableCell>
              </TableRow>
            ) : (
              filteredClients.map((client) => (
                <TableRow key={client.id} className="dark:border-gray-700">
                  <TableCell className="font-medium dark:text-white">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span>{client.empresa}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" onClick={() => handleOpenUserManager(client)}>
                      Gerenciar logins
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
          onClose={() => {
            setShowUserManager(false);
            setSelectedClient(null);
          }}
        />
      )}
    </div>
  );
};

export default ClientUsersSuperAdmin;

