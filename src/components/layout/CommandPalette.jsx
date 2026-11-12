import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bot,
  BarChart2,
  BarChart3,
  CheckSquare,
  FolderKanban,
  Home,
  Inbox,
  LayoutGrid,
  ListChecks,
  ListTodo,
  MessageSquare,
  Plus,
  Puzzle,
  Radio,
  Rocket,
  Settings,
  Share2,
  HardDrive,
  Megaphone,
  Target,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useModuleSettings } from '@/contexts/ModuleSettingsContext';
import { supabase } from '@/lib/customSupabaseClient';
import { CONVERSAS_DEFAULT_PATH } from '@/lib/conversasRoutes';
import { paidTrafficNavPath } from '@/lib/carteiraGestor';
import { buildClientHubUrl } from '@/lib/clientHubRoutes';
import WhatsAppIcon from '@/components/icons/WhatsAppIcon';
import '@/components/layout/CommandPalette.css';

export const PLANEJE_COMMAND_PALETTE_EVENT = 'planeje:command-palette';

const NAV_ITEMS = [
  { to: '/caixa', label: 'Minha caixa', icon: Inbox, keywords: 'pendencias pedidos internos clientes resposta sla' },
  { to: CONVERSAS_DEFAULT_PATH, label: 'Conversas', icon: WhatsAppIcon, module: 'atendimento', keywords: 'whatsapp inbox atendimento' },
  { to: '/dashboard', label: 'Início', icon: Home, module: 'dashboard', keywords: 'dashboard painel' },
  { to: '/clients', label: 'Clientes', icon: Users, module: 'clients', keywords: 'carteira contas' },
  { to: '/financeiro', label: 'Financeiro', icon: Wallet, module: 'financeiro', roles: ['superadmin', 'admin'], keywords: 'dre caixa mensalidade receita despesa' },
  { to: '/projects', label: 'Projetos', icon: FolderKanban, module: 'projects', keywords: 'campanhas' },
  { to: '/tasks/list', label: 'Tarefas', icon: ListTodo, module: 'tasks', keywords: 'entregas kanban' },
  { to: '/cobertura', label: 'Cobertura', icon: Target, module: 'tasks', keywords: 'mensal posts' },
  { to: '/assistant', label: 'Assistente', icon: Bot, module: 'assistant', keywords: 'ia apexia' },
  { to: '/onboarding', label: 'Onboarding', icon: ListChecks, module: 'onboarding' },
  { to: '/automacoes', label: 'Automações', icon: Zap, module: 'automacoes', roles: ['superadmin', 'admin'] },
  { to: '/mini-crm', label: 'Mini CRM', icon: LayoutGrid, module: 'mini_crm', keywords: 'planilha loja status vendedor leads' },
  { to: '/crm/leads', label: 'CRM', icon: LayoutGrid, module: 'crm', keywords: 'leads funil' },
  { to: '/paid-traffic/dashboard', label: 'Tráfego pago', icon: Rocket, module: 'paid_traffic', keywords: 'ads meta google painel tarefas gestor dashboard vencimento relatorio performance' },
  { to: '/rastreamento', label: 'Rastreamento', icon: Radio, module: 'rastreamento', keywords: 'utm origem leads eventos meta ctwa conversao funil' },
  { to: '/reports', label: 'Relatórios', icon: BarChart2, module: 'reports' },
  { to: '/settings', label: 'Configurações', icon: Settings, keywords: 'conta tema' },
  { to: '/settings/meta', label: 'Meta da agência', icon: Share2, roles: ['superadmin'], keywords: 'token ads facebook instagram system user' },
  { to: '/settings/google-drive', label: 'Google Drive da agência', icon: HardDrive, roles: ['superadmin'], keywords: 'oauth client id secret anexos pasta video' },
  { to: '/settings/google-ads', label: 'Google Ads da agência', icon: Megaphone, roles: ['superadmin'], keywords: 'oauth developer token mcc conversao gclid refresh' },
  { to: '/settings/google-dados', label: 'Google dados da agência', icon: BarChart3, roles: ['superadmin'], keywords: 'analytics ga4 meu negocio tag manager gtm oauth' },
  { to: '/extensao-whatsapp', label: 'Extensão Chrome', icon: Puzzle, keywords: 'chrome baixar instalar icone pagina whatsapp demanda' },
];

