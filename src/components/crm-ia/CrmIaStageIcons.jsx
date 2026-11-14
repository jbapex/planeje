import React, { useState } from 'react';
import { Archive, Building2, Calendar, CheckCircle2, Circle, ClipboardList, Clock, CreditCard, FileSignature, FileText, Filter, Flag, Globe, Heart, Hourglass, Inbox, ListChecks, Mail, MapPin, MessageCircle, Pause, Phone, Receipt, RotateCcw, Star, Store, Tag, Target, ThumbsUp, User, UserPlus, XCircle } from 'lucide-react';
import WhatsAppIcon from '@/components/icons/WhatsAppIcon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const GROUPS = [
  ['Entrada', [['inbox', Inbox, 'Caixa de entrada'], ['user-plus', UserPlus, 'Novo contato'], ['globe', Globe, 'Site']]],
  ['Contato', [['message-circle', MessageCircle, 'Conversa'], ['phone', Phone, 'Ligação'], ['whatsapp', WhatsAppIcon, 'WhatsApp'], ['mail', Mail, 'E-mail']]],
  ['Qualificação', [['target', Target, 'Alvo'], ['list-checks', ListChecks, 'Lista'], ['filter', Filter, 'Funil'], ['star', Star, 'Estrela']]],
  ['Agendamento', [['calendar', Calendar, 'Calendário'], ['clock', Clock, 'Relógio'], ['hourglass', Hourglass, 'Ampulheta'], ['map-pin', MapPin, 'Local'], ['building-2', Building2, 'Empresa']]],
  ['Proposta', [['file-text', FileText, 'Documento'], ['file-signature', FileSignature, 'Contrato'], ['receipt', Receipt, 'Recibo'], ['clipboard-list', ClipboardList, 'Prancheta']]],
  ['Negociação', [['credit-card', CreditCard, 'Pagamento'], ['tag', Tag, 'Etiqueta'], ['store', Store, 'Loja']]],
  ['Retomada', [['rotate-ccw', RotateCcw, 'Retomada'], ['pause', Pause, 'Pausa']]],
  ['Ganho', [['check-circle', CheckCircle2, 'Concluído'], ['thumbs-up', ThumbsUp, 'Aprovado']]],
  ['Perda', [['x-circle', XCircle, 'Perdido'], ['archive', Archive, 'Arquivado']]],
  ['Outros ícones', [['circle', Circle, 'Círculo'], ['user', User, 'Pessoa'], ['flag', Flag, 'Bandeira'], ['heart', Heart, 'Coração']]],
];

export const STAGE_ICONS = Object.fromEntries(GROUPS.flatMap(([, icons]) => icons.map(([key, Icon, label]) => [key, [Icon, label]])));

export function StageIcon({ value }) {
  const Icon = STAGE_ICONS[value]?.[0] || Circle;
  return <Icon width={16} height={16} aria-hidden="true" />;
}

export function CrmIaStageIconPicker({ value, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  return <Popover open={open && !disabled} onOpenChange={setOpen}>
    <PopoverTrigger asChild><button type="button" className="crm-ia-stage-icon-trigger" aria-label="Escolher ícone da etapa" title={STAGE_ICONS[value]?.[1] || 'Ícone anterior'} disabled={disabled}><StageIcon value={value} /></button></PopoverTrigger>
    <PopoverContent className="crm-ia-stage-icon-popover" align="start" collisionPadding={12} aria-label="Ícones da etapa">
      {GROUPS.map(([name, icons]) => <section role="group" aria-label={name} key={name}><h4>{name}</h4><div>{icons.map(([key, , label]) => <button type="button" key={key} title={label} aria-label={label} aria-pressed={key === value} disabled={disabled} onClick={() => { onChange(key); setOpen(false); }}><StageIcon value={key} /><span>{label}</span></button>)}</div></section>)}
    </PopoverContent>
  </Popover>;
}
