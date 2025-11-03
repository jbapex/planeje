import React, { useState, useRef, useEffect, useCallback } from 'react';
    import { motion } from 'framer-motion';
    import { X, Save } from 'lucide-react';
    import { Button } from '@/components/ui/button';
    import { useToast } from '@/components/ui/use-toast';
    import { supabase } from '@/lib/customSupabaseClient';
    import { Textarea } from '@/components/ui/textarea';

    const ClientDocumentEditor = ({ client, onClose, onSaveSuccess }) => {
      const [content, setContent] = useState(client.client_document || 'Comece a escrever aqui...');
      const [isSaving, setIsSaving] = useState(false);
      const [status, setStatus] = useState('Salvo');
      const { toast } = useToast();
      const timeoutRef = useRef(null);

      const handleContentChange = (e) => {
        setStatus('Modificado');
        setContent(e.target.value);
      };

      const saveContent = useCallback(async (showToast = false) => {
        if (status !== 'Salvando...') {
          setIsSaving(true);
          setStatus('Salvando...');
          const { error } = await supabase
            .from('clientes')
            .update({ client_document: content })
            .eq('id', client.id);

          setIsSaving(false);
          if (error) {
            setStatus('Erro ao salvar');
            toast({ title: 'Erro ao salvar', description: 'Não foi possível salvar o documento.', variant: 'destructive' });
          } else {
            setStatus('Salvo');
            if (showToast) {
              toast({ title: 'Documento salvo!', description: 'Suas alterações foram salvas com sucesso.' });
            }
            if (onSaveSuccess) {
              onSaveSuccess();
            }
          }
        }
      }, [content, client.id, toast, onSaveSuccess, status]);
      
      useEffect(() => {
        if (status === 'Modificado') {
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
            }
            timeoutRef.current = setTimeout(() => {
              saveContent(false);
            }, 2000);
        }

        return () => {
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
          }
        };
      }, [content, status, saveContent]);

      const handleManualSave = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        saveContent(true);
      };

      return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-gray-50 dark:bg-gray-900 z-50 flex flex-col"
        >
          <header className="flex items-center justify-between p-4 border-b dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm flex-shrink-0">
            <h2 className="text-xl font-bold text-gray-800 dark:text-white">Documento de: {client.empresa}</h2>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">{status}</span>
              <Button onClick={handleManualSave} disabled={isSaving}>
                <Save className="mr-2 h-4 w-4" /> Salvar Agora
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X />
              </Button>
            </div>
          </header>

          <main className="flex-grow p-4 overflow-y-auto">
            <Textarea
              value={content}
              onChange={handleContentChange}
              placeholder="Escreva livremente aqui..."
              className="w-full h-full resize-none border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:ring-blue-500 focus:border-blue-500 text-base"
            />
          </main>
        </motion.div>
      );
    };

    export default ClientDocumentEditor;