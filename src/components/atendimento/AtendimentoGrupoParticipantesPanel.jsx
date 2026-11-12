import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Crown, Loader2, RefreshCw, Search, Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useAtendimentoGroupParticipants } from '@/hooks/useAtendimentoGroupParticipants';
import {
  participantAccentKey,
  participantDisplayLabel,
  participantSubtitle,
} from '@/lib/uazapiGroupParticipants';
import { groupSenderAccentColor } from '@/lib/atendimentoMessageUtils';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { normalizeWhatsappPhone, phonesMatch } from '@/lib/atendimentoGrupoIdentidade';

function initials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return '?';
}

function ParticipantRow({ participant, marked, saving, onToggle }) {
  const label = participantDisplayLabel(participant);
  const subtitle = participantSubtitle(participant);
  const accent = groupSenderAccentColor(participantAccentKey(participant));
  const phone = normalizeWhatsappPhone(participant.phone);
  const canMark = phone.length >= 12 && phone.length <= 13;

  return (
    <li className="wa-group-participant-row">
      <Avatar className="h-10 w-10 shrink-0">
        <AvatarImage src={participant.avatar_url || undefined} alt="" />
        <AvatarFallback className="text-xs" style={{ color: accent }}>
          {initials(label)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: accent }}>
            {label}
          </p>
          {(participant.is_super_admin || participant.is_admin) && (
            <Badge variant="secondary" className="wa-badge-sm shrink-0 gap-0.5 px-1.5">
              <Crown className="h-3 w-3" />
              {participant.is_super_admin ? 'Dono' : 'Admin'}
            </Badge>
          )}
        </div>
        {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
      </div>
      <Button
        type="button"
        size="sm"
        variant={marked ? 'default' : 'outline'}
        className="h-8 shrink-0 px-2 text-xs"
        disabled={!canMark || saving}
        title={canMark ? 'Mensagem deste número liga o Aguardando há' : 'Este participante não tem número de telefone'}
        onClick={() => onToggle(participant, !marked)}
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : marked ? 'Pede resposta' : 'Marcar'}
      </Button>
    </li>
  );
}

export default function AtendimentoGrupoParticipantesPanel({
  conversation,
  clienteId,
  autoLoad = true,
  className,
  compact = false,
}) {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [markedPhones, setMarkedPhones] = useState([]);
  const [savingPhone, setSavingPhone] = useState('');
  const { participants, groupName, loading, error, loadedOnce, load, refresh } =
    useAtendimentoGroupParticipants({
      conversation,
      clienteId,
      enabled: autoLoad,
    });

  const loadMarks = useCallback(async () => {
    if (!clienteId || !conversation?.chat_jid) {
      setMarkedPhones([]);
      return;
    }
    const { data, error: markError } = await supabase
      .from('atendimento_grupo_contato_resposta')
      .select('phone')
      .eq('cliente_id', clienteId)
      .eq('chat_jid', conversation.chat_jid);
    if (markError) return;
    setMarkedPhones((data || []).map((row) => row.phone).filter(Boolean));
  }, [clienteId, conversation?.chat_jid]);

  useEffect(() => {
    if (autoLoad && conversation?.is_group) load();
  }, [autoLoad, conversation?.id, conversation?.is_group, load]);

  useEffect(() => {
    if (conversation?.is_group) loadMarks();
  }, [conversation?.is_group, loadMarks]);

  const toggleMark = async (participant, next) => {
    const phone = normalizeWhatsappPhone(participant.phone);
    if (!clienteId || !conversation?.chat_jid || phone.length < 12) return;
    setSavingPhone(phone);
    const label = participantDisplayLabel(participant);
    const result = next
      ? await supabase.from('atendimento_grupo_contato_resposta').upsert(
          {
            cliente_id: clienteId,
            chat_jid: conversation.chat_jid,
            phone,
            label,
          },
          { onConflict: 'cliente_id,chat_jid,phone' },
        )
      : await supabase
          .from('atendimento_grupo_contato_resposta')
          .delete()
          .eq('cliente_id', clienteId)
          .eq('chat_jid', conversation.chat_jid)
          .eq('phone', phone);
    setSavingPhone('');
    if (result.error) {
      toast({ variant: 'destructive', title: 'Não salvou a marca', description: result.error.message });
      return;
    }
    setMarkedPhones((prev) => (next ? [...new Set([...prev, phone])] : prev.filter((item) => !phonesMatch(item, phone))));
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return participants;
    return participants.filter((p) => {
      const label = participantDisplayLabel(p).toLowerCase();
      const sub = (participantSubtitle(p) || '').toLowerCase();
      const phone = String(p.phone || '');
      return label.includes(q) || sub.includes(q) || phone.includes(q);
    });
  }, [participants, search]);

  if (!conversation?.is_group) return null;

  return (
    <div className={cn('flex flex-col min-h-0', className)}>
      <div className={cn('wa-side-section space-y-3', compact && 'mx-0')}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="wa-side-section-title mb-0 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Participantes
            </p>
            <p className="wa-text-caption mt-1">
              {loadedOnce
                ? `${participants.length} no grupo${groupName ? ` · ${groupName}` : ''}. Marque quem precisa de resposta rápida.`
                : 'Lista completa via WhatsApp'}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={refresh}
            disabled={loading}
            title="Atualizar lista"
            aria-label="Atualizar participantes"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar participante…"
            className="h-9 pl-8 text-sm"
          />
        </div>

        {loading && !loadedOnce && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando participantes…
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <p className="text-destructive">{error}</p>
            <Button type="button" size="sm" variant="outline" className="mt-2" onClick={refresh}>
              Tentar novamente
            </Button>
          </div>
        )}

        {!loading && loadedOnce && filtered.length === 0 && (
          <p className="wa-text-caption text-center py-6">
            {search ? 'Nenhum participante encontrado.' : 'Nenhum participante retornado.'}
          </p>
        )}

        {filtered.length > 0 && (
          <ul className="wa-group-participant-list max-h-[min(60vh,420px)] overflow-y-auto -mx-1 px-1">
            {filtered.map((p) => {
              const phone = normalizeWhatsappPhone(p.phone);
              return (
                <ParticipantRow
                  key={p.from_jid || p.jid || p.lid || p.phone}
                  participant={p}
                  marked={markedPhones.some((item) => phonesMatch(item, phone))}
                  saving={Boolean(phone) && savingPhone === phone}
                  onToggle={toggleMark}
                />
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
