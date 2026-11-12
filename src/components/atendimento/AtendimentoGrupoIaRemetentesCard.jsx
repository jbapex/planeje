import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Bot, Loader2, Plus, Trash2 } from 'lucide-react';

const AGENCY_NOTE = 'Equipe da agência nos grupos';

function digitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function dedupeByPhone(rows = []) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = row.phone || row.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function AtendimentoGrupoIaRemetentesCard({ clienteId = null, agencyWide = false }) {
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState('');
  const [phone, setPhone] = useState('');
  const [nameMatch, setNameMatch] = useState('');
  const isAgency = Boolean(agencyWide) || !clienteId;
  const fieldId = isAgency ? 'agencia' : 'cliente';

  const load = useCallback(async () => {
    if (!isAgency && !clienteId) {
      setRows([]);
      return;
    }
    setLoading(true);
    let query = supabase.from('atendimento_grupo_remetente_interno').select('*').order('label');
    if (isAgency) {
      const { data: globalRows, error: globalErr } = await query.is('cliente_id', null);
      if (globalErr) {
        setLoading(false);
        toast({ variant: 'destructive', title: 'Erro ao carregar remetentes', description: globalErr.message });
        return;
      }
      if (globalRows?.length) {
        setLoading(false);
        setRows(globalRows);
        return;
      }
      const { data: copies, error: copyErr } = await supabase
        .from('atendimento_grupo_remetente_interno')
        .select('*')
        .eq('notes', AGENCY_NOTE)
        .order('label');
      setLoading(false);
      if (copyErr) {
        toast({ variant: 'destructive', title: 'Erro ao carregar remetentes', description: copyErr.message });
        return;
      }
      setRows(dedupeByPhone(copies || []));
      return;
    }
    const { data, error } = await query.eq('cliente_id', clienteId);
    setLoading(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao carregar remetentes', description: error.message });
      return;
    }
    setRows((data || []).filter((row) => row.notes !== AGENCY_NOTE));
  }, [clienteId, isAgency, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async () => {
    if ((!isAgency && !clienteId) || !label.trim()) {
      toast({ variant: 'destructive', title: 'Informe um nome/identificação' });
      return;
    }
    const phoneDigits = digitsOnly(phone);
    const name = nameMatch.trim();
    if (!phoneDigits && !name) {
      toast({
        variant: 'destructive',
        title: 'Telefone ou nome no WhatsApp',
        description: 'Informe ao menos um para a IA reconhecer o remetente.',
      });
      return;
    }

    setSaving(true);
    const payload = {
      label: label.trim(),
      phone: phoneDigits || null,
      name_match: name || null,
      sender_jid: phoneDigits ? `${phoneDigits}@s.whatsapp.net` : null,
      notes: isAgency ? AGENCY_NOTE : null,
    };

    let error = null;
    if (isAgency) {
      const globalTry = await supabase
        .from('atendimento_grupo_remetente_interno')
        .insert({ ...payload, cliente_id: null });
      if (globalTry.error && /not-null|null value/i.test(globalTry.error.message)) {
        const { data: clientes, error: clientesErr } = await supabase.from('clientes').select('id');
        if (clientesErr) {
          error = clientesErr;
        } else {
          const rowsToInsert = (clientes || []).map((c) => ({ ...payload, cliente_id: c.id }));
          const fanout = await supabase.from('atendimento_grupo_remetente_interno').insert(rowsToInsert);
          error = fanout.error;
        }
      } else {
        error = globalTry.error;
      }
    } else {
      const result = await supabase
        .from('atendimento_grupo_remetente_interno')
        .insert({ ...payload, cliente_id: clienteId });
      error = result.error;
    }
    setSaving(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: error.message });
      return;
    }
    setLabel('');
    setPhone('');
    setNameMatch('');
    toast({ title: 'Remetente interno adicionado' });
    load();
  };

  const handleDelete = async (id) => {
    const row = rows.find((r) => r.id === id);
    let error = null;
    if (isAgency && row?.phone) {
      const byPhone = await supabase
        .from('atendimento_grupo_remetente_interno')
        .delete()
        .eq('phone', row.phone)
        .eq('notes', AGENCY_NOTE);
      error = byPhone.error;
      if (!error) {
        await supabase.from('atendimento_grupo_remetente_interno').delete().eq('phone', row.phone).is('cliente_id', null);
      }
    } else {
      const result = await supabase.from('atendimento_grupo_remetente_interno').delete().eq('id', id);
      error = result.error;
    }
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao remover', description: error.message });
      return;
    }
    toast({ title: 'Removido' });
    load();
  };

  if (!isAgency && !clienteId) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Bot className="h-4 w-4" />
          {isAgency ? 'Equipe da agência nos grupos' : 'IA em grupos — equipe deste cliente'}
        </CardTitle>
        <CardDescription>
          {isAgency
            ? 'Telefones da equipe que entram em qualquer grupo. A IA não trata mensagem dessas pessoas como pedido do cliente.'
            : 'Cadastre a equipe do cliente neste grupo. A IA não marca "aguardando resposta" quando elas mandam mensagem.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 sm:items-end">
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
            <Label htmlFor={`grupo-ia-${fieldId}-label`}>Nome / identificação</Label>
            <Input
              id={`grupo-ia-${fieldId}-label`}
              placeholder={isAgency ? 'Ex.: Gabriel — Equipe' : 'Ex.: Maria — Cliente'}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`grupo-ia-${fieldId}-phone`}>Telefone (opcional)</Label>
            <Input
              id={`grupo-ia-${fieldId}-phone`}
              placeholder="5541999998888"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`grupo-ia-${fieldId}-name`}>Nome no WhatsApp (opcional)</Label>
            <Input
              id={`grupo-ia-${fieldId}-name`}
              placeholder={isAgency ? 'Ex.: gabriel' : 'Ex.: Maria JB'}
              value={nameMatch}
              onChange={(e) => setNameMatch(e.target.value)}
            />
          </div>
          <Button onClick={handleAdd} disabled={saving || !label.trim()} className="w-full sm:w-auto">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
            Adicionar
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Use telefone <strong>ou</strong> nome como aparece no grupo. O telefone com DDI (55) é o jeito mais seguro.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando…
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground rounded-lg border border-dashed p-6 text-center">
            {isAgency
              ? 'Ninguém da agência cadastrado. Sem isso, a IA pode tratar mensagem da equipe como pedido do cliente.'
              : 'Nenhum remetente interno deste cliente. Sem isso, a IA tenta adivinhar pelo contexto.'}
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{row.label}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {[row.phone && `Tel. ${row.phone}`, row.name_match && `WhatsApp: ${row.name_match}`]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 h-8 w-8"
                  onClick={() => handleDelete(row.id)}
                  title="Remover"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
