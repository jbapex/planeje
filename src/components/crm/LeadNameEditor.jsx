import React, { useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { normalizeLeadName } from '@/lib/miniCrm';

export default function LeadNameEditor({ name, onSave, onEditingChange }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const input = useRef(null);
  useEffect(() => { if (editing) { input.current?.focus();input.current?.select(); } }, [editing]);
  const close = () => {setEditing(false);onEditingChange?.(false);};
  const start = () => {setDraft(name || '');setEditing(true);onEditingChange?.(true);};
  const save = async () => {
    const value = normalizeLeadName(draft);
    if (busy.current || !value || value.length > 160) return;
    if (value === normalizeLeadName(name)) {close();return;}
    busy.current = true;setSaving(true);
    try {
      const saved = await onSave(value);
      if (saved === false) return;
      close();toast({title:'Nome atualizado'});
    } catch (error) {toast({variant:'destructive',title:'Não salvou o nome',description:error?.message || 'Tente novamente.'});}
    finally {busy.current = false;setSaving(false);}
  };
  if (!editing) return <button type="button" className="rt-lead-name-edit" aria-label="Editar nome do lead" onClick={start}><Pencil size={13} />Editar nome</button>;
  return <div className="rt-lead-name-editor" onKeyDown={(event) => {
    if (event.key === 'Escape') {event.preventDefault();event.stopPropagation();if (!busy.current) close();}
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {event.preventDefault();void save();}
  }}>
    <label>Nome do lead<input ref={input} value={draft} maxLength={160} disabled={saving} onChange={(event) => setDraft(event.target.value)} autoComplete="off" /></label>
    <div><button type="button" className="rt-lead-name-save" disabled={saving || !normalizeLeadName(draft)} onClick={() => void save()}>{saving ? 'Salvando…' : 'Salvar nome'}</button><button type="button" disabled={saving} onClick={close}>Cancelar</button></div>
  </div>;
}
