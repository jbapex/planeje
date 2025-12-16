import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FileText, PlusCircle, Trash2, Loader2, Check, Bold, Italic, Underline, List, ListOrdered, AlignLeft, AlignCenter, AlignRight, AlignJustify, Minus, Plus, Link, Image, Highlighter, Type, ArrowRight, ArrowLeft, Eraser, Palette, Bot } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
  const [fontFamily, setFontFamily] = useState('Arial');
  const [textStyle, setTextStyle] = useState('p');
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [showImageDialog, setShowImageDialog] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [textColor, setTextColor] = useState('#000000');
  const [highlightColor, setHighlightColor] = useState('#FFFF00');

  const fetchDocuments = useCallback(async () => {
    if (!client?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('client_documents')
      .select('id, title, created_at, apexia_access')
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

  // Função para formatar o conteúdo ao carregar (melhora a estrutura)
  const formatContentForDisplay = (htmlContent) => {
    if (!htmlContent || htmlContent.trim() === '') return '';
    
    // Remove tags vazias e formata parágrafos
    let formatted = htmlContent
      .replace(/<p><\/p>/g, '') // Remove parágrafos vazios
      .replace(/<div><\/div>/g, '') // Remove divs vazias
      .replace(/<br\s*\/?>\s*<br\s*\/?>/gi, '</p><p>') // Converte quebras duplas em parágrafos
      .replace(/\n\n+/g, '</p><p>'); // Converte quebras de linha duplas em parágrafos
    
    // Garante que o conteúdo esteja dentro de parágrafos
    if (!formatted.includes('<p>') && !formatted.includes('<div>')) {
      formatted = formatted.split('\n').map(line => {
        if (line.trim()) {
          return `<p>${line.trim()}</p>`;
        }
        return '';
      }).join('');
    }
    
    return formatted || htmlContent;
  };

  // Função para limpar e estruturar o conteúdo ao salvar
  const formatContentForSave = (htmlContent) => {
    if (!htmlContent || htmlContent.trim() === '') return '';
    
    // Remove espaços em branco excessivos
    let cleaned = htmlContent
      .replace(/\s+/g, ' ') // Remove espaços múltiplos
      .replace(/&nbsp;/g, ' ') // Converte &nbsp; em espaços
      .trim();
    
    // Garante estrutura de parágrafos adequada
    if (!cleaned.includes('<p>') && !cleaned.includes('<div>')) {
      cleaned = cleaned.split('\n').filter(line => line.trim()).map(line => {
        return `<p>${line.trim()}</p>`;
      }).join('');
    }
    
    return cleaned;
  };

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
        // Limpa e formata o conteúdo antes de inserir
        const formattedContent = formatContentForDisplay(textContent);
        editorRef.current.innerHTML = formattedContent;
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
        apexia_access: false, // Por padrão, novo documento não tem acesso do ApexIA
      })
      .select('id, title, created_at, apexia_access')
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

  const handleToggleApexIAAccess = async (docId, currentValue) => {
    const newValue = !currentValue;
    
    const { error } = await supabase
      .from('client_documents')
      .update({ apexia_access: newValue })
      .eq('id', docId);

    if (error) {
      toast({ 
        title: 'Erro ao atualizar acesso', 
        description: error.message, 
        variant: 'destructive' 
      });
    } else {
      setDocuments(docs => 
        docs.map(doc => 
          doc.id === docId ? { ...doc, apexia_access: newValue } : doc
        )
      );
      
      // Atualizar selectedDoc se for o documento atual
      if (selectedDoc?.id === docId) {
        setSelectedDoc({ ...selectedDoc, apexia_access: newValue });
      }
      
      toast({ 
        title: newValue ? 'Acesso do ApexIA ativado' : 'Acesso do ApexIA desativado',
        description: newValue 
          ? 'Este documento agora está disponível para o ApexIA' 
          : 'Este documento não está mais disponível para o ApexIA',
        duration: 2000
      });
    }
  };

  const saveChanges = useCallback(async (newTitle, newContent) => {
    if (!selectedDoc) return;
    
    setIsSaving(true);
    // Formata o conteúdo antes de salvar
    const formattedContent = formatContentForSave(newContent);
    
    const { error } = await supabase
      .from('client_documents')
      .update({
        title: newTitle,
        content: { text_content: formattedContent },
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
      // Melhora a estrutura do conteúdo enquanto o usuário digita
      const htmlContent = editorRef.current.innerHTML;
      
      // Garante que quebras de linha duplas criem parágrafos
      const selection = window.getSelection();
      const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      
      setContent(htmlContent);
    }
  };

  // Função para garantir estrutura de parágrafos ao pressionar Enter
  const handleKeyDown = (e) => {
    // Desfazer: Ctrl+Z (Windows/Linux) ou Cmd+Z (Mac)
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      document.execCommand('undo', false, null);
      handleEditorChange();
      return;
    }
    
    // Refazer: Ctrl+Shift+Z (Windows/Linux) ou Cmd+Shift+Z (Mac)
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
      e.preventDefault();
      document.execCommand('redo', false, null);
      handleEditorChange();
      return;
    }
    
    // Selecionar tudo: Ctrl+A (Windows/Linux) ou Cmd+A (Mac)
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editorRef.current);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    
    // Enter para criar novo parágrafo
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      document.execCommand('insertParagraph', false, null);
      
      // Garante que o novo parágrafo tenha espaçamento adequado
      setTimeout(() => {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const p = range.startContainer.parentElement;
          if (p && p.tagName === 'P') {
            p.style.marginBottom = '1rem';
          }
        }
        handleEditorChange();
      }, 0);
    }
  };

  const formatText = (command, value = null) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    handleEditorChange();
  };

  const changeFontSize = (delta) => {
    if (!editorRef.current) return;
    
    const selection = window.getSelection();
    const hasSelection = selection.rangeCount > 0 && !selection.isCollapsed;
    
    if (hasSelection) {
      // Aplica ao texto selecionado
      const range = selection.getRangeAt(0);
      
      // Obtém o tamanho atual do texto selecionado (se houver)
      let currentSize = fontSize;
      try {
        const container = range.commonAncestorContainer;
        const parentElement = container.nodeType === Node.TEXT_NODE 
          ? container.parentElement 
          : container;
        
        if (parentElement && parentElement !== editorRef.current) {
          // Verifica se já tem um tamanho definido inline
          if (parentElement.style.fontSize) {
            currentSize = parseInt(parentElement.style.fontSize);
          } else {
            const computedStyle = window.getComputedStyle(parentElement);
            const currentFontSize = computedStyle.fontSize;
            if (currentFontSize) {
              currentSize = parseInt(currentFontSize);
            }
          }
        }
      } catch (e) {
        // Se houver erro, usa o tamanho padrão
      }
      
      const newSize = Math.max(12, Math.min(48, currentSize + delta));
      
      // Extrai o conteúdo selecionado
      const contents = range.extractContents();
      
      // Cria um span com o novo tamanho
      const span = document.createElement('span');
      span.style.fontSize = `${newSize}px`;
      span.appendChild(contents);
      
      // Insere o span no lugar do conteúdo extraído
      range.insertNode(span);
      
      // Limpa spans vazios ou aninhados desnecessários
      setTimeout(() => {
        // Normaliza o conteúdo para evitar spans vazios
        editorRef.current.normalize();
        
        // Remove spans vazios
        const emptySpans = editorRef.current.querySelectorAll('span:empty');
        emptySpans.forEach(span => span.remove());
        
        handleEditorChange();
      }, 0);
    } else {
      // Sem seleção: muda o tamanho padrão para o próximo texto digitado
      const newSize = Math.max(12, Math.min(48, fontSize + delta));
      setFontSize(newSize);
      editorRef.current.style.fontSize = `${newSize}px`;
    }
    
    editorRef.current.focus();
    handleEditorChange();
  };

  // Função para mudar estilo de texto (Normal, Título 1-6)
  const changeTextStyle = (style) => {
    if (!editorRef.current) return;
    setTextStyle(style);
    
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const blockElement = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
        ? range.commonAncestorContainer.parentElement
        : range.commonAncestorContainer;
      
      if (blockElement && blockElement.tagName && ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(blockElement.tagName)) {
        const newElement = document.createElement(style === 'p' ? 'p' : `h${style}`);
        newElement.innerHTML = blockElement.innerHTML;
        blockElement.parentNode.replaceChild(newElement, blockElement);
      } else {
        // Se não houver elemento de bloco, cria um novo
        if (style === 'p') {
          document.execCommand('formatBlock', false, '<p>');
        } else {
          document.execCommand('formatBlock', false, `<h${style}>`);
        }
      }
    } else {
      // Sem seleção, aplica ao próximo texto
      if (style === 'p') {
        document.execCommand('formatBlock', false, '<p>');
      } else {
        document.execCommand('formatBlock', false, `<h${style}>`);
      }
    }
    
    editorRef.current.focus();
    handleEditorChange();
  };

  // Função para mudar família da fonte
  const changeFontFamily = (family) => {
    if (!editorRef.current) return;
    setFontFamily(family);
    
    const selection = window.getSelection();
    if (selection.rangeCount > 0 && !selection.isCollapsed) {
      // Aplica ao texto selecionado
      const range = selection.getRangeAt(0);
      const contents = range.extractContents();
      const span = document.createElement('span');
      span.style.fontFamily = family;
      span.appendChild(contents);
      range.insertNode(span);
    } else {
      // Aplica ao próximo texto digitado
      document.execCommand('fontName', false, family);
    }
    
    editorRef.current.focus();
    handleEditorChange();
  };

  // Função para mudar cor do texto
  const changeTextColor = (color) => {
    if (!editorRef.current) return;
    setTextColor(color);
    document.execCommand('foreColor', false, color);
    editorRef.current.focus();
    handleEditorChange();
  };

  // Função para mudar cor de fundo (highlighter)
  const changeHighlightColor = (color) => {
    if (!editorRef.current) return;
    setHighlightColor(color);
    document.execCommand('backColor', false, color);
    editorRef.current.focus();
    handleEditorChange();
  };

  // Função para inserir/editar link
  const handleInsertLink = () => {
    if (!editorRef.current) return;
    
    const selection = window.getSelection();
    if (selection.rangeCount > 0 && !selection.isCollapsed) {
      // Verifica se já é um link
      const range = selection.getRangeAt(0);
      let linkElement = range.commonAncestorContainer;
      if (linkElement.nodeType === Node.TEXT_NODE) {
        linkElement = linkElement.parentElement;
      }
      while (linkElement && linkElement.tagName !== 'A' && linkElement !== editorRef.current) {
        linkElement = linkElement.parentElement;
      }
      
      if (linkElement && linkElement.tagName === 'A') {
        // Edita link existente
        setLinkUrl(linkElement.href);
      } else {
        // Novo link
        setLinkUrl('');
      }
      setShowLinkDialog(true);
    } else {
      toast({ title: 'Selecione um texto', description: 'Selecione o texto que deseja transformar em link', variant: 'destructive' });
    }
  };

  const confirmInsertLink = () => {
    if (!linkUrl.trim()) {
      toast({ title: 'URL inválida', description: 'Digite uma URL válida', variant: 'destructive' });
      return;
    }
    
    const selection = window.getSelection();
    if (selection.rangeCount > 0 && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      let linkElement = range.commonAncestorContainer;
      if (linkElement.nodeType === Node.TEXT_NODE) {
        linkElement = linkElement.parentElement;
      }
      while (linkElement && linkElement.tagName !== 'A' && linkElement !== editorRef.current) {
        linkElement = linkElement.parentElement;
      }
      
      if (linkElement && linkElement.tagName === 'A') {
        // Edita link existente
        linkElement.href = linkUrl;
        linkElement.target = '_blank';
      } else {
        // Cria novo link
        const url = linkUrl.startsWith('http://') || linkUrl.startsWith('https://') ? linkUrl : `https://${linkUrl}`;
        document.execCommand('createLink', false, url);
        // Adiciona target="_blank" aos links criados
        setTimeout(() => {
          const links = editorRef.current.querySelectorAll('a');
          links.forEach(link => {
            if (!link.target) {
              link.target = '_blank';
            }
          });
          handleEditorChange();
        }, 0);
      }
    }
    
    setShowLinkDialog(false);
    setLinkUrl('');
    editorRef.current?.focus();
    handleEditorChange();
  };

  // Função para inserir imagem
  const handleInsertImage = () => {
    setShowImageDialog(true);
  };

  const confirmInsertImage = () => {
    if (!imageUrl.trim()) {
      toast({ title: 'URL inválida', description: 'Digite uma URL válida da imagem', variant: 'destructive' });
      return;
    }
    
    const url = imageUrl.startsWith('http://') || imageUrl.startsWith('https://') ? imageUrl : `https://${imageUrl}`;
    document.execCommand('insertImage', false, url);
    
    // Adiciona estilo às imagens
    setTimeout(() => {
      const images = editorRef.current.querySelectorAll('img');
      images.forEach(img => {
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        img.style.display = 'block';
        img.style.margin = '1rem 0';
      });
      handleEditorChange();
    }, 0);
    
    setShowImageDialog(false);
    setImageUrl('');
    editorRef.current?.focus();
    handleEditorChange();
  };

  // Função para indentação
  const changeIndent = (direction) => {
    if (!editorRef.current) return;
    if (direction === 'increase') {
      document.execCommand('indent', false, null);
    } else {
      document.execCommand('outdent', false, null);
    }
    editorRef.current.focus();
    handleEditorChange();
  };

  // Função para limpar formatação
  const clearFormatting = () => {
    if (!editorRef.current) return;
    document.execCommand('removeFormat', false, null);
    editorRef.current.focus();
    handleEditorChange();
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
    <div className="flex h-full min-h-0">
      <div className="w-1/4 border-r p-4 space-y-2 overflow-y-auto flex-shrink-0">
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
            <div className="flex items-center flex-1 min-w-0">
              <FileText className="mr-2 h-4 w-4 flex-shrink-0" />
              <span className="truncate">{doc.title || 'Sem título'}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700" title={doc.apexia_access ? 'ApexIA tem acesso' : 'ApexIA não tem acesso'}>
                <Bot className={`h-3.5 w-3.5 ${doc.apexia_access ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`} />
                <Switch
                  checked={doc.apexia_access || false}
                  onCheckedChange={() => handleToggleApexIAAccess(doc.id, doc.apexia_access || false)}
                  className="scale-75"
                />
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); handleDeleteDoc(doc.id); }}>
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="w-3/4 flex flex-col overflow-hidden min-h-0 flex-1">
        {selectedDoc ? (
          <div className="flex flex-col h-full px-12 py-8 min-h-0 overflow-hidden">
            <div className="flex-shrink-0">
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
              <div className="flex items-center gap-2 p-2 border rounded-md mb-4 bg-gray-50 dark:bg-gray-800 flex-wrap">
              {/* Estilo de Texto */}
              <Select value={textStyle} onValueChange={changeTextStyle}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue placeholder="Estilo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="p">Texto Normal</SelectItem>
                  <SelectItem value="1">Título 1</SelectItem>
                  <SelectItem value="2">Título 2</SelectItem>
                  <SelectItem value="3">Título 3</SelectItem>
                  <SelectItem value="4">Título 4</SelectItem>
                  <SelectItem value="5">Título 5</SelectItem>
                  <SelectItem value="6">Título 6</SelectItem>
                </SelectContent>
              </Select>

              <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-1" />

              {/* Família da Fonte */}
              <Select value={fontFamily} onValueChange={changeFontFamily}>
                <SelectTrigger className="w-[120px] h-8 text-xs">
                  <SelectValue placeholder="Fonte" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Arial">Arial</SelectItem>
                  <SelectItem value="Times New Roman">Times New Roman</SelectItem>
                  <SelectItem value="Georgia">Georgia</SelectItem>
                  <SelectItem value="Verdana">Verdana</SelectItem>
                  <SelectItem value="Courier New">Courier New</SelectItem>
                  <SelectItem value="Helvetica">Helvetica</SelectItem>
                  <SelectItem value="Comic Sans MS">Comic Sans MS</SelectItem>
                  <SelectItem value="Impact">Impact</SelectItem>
                </SelectContent>
              </Select>

              <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-1" />

              {/* Formatação de Texto */}
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => formatText('bold')}
                  className="h-8 w-8 p-0"
                  title="Negrito (Ctrl+B)"
                >
                  <Bold className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => formatText('italic')}
                  className="h-8 w-8 p-0"
                  title="Itálico (Ctrl+I)"
                >
                  <Italic className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => formatText('underline')}
                  className="h-8 w-8 p-0"
                  title="Sublinhado (Ctrl+U)"
                >
                  <Underline className="h-4 w-4" />
                </Button>
              </div>

              <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-1" />

              {/* Cor do Texto */}
              <div className="flex items-center gap-1">
                <label className="cursor-pointer">
                  <input
                    type="color"
                    value={textColor}
                    onChange={(e) => changeTextColor(e.target.value)}
                    className="hidden"
                    title="Cor do texto"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    title="Cor do texto"
                    onClick={(e) => {
                      e.preventDefault();
                      const input = e.currentTarget.parentElement.querySelector('input[type="color"]');
                      if (input) input.click();
                    }}
                  >
                    <Type className="h-4 w-4" style={{ color: textColor }} />
                  </Button>
                </label>
              </div>

              <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-1" />

              {/* Highlighter */}
              <div className="flex items-center gap-1">
                <label className="cursor-pointer">
                  <input
                    type="color"
                    value={highlightColor}
                    onChange={(e) => changeHighlightColor(e.target.value)}
                    className="hidden"
                    title="Cor de destaque"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    title="Destaque (marcador)"
                    onClick={(e) => {
                      e.preventDefault();
                      const input = e.currentTarget.parentElement.querySelector('input[type="color"]');
                      if (input) input.click();
                    }}
                  >
                    <Highlighter className="h-4 w-4" style={{ color: highlightColor }} />
                  </Button>
                </label>
              </div>

              <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-1" />
              
              {/* Tamanho da Fonte */}
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

              {/* Link */}
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleInsertLink}
                  className="h-8 w-8 p-0"
                  title="Inserir/Editar link"
                >
                  <Link className="h-4 w-4" />
                </Button>
              </div>

              <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-1" />

              {/* Imagem */}
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleInsertImage}
                  className="h-8 w-8 p-0"
                  title="Inserir imagem"
                >
                  <Image className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-1" />
              
              {/* Listas */}
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => formatText('insertUnorderedList')}
                  className="h-8 w-8 p-0"
                  title="Lista com marcadores"
                >
                  <List className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => formatText('insertOrderedList')}
                  className="h-8 w-8 p-0"
                  title="Lista numerada"
                >
                  <ListOrdered className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-1" />
              
              {/* Alinhamento */}
              <div className="flex items-center gap-1">
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

              <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-1" />

              {/* Indentação */}
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => changeIndent('decrease')}
                  className="h-8 w-8 p-0"
                  title="Diminuir recuo"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => changeIndent('increase')}
                  className="h-8 w-8 p-0"
                  title="Aumentar recuo"
                >
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-1" />

              {/* Limpar Formatação */}
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearFormatting}
                  className="h-8 w-8 p-0"
                  title="Limpar formatação"
                >
                  <Eraser className="h-4 w-4" />
                </Button>
              </div>
            </div>
            </div>

            {/* Editor de Texto Rico */}
            <div
              ref={editorRef}
              contentEditable
              onInput={handleEditorChange}
              onBlur={handleEditorChange}
              onKeyDown={handleKeyDown}
              className="flex-1 w-full rounded-md bg-background text-base leading-relaxed resize-none overflow-y-auto focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 min-h-0"
              style={{ 
                paddingLeft: '2rem', 
                paddingRight: '2rem', 
                paddingTop: '1.5rem', 
                paddingBottom: '1.5rem',
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
              
              [contenteditable] p {
                margin-bottom: 1rem;
                line-height: 1.6;
                min-height: 1.5em;
              }
              
              [contenteditable] p:last-child {
                margin-bottom: 0;
              }
              
              [contenteditable] ul,
              [contenteditable] ol {
                margin: 1rem 0;
                padding-left: 2rem;
                line-height: 1.6;
              }
              
              [contenteditable] li {
                margin-bottom: 0.5rem;
              }
              
              [contenteditable] strong {
                font-weight: 600;
              }
              
              [contenteditable] em {
                font-style: italic;
              }
              
              [contenteditable] u {
                text-decoration: underline;
              }
              
              [contenteditable]:focus {
                outline: none;
              }
              
              [contenteditable] * {
                word-wrap: break-word;
                overflow-wrap: break-word;
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

      {/* Dialog para Inserir/Editar Link */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Inserir/Editar Link</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="link-url">URL</Label>
              <Input
                id="link-url"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://exemplo.com"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    confirmInsertLink();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLinkDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmInsertLink}>
              Inserir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog para Inserir Imagem */}
      <Dialog open={showImageDialog} onOpenChange={setShowImageDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Inserir Imagem</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="image-url">URL da Imagem</Label>
              <Input
                id="image-url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://exemplo.com/imagem.jpg"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    confirmInsertImage();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImageDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmInsertImage}>
              Inserir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProjectDocuments;