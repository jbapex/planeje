import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Eraser,
  ImagePlus,
  Indent,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Outdent,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { plainTextToRichHtml, richTextValueToHtml, sanitizeRichTextHtml } from '@/lib/richText';

function ToolbarButton({ label, active = false, onAction, children }) {
  return <Button
    type="button"
    variant={active ? 'secondary' : 'ghost'}
    size="icon"
    className="h-8 w-8 shrink-0"
    aria-label={label}
    title={label}
    onMouseDown={(event) => event.preventDefault()}
    onClick={onAction}
  >{children}</Button>;
}

const safeUrl = (value, image = false) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const candidate = /^(https?:\/\/|mailto:|tel:)/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    if (image && !['http:', 'https:'].includes(url.protocol)) return '';
    if (!image && !['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol)) return '';
    return url.href;
  } catch {
    return '';
  }
};

export default function PlanRichTextEditor({ value, onChange, placeholder, ariaLabel = 'Editor do plano mensal' }) {
  const editorRef = useRef(null);
  const selectionRef = useRef(null);
  const lastEmittedRef = useRef(null);
  const [active, setActive] = useState({});
  const [insertType, setInsertType] = useState(null);
  const [insertUrl, setInsertUrl] = useState('');

  const selectionIsInside = useCallback((range) => {
    const editor = editorRef.current;
    return Boolean(editor && range && editor.contains(range.commonAncestorContainer));
  }, []);

  const saveSelection = useCallback(() => {
    const selection = window.getSelection();
    if (selection?.rangeCount) {
      const range = selection.getRangeAt(0);
      if (selectionIsInside(range)) selectionRef.current = range.cloneRange();
    }
  }, [selectionIsInside]);

  const restoreSelection = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return false;
    editor.focus();
    const range = selectionRef.current;
    if (!range) return false;
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }, []);

  const refreshActive = useCallback(() => {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !selectionIsInside(selection.getRangeAt(0))) return;
    setActive({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      strikeThrough: document.queryCommandState('strikeThrough'),
      insertUnorderedList: document.queryCommandState('insertUnorderedList'),
      insertOrderedList: document.queryCommandState('insertOrderedList'),
    });
  }, [selectionIsInside]);

  const emitChange = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const html = sanitizeRichTextHtml(editor.innerHTML);
    const currentHtml = richTextValueToHtml(value);
    if (html === currentHtml || html === lastEmittedRef.current) {
      saveSelection();
      refreshActive();
      return;
    }
    lastEmittedRef.current = html;
    onChange(html);
    saveSelection();
    refreshActive();
  }, [onChange, refreshActive, saveSelection, value]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || value === lastEmittedRef.current) return;
    const html = richTextValueToHtml(value);
    if (editor.innerHTML !== html) editor.innerHTML = html;
  }, [value]);

  useEffect(() => {
    const handleSelection = () => { saveSelection(); refreshActive(); };
    document.addEventListener('selectionchange', handleSelection);
    return () => document.removeEventListener('selectionchange', handleSelection);
  }, [refreshActive, saveSelection]);

  const command = (name, commandValue = null) => {
    restoreSelection();
    document.execCommand(name, false, commandValue);
    emitChange();
  };

  const openInsertDialog = (type) => {
    saveSelection();
    setInsertUrl('');
    setInsertType(type);
  };

  const confirmInsert = () => {
    const url = safeUrl(insertUrl, insertType === 'image');
    if (!url) return;
    const restored = restoreSelection();
    const selection = window.getSelection();
    if (insertType === 'link') {
      if (restored && selection && !selection.isCollapsed) document.execCommand('createLink', false, url);
      else document.execCommand('insertHTML', false, `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
    } else {
      document.execCommand('insertHTML', false, `<p><img src="${url}" alt="Imagem do plano" style="max-width:100%;height:auto"></p>`);
    }
    setInsertType(null);
    setInsertUrl('');
    emitChange();
  };

  const handlePaste = (event) => {
    event.preventDefault();
    const editor = editorRef.current;
    if (!editor) return;
    const html = event.clipboardData.getData('text/html');
    const text = event.clipboardData.getData('text/plain');
    const payload = html
      ? sanitizeRichTextHtml(html)
      : plainTextToRichHtml(text);
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    let replaceAll = !editor.textContent?.replace(/\u200B/g, '').trim() && !editor.querySelector('img');

    if (range && selectionIsInside(range)) {
      const before = range.cloneRange();
      before.selectNodeContents(editor);
      before.setEnd(range.startContainer, range.startOffset);
      const after = range.cloneRange();
      after.selectNodeContents(editor);
      after.setStart(range.endContainer, range.endOffset);
      replaceAll = replaceAll || (!before.toString().replace(/\u200B/g, '').trim() && !after.toString().replace(/\u200B/g, '').trim());
    }

    if (replaceAll) {
      editor.innerHTML = payload;
      const caret = document.createRange();
      caret.selectNodeContents(editor);
      caret.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(caret);
    } else {
      document.execCommand('insertHTML', false, payload);
    }
    emitChange();
  };

  const selectClass = 'h-8 shrink-0 rounded-md border border-input bg-background px-2 text-xs';

  return <>
    <div className="overflow-hidden rounded-lg border bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
      <div className="flex items-center gap-1 overflow-x-auto border-b bg-muted/40 p-2" role="toolbar" aria-label="Formatação do plano">
        <select aria-label="Estilo do texto" className={`${selectClass} w-28`} defaultValue="p" onMouseDown={saveSelection} onChange={(event) => command('formatBlock', event.target.value)}>
          <option value="p">Texto normal</option>
          <option value="h1">Título 1</option>
          <option value="h2">Título 2</option>
          <option value="h3">Título 3</option>
          <option value="blockquote">Citação</option>
        </select>
        <select aria-label="Fonte" className={`${selectClass} w-24`} defaultValue="Arial" onMouseDown={saveSelection} onChange={(event) => command('fontName', event.target.value)}>
          <option value="Arial">Arial</option>
          <option value="Georgia">Georgia</option>
          <option value="Verdana">Verdana</option>
          <option value="Courier New">Courier</option>
        </select>
        <select aria-label="Tamanho da fonte" className={`${selectClass} w-20`} defaultValue="3" onMouseDown={saveSelection} onChange={(event) => command('fontSize', event.target.value)}>
          <option value="2">Pequena</option>
          <option value="3">Normal</option>
          <option value="5">Grande</option>
          <option value="7">Enorme</option>
        </select>
        <span className="mx-1 h-6 w-px shrink-0 bg-border" />
        <ToolbarButton label="Negrito" active={active.bold} onAction={() => command('bold')}><Bold className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Itálico" active={active.italic} onAction={() => command('italic')}><Italic className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Sublinhado" active={active.underline} onAction={() => command('underline')}><Underline className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Tachado" active={active.strikeThrough} onAction={() => command('strikeThrough')}><Strikethrough className="h-4 w-4" /></ToolbarButton>
        <span className="mx-1 h-6 w-px shrink-0 bg-border" />
        <ToolbarButton label="Lista com marcadores" active={active.insertUnorderedList} onAction={() => command('insertUnorderedList')}><List className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Lista numerada" active={active.insertOrderedList} onAction={() => command('insertOrderedList')}><ListOrdered className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Citação" onAction={() => command('formatBlock', 'blockquote')}><Quote className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Linha horizontal" onAction={() => command('insertHorizontalRule')}><Minus className="h-4 w-4" /></ToolbarButton>
        <span className="mx-1 h-6 w-px shrink-0 bg-border" />
        <ToolbarButton label="Alinhar à esquerda" onAction={() => command('justifyLeft')}><AlignLeft className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Centralizar" onAction={() => command('justifyCenter')}><AlignCenter className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Alinhar à direita" onAction={() => command('justifyRight')}><AlignRight className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Justificar" onAction={() => command('justifyFull')}><AlignJustify className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Diminuir recuo" onAction={() => command('outdent')}><Outdent className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Aumentar recuo" onAction={() => command('indent')}><Indent className="h-4 w-4" /></ToolbarButton>
        <span className="mx-1 h-6 w-px shrink-0 bg-border" />
        <ToolbarButton label="Inserir link" onAction={() => openInsertDialog('link')}><Link2 className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Inserir imagem por endereço" onAction={() => openInsertDialog('image')}><ImagePlus className="h-4 w-4" /></ToolbarButton>
        <label className="flex h-8 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md border" title="Cor do texto">
          <span className="sr-only">Cor do texto</span><input type="color" aria-label="Cor do texto" className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0" defaultValue="#111827" onMouseDown={saveSelection} onChange={(event) => command('foreColor', event.target.value)} />
        </label>
        <label className="flex h-8 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md border" title="Cor de destaque">
          <span className="sr-only">Cor de destaque</span><input type="color" aria-label="Cor de destaque" className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0" defaultValue="#fff59d" onMouseDown={saveSelection} onChange={(event) => command('hiliteColor', event.target.value)} />
        </label>
        <span className="mx-1 h-6 w-px shrink-0 bg-border" />
        <ToolbarButton label="Desfazer" onAction={() => command('undo')}><Undo2 className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Refazer" onAction={() => command('redo')}><Redo2 className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Limpar formatação" onAction={() => command('removeFormat')}><Eraser className="h-4 w-4" /></ToolbarButton>
      </div>
      <div
        ref={editorRef}
        className="plan-rich-editor min-h-[360px] w-full px-6 py-5 text-base leading-relaxed outline-none [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:pl-4 [&_blockquote]:italic [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_h1]:mb-4 [&_h1]:text-3xl [&_h1]:font-bold [&_h2]:mb-3 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:text-xl [&_h3]:font-semibold [&_h4]:mb-2 [&_h4]:text-lg [&_h4]:font-semibold [&_h5]:mb-2 [&_h5]:font-semibold [&_h6]:mb-2 [&_h6]:font-semibold [&_hr]:my-5 [&_img]:my-4 [&_img]:max-w-full [&_li]:my-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-7 [&_p]:mb-3 [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-3 [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:bg-muted [&_th]:p-2 [&_th]:text-left [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-7"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label={ariaLabel}
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={emitChange}
        onBlur={() => { saveSelection(); emitChange(); }}
        onKeyUp={() => { saveSelection(); refreshActive(); }}
        onMouseUp={() => { saveSelection(); refreshActive(); }}
        onPaste={handlePaste}
      />
    </div>
    <style>{`.plan-rich-editor:empty::before{content:attr(data-placeholder);color:hsl(var(--muted-foreground));pointer-events:none;white-space:pre-line}.plan-rich-editor font[size="2"]{font-size:.875rem}.plan-rich-editor font[size="3"]{font-size:1rem}.plan-rich-editor font[size="5"]{font-size:1.5rem}.plan-rich-editor font[size="7"]{font-size:2rem}`}</style>

    <Dialog open={Boolean(insertType)} onOpenChange={(open) => { if (!open) setInsertType(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{insertType === 'image' ? 'Inserir imagem' : 'Inserir link'}</DialogTitle>
          <DialogDescription>{insertType === 'image' ? 'Cole o endereço público da imagem.' : 'Selecione um texto antes de abrir para aplicar o link nele, ou insira o endereço como novo texto.'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2"><Label htmlFor="plan-insert-url">Endereço</Label><Input id="plan-insert-url" autoFocus value={insertUrl} onChange={(event) => setInsertUrl(event.target.value)} placeholder="https://..." onKeyDown={(event) => { if (event.key === 'Enter') confirmInsert(); }} /></div>
        <DialogFooter><Button variant="outline" onClick={() => setInsertType(null)}>Cancelar</Button><Button disabled={!insertUrl.trim()} onClick={confirmInsert}>Inserir</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
