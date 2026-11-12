import React, { lazy, Suspense, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useGestorRead } from '@/components/gestor-ia/gestorIaReads';
import { supabase } from '@/lib/customSupabaseClient';
import { saveClienteForm } from '@/lib/clienteSave';
import { whatsappGroupChannelLabel } from '@/lib/clienteWhatsappGrupo';
import { loadCsPeople } from './csIaData';

const ClientForm = lazy(() => import('@/components/forms/ClientForm'));

export default function CsIaCreateClientFromGroup({ group, store, onClose, onSaved }) {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [id] = useState(() => crypto.randomUUID());
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const people = useGestorRead(store, 'responsaveis-novo-cliente-cs', Boolean(profile?.id),
    () => loadCsPeople(supabase, profile, []));

  async function save(clientData, isNew) {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setError('');
    try {
      const result = await saveClienteForm({ clientData, isNew, userId: user?.id, csGroupDraft: { id, group } });
      if (result.error) {
        setError(result.error.message);
        return;
      }
      await onSaved();
      toast({ title: 'Cliente criado e grupo vinculado',
        description: result.dropped.includes('cnpj_cpf') ? 'O CNPJ/CPF ainda não está disponível neste cadastro.' : undefined });
      navigate(`/cs-ia/clientes/${encodeURIComponent(result.savedId)}?aba=conversas`);
    } catch {
      setError('Não foi possível confirmar o cadastro. Tente novamente.');
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !pending.current) onClose(); }}>
    <DialogContent className="flex max-h-[92dvh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
      <DialogHeader className="border-b px-6 py-5 pr-12">
        <DialogTitle>Criar cliente deste grupo</DialogTitle>
        <DialogDescription>{group.display_name} · {whatsappGroupChannelLabel(group)}. O grupo será vinculado ao novo cliente ativo.</DialogDescription>
      </DialogHeader>
      {people.error ? <div className="space-y-3 p-6"><p role="alert">Não foi possível consultar os responsáveis.</p>
        <button type="button" className="underline" onClick={() => people.reload()}>Tentar novamente</button>
      </div> : !people.data ? <p role="status" className="p-6">Carregando responsáveis…</p>
        : <Suspense fallback={<p role="status" className="p-6">Carregando cadastro de Clientes…</p>}>
          <ClientForm users={people.data} onClose={onClose} onSave={save} groupDraft={{ suggestedName: group.display_name, saving, error }} />
        </Suspense>}
    </DialogContent>
  </Dialog>;
}
