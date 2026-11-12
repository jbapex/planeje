import { Bot, Users } from 'lucide-react';
import AtendentesTab from '@/components/atendimento-loja/AtendentesTab';
import IaAgentesTab from '@/components/atendimento-loja/IaAgentesTab';

/** Abas extras da configuração do atendimento: { key, label, icon, perm, Component }. */
export const CONFIG_EXTRA_TABS = [
  { key: 'atendentes', label: 'Atendentes', icon: Users, perm: 'gerenciarUsuarios', Component: AtendentesTab },
  { key: 'ia', label: 'Agentes de IA', icon: Bot, perm: 'configurarIA', Component: IaAgentesTab },
];
