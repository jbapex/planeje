import AiAgentsManager from '@/components/pages/AiAgentsManager';
import ApexIAClientPersonalitySettings from '@/components/pages/ApexIAClientPersonalitySettings';
import ChatLimitsManager from '@/components/pages/ChatLimitsManager';
import AssistantProjectModelSettings from '@/components/pages/AssistantProjectModelSettings';
import ClientApexIASettings from '@/components/pages/ClientApexIASettings';
import CompanyInfoSettings from '@/components/pages/CompanyInfoSettings';
import DiagnosticLeads from '@/components/admin/DiagnosticLeads';
import DiagnosticTemplatesManager from '@/components/pages/DiagnosticTemplatesManager';
import DiagnosticSettings from '@/components/pages/DiagnosticSettings';
import {
  BarChart2,
  Bot,
  Building2,
  FileStack,
  Gauge,
  MessagesSquare,
  SlidersHorizontal,
  Sparkles,
  Wand2,
} from 'lucide-react';

export const SUPER_ADMIN_IA_HUB = {
  path: 'ia',
  sectionLabel: 'IA & ApexIA',
  title: 'IA & ApexIA',
  description:
    'Agentes, personalidade, limites de uso, modelos do assistente e configurações por cliente.',
  defaultTab: 'agents',
  tabs: [
    { id: 'agents', label: 'Agentes', icon: Sparkles },
    { id: 'personality', label: 'Personalidade', icon: Bot },
    { id: 'limits', label: 'Limites do chat', icon: Gauge },
    { id: 'models', label: 'Modelos', icon: Wand2 },
    { id: 'client', label: 'Por cliente', icon: MessagesSquare },
    { id: 'company', label: 'Info. empresa', icon: Building2 },
  ],
  panels: {
    agents: AiAgentsManager,
    personality: ApexIAClientPersonalitySettings,
    limits: ChatLimitsManager,
    models: AssistantProjectModelSettings,
    client: ClientApexIASettings,
    company: CompanyInfoSettings,
  },
};

export const SUPER_ADMIN_DIAGNOSTIC_HUB = {
  path: 'diagnostico',
  sectionLabel: 'Diagnóstico',
  title: 'Diagnóstico de marketing',
  description: 'Leads capturados, templates de perguntas e configurações da página pública.',
  defaultTab: 'leads',
  tabs: [
    { id: 'leads', label: 'Leads', icon: BarChart2 },
    { id: 'templates', label: 'Templates', icon: FileStack },
    { id: 'settings', label: 'Configurações', icon: SlidersHorizontal },
  ],
  panels: {
    leads: DiagnosticLeads,
    templates: DiagnosticTemplatesManager,
    settings: DiagnosticSettings,
  },
};

export const SUPER_ADMIN_HUBS = [SUPER_ADMIN_IA_HUB, SUPER_ADMIN_DIAGNOSTIC_HUB];

/** Rotas antigas → hub com aba (paths relativos a /super-admin). */
export const SUPER_ADMIN_LEGACY_REDIRECTS = {
  'ai-agents': { hub: 'ia', tab: 'agents' },
  'apexia-client-personality': { hub: 'ia', tab: 'personality' },
  'chat-limits': { hub: 'ia', tab: 'limits' },
  'assistant-project-models': { hub: 'ia', tab: 'models' },
  'client-apexia-settings': { hub: 'ia', tab: 'client' },
  'company-info': { hub: 'ia', tab: 'company' },
  'diagnostic-leads': { hub: 'diagnostico', tab: 'leads' },
  'diagnostic-templates': { hub: 'diagnostico', tab: 'templates' },
  'diagnostic-settings': { hub: 'diagnostico', tab: 'settings' },
};

export function getSuperAdminHubByPath(pathSegment) {
  return SUPER_ADMIN_HUBS.find((hub) => hub.path === pathSegment) || null;
}

export function buildLegacyRedirectPath(legacySegment) {
  const entry = SUPER_ADMIN_LEGACY_REDIRECTS[legacySegment];
  if (!entry) return null;
  return `/super-admin/${entry.hub}?tab=${entry.tab}`;
}
