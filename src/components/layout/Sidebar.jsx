import React from 'react';
    import { NavLink } from 'react-router-dom';
    import { Home, Users, FolderKanban, ListTodo, MessageSquare as MessageSquareWarning, Settings, Shield, Bell, LogOut, Megaphone, Rocket, BarChart2, ListChecks, HelpCircle, Bot, Activity, FileText } from 'lucide-react';
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import { useModuleSettings } from '@/contexts/ModuleSettingsContext';
    import { useToast } from '@/components/ui/use-toast';
    import { Button } from '@/components/ui/button';
    import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { TooltipCustom } from '@/components/ui/tooltip-custom';
import {
  DropdownMenu,
      DropdownMenuContent,
      DropdownMenuItem,
      DropdownMenuTrigger,
    } from '@/components/ui/dropdown-menu';

    const allMenuItems = [
      { to: '/dashboard', icon: Home, label: 'Início', roles: ['superadmin', 'admin', 'colaborador'], module: 'dashboard' },
      { to: '/clients', icon: Users, label: 'Clientes', roles: ['superadmin', 'admin', 'colaborador'], module: 'clients' },
      { to: '/projects', icon: FolderKanban, label: 'Projetos', roles: ['superadmin', 'admin', 'colaborador'], module: 'projects' },
      { to: '/tasks', icon: ListTodo, label: 'Tarefas', roles: ['superadmin', 'admin', 'colaborador'], module: 'tasks' },
      { to: '/assistant', icon: Bot, label: 'Assistente', roles: ['superadmin', 'admin', 'colaborador'] },
      { to: '/onboarding', icon: ListChecks, label: 'Onboarding', roles: ['superadmin', 'admin', 'colaborador'] },
      { to: '/requests', icon: MessageSquareWarning, label: 'Solicitações', roles: ['superadmin', 'admin'], module: 'requests' },
      { to: '/social-media', icon: Megaphone, label: 'Redes Sociais', roles: ['superadmin', 'admin', 'colaborador'] },
      { to: '/paid-traffic', icon: Rocket, label: 'Tráfego Pago', roles: ['superadmin', 'admin', 'colaborador'], module: 'paid_traffic' },
      { to: '/reports', icon: BarChart2, label: 'Relatórios', roles: ['superadmin', 'admin'] },
      { to: '/client-area', icon: Users, label: 'Área do Cliente', roles: ['superadmin', 'admin', 'colaborador'] },
    ];

    const Sidebar = () => {
      const { signOut, profile } = useAuth();
      const { moduleSettings, loading: modulesLoading } = useModuleSettings();
      const { toast } = useToast();
      const userRole = profile?.role;

      const handleNotImplemented = () => {
        toast({
          title: "🚧 Funcionalidade não implementada!",
          description: "Não se preocupe! Você pode solicitar no próximo prompt! 🚀",
        });
      };

      const menuItems = allMenuItems.filter(item => {
        const roleMatch = userRole && item.roles.includes(userRole);
        const moduleEnabled = !item.module || item.module === 'dashboard' || moduleSettings[item.module] === true;
        return roleMatch && moduleEnabled;
      });

      if (modulesLoading) {
        return <aside className="hidden md:flex w-20 flex-col items-center bg-white dark:bg-gray-800 border-r dark:border-gray-700 py-4"></aside>;
      }

      return (
        <aside className="hidden md:flex w-20 flex-col items-center bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 py-4 h-screen overflow-hidden">
          <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-gradient-to-br from-orange-400 to-purple-600 rounded-lg text-white font-bold text-xl">
            J
          </div>
          <nav className="flex-1 w-full overflow-y-auto overflow-x-hidden flex flex-col items-center gap-4 py-6 custom-scrollbar">
            {menuItems.map((item) => (
              <TooltipCustom key={item.to} content={item.label} side="right" triggerClassName="w-full flex justify-center">
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    `p-3 rounded-lg transition-colors duration-200 flex-shrink-0 ${
                      isActive ? 'bg-gradient-to-br from-blue-600 to-blue-400 text-white shadow-lg shadow-blue-500/50 dark:from-blue-500 dark:to-blue-600' : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
                    }`
                  }
                >
                  <item.icon className="w-6 h-6" />
                </NavLink>
              </TooltipCustom>
            ))}
          </nav>
          <div className="mt-auto flex-shrink-0 flex flex-col items-center gap-4 pt-4 border-t border-gray-100 dark:border-gray-700 w-full">
            <TooltipCustom content="Notificações" side="right" triggerClassName="w-full flex justify-center">
              <Button variant="ghost" size="icon" className="text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700" onClick={handleNotImplemented}>
                <Bell className="w-6 h-6" />
              </Button>
            </TooltipCustom>
            
            <TooltipCustom content="Configurações" side="right" triggerClassName="w-full flex justify-center">
              <NavLink
                to="/settings"
                className={({ isActive }) =>
                  `p-3 rounded-lg transition-colors duration-200 flex-shrink-0 ${
                    isActive ? 'bg-gradient-to-br from-blue-600 to-blue-400 text-white shadow-lg shadow-blue-500/50 dark:from-blue-500 dark:to-blue-600' : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
                  }`
                }
              >
                <Settings className="w-6 h-6" />
              </NavLink>
            </TooltipCustom>

            {userRole === 'superadmin' && (
              <TooltipCustom content="Super Admin" side="right" triggerClassName="w-full flex justify-center">
                <NavLink
                  to="/super-admin"
                  className={({ isActive }) =>
                    `p-3 rounded-lg transition-colors duration-200 flex-shrink-0 ${
                      isActive ? 'bg-gradient-to-br from-blue-600 to-blue-400 text-white shadow-lg shadow-blue-500/50 dark:from-blue-500 dark:to-blue-600' : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
                    }`
                  }
                >
                  <Shield className="w-6 h-6" />
                </NavLink>
              </TooltipCustom>
            )}

            <TooltipCustom content="Minha Conta" side="right" triggerClassName="w-full flex justify-center">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 flex-shrink-0 mb-2">
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={profile?.avatar_url} alt={profile?.full_name} />
                      <AvatarFallback className="bg-gradient-to-br from-green-400 to-cyan-500 text-white font-bold">
                        {profile?.full_name ? profile.full_name.charAt(0).toUpperCase() : 'U'}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="center" className="mb-2">
                  <DropdownMenuItem onClick={signOut} className="text-red-500 focus:text-red-500 focus:bg-red-50">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Sair</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TooltipCustom>
          </div>
          <style>{`
            .custom-scrollbar::-webkit-scrollbar {
              width: 0px;
              background: transparent;
            }
            .custom-scrollbar {
              scrollbar-width: none;
              -ms-overflow-style: none;
            }
          `}</style>
        </aside>
      );
    };

    export default Sidebar;