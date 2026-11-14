import React from 'react';
import { Activity, BarChart3, CircleDollarSign, Compass, Sparkles, Users } from 'lucide-react';
import CrmIaAvatar from '@/components/crm-ia/CrmIaAvatar';
import CsIaAvatar from '@/components/cs-ia/CsIaAvatar';
import GestorIaAvatar from '@/components/gestor-ia/GestorIaAvatar';

const ICONS = { clientes: Users, operacao: Activity, estrategia: Sparkles, trafego: BarChart3, resultados: Compass, financeiro: CircleDollarSign };
const AVATARS = { crm: CrmIaAvatar, cs: CsIaAvatar, gestor: GestorIaAvatar };

export default function AtlasAgentMark({ agentId, avatar }) {
  const AgentAvatar = AVATARS[agentId];
  if (AgentAvatar) return <AgentAvatar className="atlas-converse-agent-avatar" />;
  const Icon = ICONS[agentId];
  if (!Icon) return <img className="atlas-converse-agent-avatar" src={avatar} alt="" />;
  return <span className="atlas-converse-agent-mark" data-agent={agentId} aria-hidden="true"><Icon size={15} /></span>;
}
