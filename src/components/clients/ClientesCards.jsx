import React from 'react';
    import { motion } from 'framer-motion';
    import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
    import { Button } from "@/components/ui/button";
    import { Edit, Trash2, BarChart, Building, FileText, MessageSquare, Copy } from 'lucide-react';
    import { useToast } from '@/components/ui/use-toast';
    import { supabase } from '@/lib/customSupabaseClient';
    import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
    import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
    import { MoreHorizontal } from 'lucide-react';

    const ETAPAS = [
      { value: 'prospect', label: 'Prospect', color: 'bg-gray-400' },
      { value: 'qualification', label: 'Qualificação', color: 'bg-blue-500' },
      { value: 'proposal', label: 'Proposta', color: 'bg-yellow-500' },
      { value: 'negotiation', label: 'Negociação', color: 'bg-orange-500' },
      { value: 'closed', label: 'Fechado', color: 'bg-green-500' },
      { value: 'lost', label: 'Perdido', color: 'bg-red-500' }
    ];

    const ClientesCards = ({ clients, onEdit, onProgress, onOpenDocument, fetchClients, userRole }) => {
      const { toast } = useToast();
      const { canViewField } = useAuth();
      
      const handleCopyChatLink = (clientId) => {
        const url = `${window.location.origin}/#/chat/${clientId}`;
        navigator.clipboard.writeText(url);
        toast({
            title: "Link do Chat Copiado!",
            description: "O link para o assistente de IA do cliente foi copiado.",
        });
      };

      const handleDelete = async (clientId) => {
        const { error } = await supabase.from('clientes').delete().eq('id', clientId);
        if (error) {
          toast({ title: "Erro ao excluir cliente", description: error.message, variant: "destructive" });
        } else {
          toast({ title: "Cliente excluído com sucesso!" });
          fetchClients();
        }
      };

      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-6">
          {clients.map(client => {
            const etapaInfo = ETAPAS.find(e => e.value === client.etapa) || ETAPAS[0];
            const primaryLogo = client.logo_urls && client.logo_urls.length > 0 ? client.logo_urls[0] : null;

            return (
              <motion.div key={client.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="dark:bg-gray-800 dark:border-gray-700 flex flex-col h-full">
                  <CardHeader className="p-3 md:p-6">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2 md:gap-4 flex-1 min-w-0">
                        <Avatar className="h-8 w-8 md:h-12 md:w-12 flex-shrink-0">
                            <AvatarImage src={primaryLogo} alt={client.empresa} />
                            <AvatarFallback className="bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                                <Building size={16} className="md:w-6 md:h-6" />
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="dark:text-white text-sm md:text-base truncate">{client.empresa}</CardTitle>
                          <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400 truncate">{client.nome_contato}</p>
                        </div>
                      </div>
                      {(userRole === 'superadmin' || userRole === 'admin') && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-7 w-7 md:h-8 md:w-8 p-0 flex-shrink-0">
                              <MoreHorizontal className="h-3.5 w-3.5 md:h-4 md:w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="dark:bg-gray-800 dark:border-gray-700">
                             <DropdownMenuItem onClick={() => onEdit(client)} className="dark:text-white dark:hover:bg-gray-700"><Edit className="mr-2 h-4 w-4" /> Editar</DropdownMenuItem>
                             <DropdownMenuItem onClick={() => onOpenDocument(client)} className="dark:text-white dark:hover:bg-gray-700"><FileText className="mr-2 h-4 w-4" /> Documento</DropdownMenuItem>
                             <DropdownMenuItem onClick={() => handleCopyChatLink(client.id)} className="dark:text-white dark:hover:bg-gray-700"><Copy className="mr-2 h-4 w-4" /> Copiar Link do Chat IA</DropdownMenuItem>
                             <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-red-500 focus:text-red-600 focus:bg-red-50 dark:text-red-400 dark:focus:bg-red-900/50 dark:focus:text-red-400"><Trash2 className="mr-2 h-4 w-4" /> Excluir</DropdownMenuItem>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="dark:text-white">Você tem certeza?</AlertDialogTitle>
                                  <AlertDialogDescription className="dark:text-gray-400">
                                    Esta ação não pode ser desfeita. Isso excluirá permanentemente o cliente "{client.empresa}".
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="dark:text-white dark:border-gray-600 dark:hover:bg-gray-700">Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDelete(client.id)} className="dark:bg-red-600 dark:hover:bg-red-700">Excluir</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1.5 md:space-y-2 flex-grow p-3 md:p-6 pt-0">
                    {canViewField('tipo_contrato') && (
                      <div className="text-xs md:text-sm dark:text-gray-300">
                        <span className="font-medium">Contrato: </span><span className="truncate">{client.tipo_contrato || '-'}</span>
                      </div>
                    )}
                    {canViewField('valor') && (
                      <div className="text-xs md:text-sm dark:text-gray-300">
                        <span className="font-medium">Valor: </span>
                        {client.valor ? `R$ ${parseFloat(client.valor).toFixed(2)}` : '-'}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 md:gap-2">
                      <span className={`h-1.5 w-1.5 md:h-2 md:w-2 rounded-full ${etapaInfo.color}`}></span>
                      <span className="text-xs md:text-sm dark:text-gray-300">{etapaInfo.label}</span>
                    </div>
                  </CardContent>
                  <CardFooter className="p-3 md:p-6 pt-0">
                    <Button variant="outline" className="w-full dark:bg-gray-700 dark:text-white dark:border-gray-600 dark:hover:bg-gray-600 text-xs md:text-sm h-8 md:h-10" onClick={() => onProgress(client)}>
                      <BarChart className="mr-2 h-3 w-3 md:h-4 md:w-4" /> Ver Progresso
                    </Button>
                  </CardFooter>
                </Card>
              </motion.div>
            );
          })}
        </div>
      );
    };

    export default ClientesCards;