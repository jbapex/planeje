import { Button } from '@/components/ui/button';
import { Copy, Edit, FileText, LayoutDashboard, MoreHorizontal, Trash2, User } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export default function ClientCardMenu({ client, onOpen, onEdit, onOpenDocument, onOpenUserManager, fetchClients }) {
  const { toast } = useToast();

  const handleCopyChatLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/#/chat/${client.id}`);
    toast({
      title: 'Link do Chat Copiado!',
      description: 'O link para o assistente de IA do cliente foi copiado.',
    });
  };

  const handleDelete = async () => {
    const { error } = await supabase.from('clientes').delete().eq('id', client.id);
    if (error) {
      toast({ title: 'Erro ao excluir cliente', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Cliente excluído com sucesso!' });
      fetchClients();
    }
  };

  return (
    <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-7 w-7 p-0 flex-shrink-0" aria-label="Mais ações">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="dark:bg-gray-800 dark:border-gray-700">
          <DropdownMenuItem onClick={() => (onOpen || onEdit)(client)} className="dark:text-white dark:hover:bg-gray-700"><LayoutDashboard className="mr-2 h-4 w-4" /> Abrir conta</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onEdit(client)} className="dark:text-white dark:hover:bg-gray-700"><Edit className="mr-2 h-4 w-4" /> Editar</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onOpenDocument(client)} className="dark:text-white dark:hover:bg-gray-700"><FileText className="mr-2 h-4 w-4" /> Documento</DropdownMenuItem>
          {onOpenUserManager && <DropdownMenuItem onClick={() => onOpenUserManager(client)} className="dark:text-white dark:hover:bg-gray-700"><User className="mr-2 h-4 w-4" /> Gerenciar Login</DropdownMenuItem>}
          <DropdownMenuItem onClick={handleCopyChatLink} className="dark:text-white dark:hover:bg-gray-700"><Copy className="mr-2 h-4 w-4" /> Copiar Link do Chat IA</DropdownMenuItem>
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
                <AlertDialogAction onClick={handleDelete} className="dark:bg-red-600 dark:hover:bg-red-700">Excluir</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
