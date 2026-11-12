import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Phone } from 'lucide-react';
import { formatBrazilPhone } from '@/lib/groupParticipantDisplay';
import { normalizeWhatsappPhone, rowForUser } from '@/lib/atendimentoGrupoIdentidade';

const AGENCY_NOTE = 'Equipe da agência nos grupos';

export default function AtendimentoEquipeNumerosCard() {
  const { toast } = useToast();
  const [users, setUsers] = useState([]);
  const [rows, setRows] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [usersRes, rowsRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, role')
        .in('role', ['superadmin', 'admin', 'colaborador'])
        .order('full_name'),
      supabase
        .from('atendimento_grupo_remetente_interno')
        .select('id, label, phone, name_match, profile_id, sender_jid, notes, cliente_id')
        .is('cliente_id', null)
        .order('label'),
    ]);
    setLoading(false);
    if (usersRes.error || rowsRes.error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar os números da equipe',
        description: usersRes.error?.message || rowsRes.error?.message,
      });
      return;
    }
    const nextUsers = usersRes.data || [];
    const nextRows = rowsRes.data || [];
    setUsers(nextUsers);
    setRows(nextRows);
    const nextDrafts = {};
    nextUsers.forEach((user) => {
      const row = rowForUser(nextRows, user);
      nextDrafts[user.id] = row?.phone ? formatBrazilPhone(row.phone) || row.phone : '';
    });
    setDrafts(nextDrafts);
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const saveUser = async (user) => {
    const phone = normalizeWhatsappPhone(drafts[user.id]);
    const existing = rowForUser(rows, user);
    if (!phone && !existing) return;
    if (phone && (phone.length < 12 || phone.length > 13)) {
      toast({ variant: 'destructive', title: 'Informe o WhatsApp com DDD' });
      return;
    }
    setSavingId(user.id);
    const first = String(user.full_name || '').trim().split(/\s+/)[0] || 'Equipe';
    let error = null;
    if (!phone && existing?.id) {
      const removed = await supabase.from('atendimento_grupo_remetente_interno').delete().eq('id', existing.id);
      error = removed.error;
    } else if (existing?.id) {
      const updated = await supabase
        .from('atendimento_grupo_remetente_interno')
        .update({
          profile_id: user.id,
          label: user.full_name || existing.label,
          phone,
          name_match: first.toLowerCase(),
          sender_jid: `${phone}@s.whatsapp.net`,
          notes: AGENCY_NOTE,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      error = updated.error;
    } else {
      const payload = {
        profile_id: user.id,
        label: user.full_name || first,
        phone,
        name_match: first.toLowerCase(),
        sender_jid: `${phone}@s.whatsapp.net`,
        notes: AGENCY_NOTE,
        updated_at: new Date().toISOString(),
      };
      const inserted = await supabase.from('atendimento_grupo_remetente_interno').insert({
        ...payload,
        cliente_id: null,
      });
      error = inserted.error;
      if (error && /duplicate|unique/i.test(error.message || '')) {
        const taken = await supabase
          .from('atendimento_grupo_remetente_interno')
          .update(payload)
          .eq('phone', phone)
          .is('cliente_id', null);
        error = taken.error;
      }
    }
    setSavingId('');
    if (error) {
      toast({ variant: 'destructive', title: 'Não salvou o número', description: error.message });
      return;
    }
    toast({
      title: phone ? 'Número ligado ao usuário' : 'Número retirado',
      description: user.full_name || '',
    });
    load();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Phone className="h-4 w-4" />
          WhatsApp de cada usuário
        </CardTitle>
        <CardDescription>
          O número pessoal de quem atende. Se a pessoa responder pelo WhatsApp do celular, o grupo reconhece esse usuário e o Aguardando há para.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando…
          </div>
        ) : (
          <ul className="divide-y rounded-lg border">
            {users.map((user) => (
              <li key={user.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 sm:w-56">
                  <p className="truncate text-sm font-medium">{user.full_name || 'Sem nome'}</p>
                  <p className="text-xs capitalize text-muted-foreground">{user.role}</p>
                </div>
                <Input
                  value={drafts[user.id] || ''}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [user.id]: e.target.value }))}
                  placeholder="41 99999-9999"
                  inputMode="tel"
                  aria-label={`WhatsApp de ${user.full_name || 'usuário'}`}
                  className="sm:max-w-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => saveUser(user)}
                  disabled={savingId === user.id}
                >
                  {savingId === user.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
