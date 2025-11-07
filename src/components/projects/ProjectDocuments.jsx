import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FileText, PlusCircle, Trash2, Loader2, Check, Bold, AlignLeft, AlignCenter, AlignRight, AlignJustify, Minus, Plus } from 'lucide-react';
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
  const editorRef = useRef(null);
  const [fontSize, setFontSize] = useState(16);

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
    const textContent = data.content?.text_content || '';
    setContent(textContent);
    // Aguarda um pouco para garantir que o editor esteja renderizado
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.innerHTML = textContent;
      }
    }, 100);
    isInitialMount.current = false;
  }, [toast]);

  useEffect(() => {
    if (selectedDoc?.id) {
      fetchDocumentContent(selectedDoc.id);
    }
  }, [selectedDoc?.id, fetchDocumentContent]);

  // Atualiza o editor quando um novo documento é selecionado
  useEffect(() => {
    if (selectedDoc && editorRef.current) {
      const textContent = selectedDoc.content?.text_content || '';
      if (editorRef.current.innerHTML !== textContent) {
        editorRef.current.innerHTML = textContent;
      }
    }
  }, [selectedDoc]);

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

  const handleEditorChange = () => {
    if (editorRef.current) {
      const htmlContent = editorRef.current.innerHTML;
      setContent(htmlContent);
    }
  };

  const formatText = (command, value = null) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    handleEditorChange();
  };

  const changeFontSize = (delta) => {
    const newSize = Math.max(12, Math.min(48, fontSize + delta));
    setFontSize(newSize);
    if (editorRef.current) {
      const selection = window.getSelection();
      if (selection.rangeCount > 0 && !selection.isCollapsed) {
        // Aplica ao texto selecionado
        const range = selection.getRangeAt(0);
        const span = document.createElement('span');
        span.style.fontSize = `${newSize}px`;
        try {
          range.surroundContents(span);
        } catch (e) {
          // Se não conseguir, usa execCommand
          document.execCommand('fontSize', false, '7');
          const fontElements = editorRef.current.querySelectorAll('font[size="7"]');
          fontElements.forEach(el => {
            el.style.fontSize = `${newSize}px`;
          });
        }
      } else {
        // Aplica ao próximo texto digitado (muda o estilo padrão)
        editorRef.current.style.fontSize = `${newSize}px`;
      }
      editorRef.current.focus();
      handleEditorChange();
    }
  };
  
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

      <div className="w-3/4 overflow-y-auto">
        {selectedDoc ? (
          <div className="px-12 py-8">
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
              className="text-3xl font-bold border-none shadow-none focus-visible:ring-0 mb-6 px-0"
              placeholder="Sem título"
            />
            
            {/* Barra de Ferramentas */}
            <div className="flex items-center gap-2 p-2 border rounded-md mb-2 bg-gray-50 dark:bg-gray-800">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => formatText('bold')}
                className="h-8 w-8 p-0"
                title="Negrito"
              >
                <Bold className="h-4 w-4" />
              </Button>
              
              <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-1" />
              
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => changeFontSize(-2)}
                  className="h-8 w-8 p-0"
                  title="Diminuir fonte"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="text-xs px-2 min-w-[3rem] text-center">{fontSize}px</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => changeFontSize(2)}
                  className="h-8 w-8 p-0"
                  title="Aumentar fonte"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-1" />
              
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => formatText('justifyLeft')}
                className="h-8 w-8 p-0"
                title="Alinhar à esquerda"
              >
                <AlignLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => formatText('justifyCenter')}
                className="h-8 w-8 p-0"
                title="Centralizar"
              >
                <AlignCenter className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => formatText('justifyRight')}
                className="h-8 w-8 p-0"
                title="Alinhar à direita"
              >
                <AlignRight className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => formatText('justifyFull')}
                className="h-8 w-8 p-0"
                title="Justificar"
              >
                <AlignJustify className="h-4 w-4" />
              </Button>
            </div>

            {/* Editor de Texto Rico */}
            <div
              ref={editorRef}
              contentEditable
              onInput={handleEditorChange}
              onBlur={handleEditorChange}
              className="w-full rounded-md bg-background text-base leading-relaxed resize-none overflow-y-auto focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              style={{ 
                paddingLeft: '2rem', 
                paddingRight: '2rem', 
                paddingTop: '1.5rem', 
                paddingBottom: '1.5rem',
                minHeight: 'calc(70vh - 200px)',
                fontSize: `${fontSize}px`
              }}
              data-placeholder="Comece a escrever..."
            />
            
            <style>{`
              [contenteditable][data-placeholder]:empty:before {
                content: attr(data-placeholder);
                color: #9ca3af;
                pointer-events: none;
              }
            `}</style>
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