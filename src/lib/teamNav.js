import {
  BarChart2,
  Bot,
  FolderKanban,
  Home,
  Inbox,
  LayoutGrid,
  ListChecks,
  ListTodo,
  Megaphone,
  MessageSquare,
  Radio,
  Rocket,
  Table2,
  Target,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import WhatsAppIcon from '@/components/icons/WhatsAppIcon';
import { paidTrafficNavPath } from '@/lib/carteiraGestor';
import { TEAM_NAV_SPEC, filterTeamNav, cacheBustHref, reloadCurrentPage } from '@/lib/teamNavAccess';

const ICONS = {
  caixa: Inbox,
  conversas: WhatsAppIcon,
  dashboard: Home,
  clients: Users,
  financeiro: Wallet,
  projects: FolderKanban,
  tasks: ListTodo,
  cobertura: Target,
  assistant: Bot,
  onboarding: ListChecks,
  automacoes: Zap,
  requests: MessageSquare,
  social: Megaphone,
  traffic: Rocket,
  rastreamento: Radio,
  mini_crm: Table2,
  crm: LayoutGrid,
  reports: BarChart2,
  client_area: Users,
};

export const TEAM_NAV_GROUP_ICONS = {
  operations: ListTodo,
  clients: Users,
  marketing: Megaphone,
  ai: Bot,
  management: BarChart2,
};

export const TEAM_NAV_ITEMS = TEAM_NAV_SPEC.map((item) => ({
  ...item,
  icon: ICONS[item.id],
  lucideIcon: item.id === 'conversas' ? false : undefined,
}));

export { filterTeamNav, cacheBustHref, reloadCurrentPage };
export { groupTeamNav, isTeamNavItemActive, TEAM_NAV_MOBILE_SHORTCUT_IDS } from '@/lib/teamNavAccess';

export function withPaidTrafficPath(items, profile) {
  const trafficTo = paidTrafficNavPath(profile);
  return (items || []).map((item) => (item.module === 'paid_traffic' ? { ...item, to: trafficTo } : item));
}
