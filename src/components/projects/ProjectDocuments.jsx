import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FileText, PlusCircle, Trash2, Loader2, Check } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const ProjectDocuments = ({ client }) => {
  const [documents, setDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const debounceTimeout = useRef(null);
  const isInitialMount = useRef(true);

  const fetchDocuments = useCallback(async () => {
    if (!client?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('client_documents')
      .select('id, title, created_at')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false });
    
    if (error) {
      toast({ title: 'Erro ao buscar documentos', description: error.message, variant: 'destructive' });
    } else {
      setDocuments(data);
    }
    setLoading(false);
  }, [client?.id, toast]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const fetchDocumentContent = useCallback(async (docId) => {
    const { data, error } = await supabase
      .from('client_documents')
      .select('title, content')
      .eq('id', docId)
      .single();
    
    if (error) {
      toast({ title: 'Erro ao buscar conteúdo do documento', description: error.message, variant: 'destructive' });
      return;
    }
    
    setSelectedDoc({ id: docId, title: data.title, content: data.content });
    setTitle(data.title || 'Sem título');
    setContent(data.content?.text_content || '');
    isInitialMount.current = false;
  }, [toast]);

  useEffect(() => {
    if (selectedDoc?.id) {
      fetchDocumentContent(selectedDoc.id);
    }
  }, [selectedDoc?.id, fetchDocumentContent]);

  const handleSelectDoc = (doc) => {
    setSelectedDoc(doc);
    isInitialMount.current = true;
  };
  
  const handleCreateNewDoc = async () => {
    const { data, error } = await supabase
      .from('client_documents')
      .insert({
        client_id: client.id,
        owner_id: user.id,
        title: 'Novo Documento',
        content: { text_content: '' },
      })
      .select('id, title, created_at')
      .single();
    
    if (error) {
      toast({ title: 'Erro ao criar documento', description: error.message, variant: 'destructive' });
      return;
    }
    
    setDocuments(prev => [data, ...prev]);
    handleSelectDoc(data);
  };
  
  const handleDeleteDoc = async (docId) => {
    const { error } = await supabase
      .from('client_documents')
      .delete()
      .eq('id', docId);

    if (error) {
      toast({ title: 'Erro ao deletar documento', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Documento deletado!' });
      setDocuments(docs => docs.filter(d => d.id !== docId));
      if (selectedDoc?.id === docId) {
        setSelectedDoc(null);
        setTitle('');
        setContent('');
      }
    }
  };

  const saveChanges = useCallback(async (newTitle, newContent) => {
    if (!selectedDoc) return;
    
    setIsSaving(true);
    const { error } = await supabase
      .from('client_documents')
      .update({
        title: newTitle,
        content: { text_content: newContent },
        updated_at: new Date().toISOString()
      })
      .eq('id', selectedDoc.id);
      
    setIsSaving(false);
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    } else {
      setDocuments(docs => docs.map(doc => doc.id === selectedDoc.id ? {...doc, title: newTitle} : doc));
      toast({ title: 'Salvo!', duration: 2000 });
    }
  }, [selectedDoc, toast]);
  
  useEffect(() => {
    if (isInitialMount.current) return;

    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }
    
    debounceTimeout.current = setTimeout(() => {
      saveChanges(title, content);
    }, 1500);

    return () => clearTimeout(debounceTimeout.current);
  }, [title, content, saveChanges]);

  return (
    <div className="flex h-[70vh]">
      <div className="w-1/4 border-r p-4 space-y-2 overflow-y-auto">
        <Button onClick={handleCreateNewDoc} className="w-full">
          <PlusCircle className="mr-2 h-4 w-4" /> Adicionar Página
        </Button>
        <h2 className="text-lg font-semibold pt-4">Documentos do Cliente</h2>
        {loading && <p>Carregando...</p>}
        {documents.map(doc => (
          <div
            key={doc.id}
            className={`flex items-center justify-between p-2 rounded-md cursor-pointer ${selectedDoc?.id === doc.id ? 'bg-gray-200 dark:bg-gray-700' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
            onClick={() => handleSelectDoc(doc)}
          >
            <div className="flex items-center">
              <FileText className="mr-2 h-4 w-4" />
              <span>{doc.title || 'Sem título'}</span>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); handleDeleteDoc(doc.id); }}>
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          </div>
        ))}
      </div>

      <div className="w-3/4 p-6 overflow-y-auto">
        {selectedDoc ? (
          <div>
            <div className="flex items-center justify-end mb-4 text-sm text-gray-500">
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-1" /> Salvando...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 text-green-500 mr-1" /> Salvo
                </>
              )}
            </div>
            <Input 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-3xl font-bold border-none shadow-none focus-visible:ring-0 mb-4 px-0"
              placeholder="Sem título"
            />
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full h-[calc(70vh-150px)] border-none shadow-none focus-visible:ring-0 px-0 text-base"
              placeholder="Comece a escrever..."
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <FileText className="h-16 w-16 mb-4" />
            <h3 className="text-xl font-semibold">Selecione ou crie um documento</h3>
            <p>Todos os documentos deste cliente aparecerão aqui.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectDocuments;