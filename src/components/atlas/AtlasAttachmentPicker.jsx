import React, { useEffect, useId, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { validateAtlasAttachments } from '../../lib/atlasAttachments.js';

const EMPTY_FILES = [];
const ACCEPT = '.pdf,.docx,.txt,.md,.csv,.png,.jpg,.jpeg,.webp';
const sizeLabel = size => size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MiB` : `${Math.max(1, Math.ceil(size / 1024))} KiB`;

/** Selection only. Uploading and the immutable request manifest belong to the caller. */
export default function AtlasAttachmentPicker({ files = EMPTY_FILES, onChange, disabled = false, error = '' }) {
  const id = useId(), input = useRef(null), epoch = useRef(0), current = useRef(null);
  const [validationError, setValidationError] = useState('');
  const [validating, setValidating] = useState(false);
  current.current = { files, onChange, disabled };
  useEffect(() => () => { epoch.current++; }, []);
  const alert = validationError || error;
  const describedBy = `${id}-hint${alert ? ` ${id}-error` : ''}`;

  async function select(event) {
    const target = event.currentTarget || event.target;
    const selected = Array.from(target.files || []);
    target.value = '';
    if (!selected.length || current.current.disabled) return;
    const revision = ++epoch.current, previous = current.current.files;
    setValidationError(''); setValidating(true);
    try {
      const next = [...previous, ...selected.map(file => ({ id: globalThis.crypto.randomUUID(), file }))];
      await validateAtlasAttachments(next);
      if (epoch.current === revision && current.current.files === previous && !current.current.disabled) current.current.onChange(next);
    } catch (failure) {
      if (epoch.current === revision && current.current.files === previous && !current.current.disabled) setValidationError(failure?.message || 'Não foi possível conferir estes arquivos.');
    } finally { if (epoch.current === revision) setValidating(false); }
  }
  function remove(attachmentId) {
    if (disabled) return;
    epoch.current++; setValidating(false); setValidationError('');
    onChange(files.filter(item => item.id !== attachmentId));
  }

  return <div className="atlas-attachment-picker min-w-0 space-y-2" role="group" aria-label="Arquivos do pedido" aria-busy={validating}>
    <input ref={input} id={id} hidden type="file" multiple accept={ACCEPT} disabled={disabled || validating} aria-label="Selecionar arquivos" aria-describedby={describedBy} onChange={select} />
    <button type="button" className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50" onClick={() => input.current?.click()} disabled={disabled || validating} aria-label="Anexar arquivos" title="Anexar PDF, DOCX, TXT, MD, CSV ou imagem" aria-describedby={describedBy}>
      <Plus aria-hidden="true" size={18} /><span className="sr-only">Anexar arquivos</span>
    </button>
    <p id={`${id}-hint`} className="sr-only">Até 4 arquivos e 10 MiB. PDF, DOCX, TXT, MD, CSV, PNG, JPG ou WEBP. DOCX e texto: até 512 KiB; PDF e imagens: até 5 MiB.</p>
    {files.length > 0 && <ul className="flex min-w-0 flex-wrap gap-2" aria-label="Arquivos selecionados">
      {files.map(item => <li key={item.id} className="flex max-w-full min-w-0 items-center gap-2 rounded-lg border bg-muted/30 px-2 py-1.5 text-xs">
        <span className="min-w-0 truncate" title={item.file.name}>{item.file.name}</span>
        <span className="shrink-0 text-muted-foreground">{sizeLabel(item.file.size)}</span>
        <button type="button" className="shrink-0 rounded p-1 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50" aria-label={`Remover ${item.file.name}`} disabled={disabled} onClick={() => remove(item.id)}><X size={14} aria-hidden="true" /></button>
      </li>)}
    </ul>}
    {validating && <p role="status" className="text-xs text-muted-foreground">Conferindo arquivos…</p>}
    {alert && <p id={`${id}-error`} role="alert" className="text-xs text-destructive">{alert}</p>}
  </div>;
}
