import React from 'react';
import { Activity, BarChart3, CircleDollarSign, Compass, Sparkles, Users } from 'lucide-react';

const ICONS = { clientes: Users, operacao: Activity, estrategia: Sparkles, trafego: BarChart3, resultados: Compass, financeiro: CircleDollarSign };

export default function AtlasAgentMark({ agentId, avatar }) {
  const Icon = ICONS[agentId];
  if (!Icon) return <img className="atlas-converse-agent-avatar" src={avatar} alt="" />;
  return <span className="atlas-converse-agent-mark" data-agent={agentId} aria-hidden="true"><Icon size={15} /></span>;
}
