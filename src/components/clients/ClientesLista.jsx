import React, { useMemo, useState } from 'react';
    import { motion, AnimatePresence } from 'framer-motion';
    import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
    import { Checkbox } from "@/components/ui/checkbox";
    import { Button } from "@/components/ui/button";
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
    import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
    import { Trash2, Plus, X, Edit, MoreHorizontal, DollarSign, Calendar, Tag, Building, FileText, MessageSquare, Copy, ExternalLink } from 'lucide-react';
    import { format, differenceInDays, parseISO } from 'date-fns';
    import { useToast } from '@/components/ui/use-toast';
    import { supabase } from '@/lib/customSupabaseClient';
    import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
    import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
    import { Badge } from "@/components/ui/badge";
    import { Card, CardContent, CardHeader } from "@/components/ui/card";
    import { useAuth } from '@/contexts/SupabaseAuthContext';

    const ETAPAS = [
      { value: 'prospect', label: 'Prospect', color: 'bg-gray-400 text-white' },
      { value: 'qualification', label: 'Qualificação', color: 'bg-blue-500 text-white' },
      { value: 'proposal', label: 'Proposta', color: 'bg-yellow-500 text-black' },
      { value: 'negotiation', label: 'Negociação', color: 'bg-orange-500 text-white' },
      { value: 'closed', label: 'Fechado', color: 'bg-green-500 text-white' },
      { value: 'lost', label: 'Perdido', color: 'bg-red-500 text-white' }
    ];

    const ETIQUETAS = [
      { value: 'vip', label: 'VIP', color: 'bg-purple-500 text-white' },
      { value: 'inativo', label: 'Inativo', color: 'bg-gray-600 text-white' },
      { value: 'novo', label: 'Novo', color: 'bg-cyan-500 text-white' },
    ];

    const VencimentoCell = ({ value }) => {
      let display;
      let colorClass = 'text-gray-600 dark:text-gray-400';
      if (value) {
        try {
          const date = parseISO(value);
          const daysDiff = differenceInDays(date, new Date());
          if (daysDiff < 0) {
            display = `Atrasado ${Math.abs(daysDiff)}d`;
            colorClass = 'text-red-500 font-medium';
          } else if (daysDiff === 0) {
            display = 'Vence Hoje';
            colorClass = 'text-orange-500 font-medium';
          } else if (daysDiff <= 7) {
            display = `Vence em ${daysDiff}d`;
            colorClass = 'text-yellow-600';
          } else {
            display = format(date, 'dd/MM/yyyy');
          }
        } catch (e) {
          display = 'Data inválida'
        }
      } else {
        display = '-';
      }

      return <span className={colorClass}>{display}</span>;
    };

    const ClientesLista = ({ clients, users, onUpdateField, onAddClient, onEdit, onOpenDocument, selectedClients, setSelectedClients, fetchClients, userRole }) => {
      const { toast } = useToast();
      const { canViewField } = useAuth();
      
      const usersById = useMemo(() => {
        return users.reduce((acc, user) => {
          acc[user.id] = user;
          return acc;
        }, {});
      }, [users]);

      const handleCopyChatLink = (clientId) => {
        const url = `${window.location.origin}/#/chat/${clientId}`;
        navigator.clipboard.writeText(url);
        toast({
            title: "Link do Chat Copiado!",
            description: "O link para o assistente de IA do cliente foi copiado.",
        });
      };

      const handleViewChatLink = (clientId) => {
        const url = `${window.location.origin}/#/chat/${clientId}`;
        window.open(url, '_blank', 'noopener,noreferrer');
      };
      
      const handleSelectAll = (checked) => {
        setSelectedClients(checked ? clients.map(c => c.id) : []);
      };

      const handleSelectRow = (id, checked) => {
        setSelectedClients(prev => checked ? [...prev, id] : prev.filter(cid => cid !== id));
      };

      const handleBulkDelete = async () => {
        const { error } = await supabase.from('clientes').delete().in('id', selectedClients);
        if (error) {
          toast({ title: "Erro ao excluir clientes", description: error.message, variant: "destructive" });
        } else {
          toast({ title: "Clientes excluídos com sucesso!" });
          setSelectedClients([]);
          fetchClients();
        }
      };
      
      const handleDeleteClient = async (clientId) => {
        const { error } = await supabase.from('clientes').delete().eq('id', clientId);
        if (error) {
          toast({ title: "Erro ao excluir cliente", description: error.message, variant: "destructive" });
        } else {
          toast({ title: "Cliente excluído com sucesso!" });
          fetchClients();
        }
      };

      const EtapaSelector = ({ value, onSelect }) => {
        const etapaInfo = ETAPAS.find(e => e.value === value) || {label: 'N/A', color: 'bg-gray-200'};
        return (
          <Select value={value} onValueChange={onSelect} disabled={userRole === 'colaborador'}>
            <SelectTrigger className="w-full border-none bg-transparent p-0 h-auto focus:ring-0 gap-2 dark:text-white">
              <SelectValue asChild>
                 <Badge className={`${etapaInfo.color} hover:${etapaInfo.color}`}>
                  {etapaInfo.label}
                 </Badge>
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
              {ETAPAS.map(opt => <SelectItem key={opt.value} value={opt.value} className="dark:text-white dark:hover:bg-gray-600">{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      };
      
      const ResponsavelSelector = ({ value, onSelect }) => {
        const responsavelInfo = usersById[value];
        return (
          <Select value={value || ''} onValueChange={onSelect} disabled={userRole === 'colaborador'}>
            <SelectTrigger className="w-full border-none bg-transparent p-0 h-auto focus:ring-0 gap-2 dark:text-white">
               <SelectValue asChild>
                <div className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={responsavelInfo?.avatar_url} />
                    <AvatarFallback className="text-xs dark:bg-gray-700 dark:text-white">{responsavelInfo?.full_name ? responsavelInfo.full_name.charAt(0) : '?'}</AvatarFallback>
                  </Avatar>
                  <span className="truncate">{responsavelInfo?.full_name || 'N/A'}</span>
                </div>
               </SelectValue>
            </SelectTrigger>
            <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                {users.map(u => (
                  <SelectItem key={u.id} value={u.id} className="dark:text-white dark:hover:bg-gray-600">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={u.avatar_url} />
                        <AvatarFallback className="dark:bg-gray-600">{u.full_name ? u.full_name.charAt(0) : '?'}</AvatarFallback>
                      </Avatar>
                      <span>{u.full_name}</span>
                    </div>
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )
      };

      return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden relative">
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader className="dark:bg-gray-800">
                <TableRow className="dark:border-gray-700">
                  {(userRole === 'superadmin' || userRole === 'admin') && <TableHead className="w-[50px]"><Checkbox checked={selectedClients.length > 0 && selectedClients.length === clients.length} onCheckedChange={handleSelectAll} /></TableHead>}
                  <TableHead className="min-w-[200px] dark:text-white">Cliente</TableHead>
                  <TableHead className="min-w-[150px] dark:text-white">Etapa</TableHead>
                  <TableHead className="min-w-[180px] dark:text-white">Responsável</TableHead>
                  {canViewField('vencimento') && <TableHead className="dark:text-white">Vencimento</TableHead>}
                  {canViewField('valor') && <TableHead className="dark:text-white">Valor (R$)</TableHead>}
                  <TableHead className="dark:text-white">Etiquetas</TableHead>
                  {(userRole === 'superadmin' || userRole === 'admin') && <TableHead className="w-[50px] text-right dark:text-white">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map(client => {
                  const primaryLogo = client.logo_urls && client.logo_urls.length > 0 ? client.logo_urls[0] : null;
                  return (
                  <TableRow key={client.id} className="group dark:border-gray-700 dark:hover:bg-gray-700/50">
                    {(userRole === 'superadmin' || userRole === 'admin') && <TableCell><Checkbox checked={selectedClients.includes(client.id)} onCheckedChange={(checked) => handleSelectRow(client.id, checked)} /></TableCell>}
                    <TableCell className="font-medium dark:text-white">
                        <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9">
                                <AvatarImage src={primaryLogo} alt={client.empresa} />
                                <AvatarFallback className="bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                                    <Building size={18} />
                                </AvatarFallback>
                            </Avatar>
                            {client.empresa}
                        </div>
                    </TableCell>
                    <TableCell><EtapaSelector value={client.etapa} onSelect={(val) => onUpdateField(client.id, 'etapa', val)} /></TableCell>
                    <TableCell><ResponsavelSelector value={client.responsavel} onSelect={(val) => onUpdateField(client.id, 'responsavel', val)} /></TableCell>
                    {canViewField('vencimento') && <TableCell><VencimentoCell value={client.vencimento} /></TableCell>}
                    {canViewField('valor') && <TableCell className="dark:text-gray-300">{client.valor ? parseFloat(client.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-'}</TableCell>}
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {client.etiquetas?.map(etiqueta => {
                          const etiquetaInfo = ETIQUETAS.find(e => e.value === etiqueta);
                          return etiquetaInfo ? <Badge key={etiqueta} variant="secondary" className={`${etiquetaInfo.color}`}>{etiquetaInfo.label}</Badge> : null;
                        })}
                      </div>
                    </TableCell>
                    {(userRole === 'superadmin' || userRole === 'admin') && (
                      <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0 opacity-50 group-hover:opacity-100 dark:text-gray-300 dark:hover:bg-gray-700">
                                <span className="sr-only">Abrir menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="dark:bg-gray-800 dark:border-gray-700">
                              <DropdownMenuItem onClick={() => onEdit(client)} className="dark:text-white dark:hover:bg-gray-700"><Edit className="mr-2 h-4 w-4" /> Editar Detalhes</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onOpenDocument(client)} className="dark:text-white dark:hover:bg-gray-700"><FileText className="mr-2 h-4 w-4" /> Documento</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleViewChatLink(client.id)} className="dark:text-white dark:hover:bg-gray-700"><ExternalLink className="mr-2 h-4 w-4" /> Visualizar Link do Chat IA</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleCopyChatLink(client.id)} className="dark:text-white dark:hover:bg-gray-700"><Copy className="mr-2 h-4 w-4" /> Copiar Link do Chat IA</DropdownMenuItem>
                              <AlertDialog>
                                <AlertDialogTrigger asChild><DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-red-500 focus:text-red-600 focus:bg-red-50 dark:text-red-400 dark:focus:bg-red-900/50 dark:focus:text-red-400"><Trash2 className="mr-2 h-4 w-4" /> Excluir</DropdownMenuItem></AlertDialogTrigger>
                                <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
                                  <AlertDialogHeader><AlertDialogTitle className="dark:text-white">Você tem certeza?</AlertDialogTitle><AlertDialogDescription className="dark:text-gray-400">Esta ação não pode ser desfeita. Isso excluirá permanentemente o cliente "{client.empresa}".</AlertDialogDescription></AlertDialogHeader>
                                  <AlertDialogFooter><AlertDialogCancel className="dark:text-white dark:border-gray-600 dark:hover:bg-gray-700">Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteClient(client.id)} className="dark:bg-red-600 dark:hover:bg-red-700">Excluir</AlertDialogAction></AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </DropdownMenuContent>
                          </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                )})}
                {(userRole === 'superadmin' || userRole === 'admin') && (
                 <TableRow className="dark:border-gray-700">
                    <TableCell colSpan={8} className="p-0">
                        <Button variant="ghost" className="w-full justify-start text-gray-500 dark:text-gray-400 dark:hover:bg-gray-700/50" onClick={onAddClient}><Plus className="mr-2 h-4 w-4" /> Adicionar Cliente</Button>
                    </TableCell>
                </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="md:hidden space-y-2 p-2">
            {clients.map(client => {
              const responsavelInfo = usersById[client.responsavel];
              const primaryLogo = client.logo_urls && client.logo_urls.length > 0 ? client.logo_urls[0] : null;

              return (
                <Card key={client.id} className="dark:bg-gray-800 dark:border-gray-700">
                  <CardHeader className="flex flex-row items-start justify-between p-3 pb-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {(userRole === 'superadmin' || userRole === 'admin') && <Checkbox checked={selectedClients.includes(client.id)} onCheckedChange={(checked) => handleSelectRow(client.id, checked)} className="flex-shrink-0" />}
                      <Avatar className="h-8 w-8 flex-shrink-0">
                        <AvatarImage src={primaryLogo} alt={client.empresa} />
                        <AvatarFallback className="bg-gray-200 dark:bg-gray-700"><Building size={16} /></AvatarFallback>
                      </Avatar>
                      <h3 className="font-semibold dark:text-white text-sm truncate flex-1 min-w-0">{client.empresa}</h3>
                    </div>
                    {(userRole === 'superadmin' || userRole === 'admin') && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" className="h-7 w-7 p-0 flex-shrink-0"><MoreHorizontal className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="dark:bg-gray-800 dark:border-gray-700">
                          <DropdownMenuItem onClick={() => onEdit(client)} className="dark:text-white dark:hover:bg-gray-700"><Edit className="mr-2 h-4 w-4" /> Editar</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onOpenDocument(client)} className="dark:text-white dark:hover:bg-gray-700"><FileText className="mr-2 h-4 w-4" /> Documento</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleViewChatLink(client.id)} className="dark:text-white dark:hover:bg-gray-700"><ExternalLink className="mr-2 h-4 w-4" /> Visualizar Link do Chat IA</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleCopyChatLink(client.id)} className="dark:text-white dark:hover:bg-gray-700"><Copy className="mr-2 h-4 w-4" /> Copiar Link do Chat</DropdownMenuItem>
                          <AlertDialog>
                            <AlertDialogTrigger asChild><DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-red-500 focus:text-red-600 focus:bg-red-50 dark:text-red-400 dark:focus:bg-red-900/50 dark:focus:text-red-400"><Trash2 className="mr-2 h-4 w-4" /> Excluir</DropdownMenuItem></AlertDialogTrigger>
                            <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
                              <AlertDialogHeader><AlertDialogTitle className="dark:text-white">Tem certeza?</AlertDialogTitle><AlertDialogDescription className="dark:text-gray-400">Excluir permanentemente o cliente "{client.empresa}".</AlertDialogDescription></AlertDialogHeader>
                              <AlertDialogFooter><AlertDialogCancel className="dark:text-white dark:border-gray-600 dark:hover:bg-gray-700">Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteClient(client.id)} className="dark:bg-red-600 dark:hover:bg-red-700">Excluir</AlertDialogAction></AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs ml-2 pl-9">
                    <div><EtapaSelector value={client.etapa} onSelect={(val) => onUpdateField(client.id, 'etapa', val)} /></div>
                    <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                      <Avatar className="h-5 w-5"><AvatarImage src={responsavelInfo?.avatar_url} /><AvatarFallback className="text-xs">{responsavelInfo?.full_name ? responsavelInfo.full_name.charAt(0) : '?'}</AvatarFallback></Avatar>
                      <span className="truncate">{responsavelInfo?.full_name || 'N/A'}</span>
                    </div>
                    {canViewField('vencimento') && <div className="flex items-center gap-1.5"><Calendar className="h-3 w-3 text-gray-400" /><VencimentoCell value={client.vencimento} /></div>}
                    {canViewField('valor') && <div className="flex items-center gap-1.5"><DollarSign className="h-3 w-3 text-gray-400" /><span className="dark:text-gray-300">{client.valor ? parseFloat(client.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-'}</span></div>}
                    <div className="flex items-center gap-1.5 flex-wrap"><Tag className="h-3 w-3 text-gray-400" />
                      {client.etiquetas?.map(etiqueta => {
                        const etiquetaInfo = ETIQUETAS.find(e => e.value === etiqueta);
                        return etiquetaInfo ? <Badge key={etiqueta} variant="secondary" className={`${etiquetaInfo.color} text-xs`}>{etiquetaInfo.label}</Badge> : null;
                      })}
                      {(!client.etiquetas || client.etiquetas?.length === 0) && <span className="text-gray-500 dark:text-gray-400">-</span>}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
            {(userRole === 'superadmin' || userRole === 'admin') && (
                <Button variant="ghost" className="w-full justify-center text-gray-500 dark:text-gray-400 dark:hover:bg-gray-700/50 mt-4" onClick={onAddClient}><Plus className="mr-2 h-4 w-4" /> Adicionar Cliente</Button>
            )}
          </div>

          <AnimatePresence>
            {selectedClients.length > 0 && (
              <motion.div
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 100, opacity: 0 }}
                className="fixed bottom-20 md:bottom-5 left-1/2 -translate-x-1/2 w-auto bg-gray-800 text-white rounded-lg shadow-2xl flex items-center gap-4 p-3 z-50"
              >
                <span className="text-sm font-medium">{selectedClients.length} cliente(s) selecionado(s)</span>
                <AlertDialog>
                  <AlertDialogTrigger asChild><Button variant="destructive" size="sm"><Trash2 className="mr-2 h-4 w-4" />Excluir</Button></AlertDialogTrigger>
                  <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
                    <AlertDialogHeader><AlertDialogTitle className="dark:text-white">Você tem certeza?</AlertDialogTitle><AlertDialogDescription className="dark:text-gray-400">Esta ação não pode ser desfeita. Isso excluirá permanentemente os {selectedClients.length} clientes selecionados.</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel className="dark:text-white dark:border-gray-600 dark:hover:bg-gray-700">Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleBulkDelete} className="dark:bg-red-600 dark:hover:bg-red-700">Excluir</AlertDialogAction></AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button variant="ghost" size="sm" onClick={() => setSelectedClients([])}><X className="mr-2 h-4 w-4" />Limpar</Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      );
    };

    export default ClientesLista;