function isMac() {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '');
}

export function openPlanejeCommandPalette() {
  window.dispatchEvent(new CustomEvent(PLANEJE_COMMAND_PALETTE_EVENT));
}

export default function CommandPalette() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { moduleSettings, moduleAccess } = useModuleSettings();
  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const userRole = profile?.role;
  const isStaff = userRole && ['superadmin', 'admin', 'colaborador'].includes(userRole);

  useEffect(() => {
    if (!isStaff) return undefined;
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(PLANEJE_COMMAND_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(PLANEJE_COMMAND_PALETTE_EVENT, onOpen);
    };
  }, [isStaff]);

  const loadClients = useCallback(async () => {
    if (!user || loaded) return;
    let query = supabase.from('clientes').select('id, empresa, nome_contato, email, etapa').order('empresa');
    if (userRole === 'colaborador' && moduleAccess.clients === 'responsible') {
      query = query.eq('responsavel', user.id);
    }
    const { data } = await query.limit(200);
    setClients(data || []);
    setLoaded(true);
  }, [user, userRole, moduleAccess.clients, loaded]);

  useEffect(() => {
    if (open) loadClients();
  }, [open, loadClients]);

  useEffect(() => {
    setLoaded(false);
    setClients([]);
  }, [user?.id]);

  const navItems = useMemo(() => {
    const trafficTo = paidTrafficNavPath(profile);
    return NAV_ITEMS
      .map((item) => (item.module === 'paid_traffic' ? { ...item, to: trafficTo } : item))
      .filter((item) => {
        if (item.roles && (!userRole || !item.roles.includes(userRole))) return false;
        if (!item.module || item.module === 'dashboard') return true;
        return moduleSettings[item.module] === true;
      });
  }, [moduleSettings, profile, userRole]);

  const go = (to) => {
    setOpen(false);
    navigate(to);
  };

  if (!isStaff) return null;

  const shortcut = isMac() ? '⌘K' : 'Ctrl+K';

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <DialogTitle className="sr-only">Busca rápida do Planeje</DialogTitle>
      <CommandInput placeholder={`Buscar cliente, módulo ou ação… ${shortcut}`} />
      <CommandList className="max-h-[min(420px,70vh)]">
        <CommandEmpty>Nada encontrado. Tente o nome do cliente ou um módulo.</CommandEmpty>

        {clients.length > 0 && (
          <CommandGroup heading="Clientes">
            {clients.map((client) => (
              <CommandItem
                key={client.id}
                value={`${client.empresa} ${client.nome_contato || ''} ${client.email || ''} ${client.cidade || ''} ${client.estado || ''} cliente`}
                onSelect={() => go(buildClientHubUrl(client.id))}
              >
                <Users className="mr-2 h-4 w-4 shrink-0 opacity-70" />
                <span className="truncate">{client.empresa}</span>
                {client.nome_contato && (
                  <span className="ml-2 truncate text-xs text-muted-foreground">{client.nome_contato}</span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandSeparator />

        <CommandGroup heading="Ir para">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <CommandItem
                key={item.to}
                value={`${item.label} ${item.keywords || ''}`}
                onSelect={() => go(item.to)}
              >
                <Icon className="mr-2 h-4 w-4 shrink-0 opacity-70" />
                {item.label}
              </CommandItem>
            );
          })}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Ações">
          {(userRole === 'superadmin' || userRole === 'admin') && (
            <CommandItem value="novo cliente criar conta" onSelect={() => go('/clients/new')}>
              <Plus className="mr-2 h-4 w-4 shrink-0 opacity-70" />
              Novo cliente
            </CommandItem>
          )}
          <CommandItem value="nova tarefa criar entrega" onSelect={() => go('/tasks/list')}>
            <CheckSquare className="mr-2 h-4 w-4 shrink-0 opacity-70" />
            Ir para tarefas
          </CommandItem>
          <CommandItem value="mensagem conversas inbox" onSelect={() => go(CONVERSAS_DEFAULT_PATH)}>
            <MessageSquare className="mr-2 h-4 w-4 shrink-0 opacity-70" />
            Abrir inbox
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
