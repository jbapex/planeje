import React, { useState } from 'react';
    import { NavLink, useNavigate, useLocation } from 'react-router-dom';
    import { Home, Users, FolderKanban, ListTodo, MessageSquare, Megaphone, Rocket, BarChart2, ListChecks, MoreHorizontal, Bot, Activity } from 'lucide-react';
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import { useModuleSettings } from '@/contexts/ModuleSettingsContext';
    import {
      DropdownMenu,
      DropdownMenuContent,
      DropdownMenuItem,
      DropdownMenuTrigger,
    } from '@/components/ui/dropdown-menu';

    const allNavItems = [
      { to: '/dashboard', icon: Home, label: 'Início', roles: ['superadmin', 'admin', 'colaborador'], module: 'dashboard' },
      { to: '/clients', icon: Users, label: 'Clientes', roles: ['superadmin', 'admin', 'colaborador'], module: 'clients' },
      { to: '/projects', icon: FolderKanban, label: 'Projetos', roles: ['superadmin', 'admin', 'colaborador'], module: 'projects' },
      { to: '/tasks', icon: ListTodo, label: 'Tarefas', roles: ['superadmin', 'admin', 'colaborador'], module: 'tasks' },
      { to: '/assistant', icon: Bot, label: 'Assistente', roles: ['superadmin', 'admin', 'colaborador'] },
      { to: '/onboarding', icon: ListChecks, label: 'Onboarding', roles: ['superadmin', 'admin', 'colaborador'] },
      { to: '/requests', icon: MessageSquare, label: 'Solicitações', roles: ['superadmin', 'admin'], module: 'requests' },
      { to: '/social-media', icon: Megaphone, label: 'Social', roles: ['superadmin', 'admin', 'colaborador'] },
      { to: '/paid-traffic', icon: Rocket, label: 'Tráfego', roles: ['superadmin', 'admin', 'colaborador'], module: 'paid_traffic' },
      { to: '/reports', icon: BarChart2, label: 'Relatórios', roles: ['superadmin', 'admin'] },
      { to: '/pgm-panel', icon: Activity, label: 'PGM', roles: ['superadmin', 'admin', 'colaborador'] },
    ];

    const BottomNav = () => {
      const { profile } = useAuth();
      const { moduleSettings, loading } = useModuleSettings();
      const userRole = profile?.role;
      const navigate = useNavigate();
      const location = useLocation();
      const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

      if (loading) {
        return <div className="md:hidden h-16 bg-white dark:bg-gray-800 border-t dark:border-gray-700"></div>;
      }
      
      const navItems = allNavItems.filter(item => {
        const roleMatch = userRole && item.roles.includes(userRole);
        const moduleEnabled = !item.module || item.module === 'dashboard' || moduleSettings[item.module] === true;
        return roleMatch && moduleEnabled;
      });

      // Primeiros 4 itens principais (sempre Início e Clientes, depois os próximos 2)
      const mainItems = navItems.slice(0, 4);
      // Restante dos itens para o menu "Ver mais"
      const moreItems = navItems.slice(4);

      return (
        <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white dark:bg-gray-800 border-t dark:border-gray-700 shadow-t-lg z-50">
          <div className="grid h-full max-w-lg grid-cols-5 mx-auto font-medium">
            {/* Primeiros 4 itens principais */}
            {mainItems.map((item) => {
              const isActive = location.pathname.startsWith(item.to);
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className="relative inline-flex flex-col items-center justify-center px-2 hover:bg-gray-50 dark:hover:bg-gray-700 group transition-all duration-200"
                >
                  {isActive && (
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 to-blue-400/20 rounded-lg" />
                  )}
                  <item.icon className={`w-6 h-6 mb-1 relative z-10 ${isActive ? 'text-blue-600 dark:text-blue-500' : 'text-gray-500 dark:text-gray-400'}`} />
                  <span className={`text-[10px] relative z-10 ${isActive ? 'text-blue-600 dark:text-blue-500' : 'text-gray-500 dark:text-gray-400'}`}>{item.label}</span>
                  {isActive && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-600 to-blue-400 rounded-t-full" />
                  )}
                </NavLink>
              );
            })}
            
            {/* Botão "Ver mais" com dropdown */}
            <DropdownMenu open={isMoreMenuOpen} onOpenChange={setIsMoreMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button className="inline-flex flex-col items-center justify-center px-2 hover:bg-gray-50 dark:hover:bg-gray-700 group text-gray-500 dark:text-gray-400">
                  <MoreHorizontal className="w-6 h-6 mb-1" />
                  <span className="text-[10px]">Ver mais</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent 
                side="top" 
                align="end"
                className="mb-2 w-56 max-h-[60vh] overflow-y-auto"
              >
                {moreItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <DropdownMenuItem
                      key={item.to}
                      onClick={() => {
                        navigate(item.to);
                        setIsMoreMenuOpen(false);
                      }}
                      className="flex items-center gap-3 cursor-pointer"
                    >
                      <Icon className="w-5 h-5" />
                      <span>{item.label}</span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      );
    };

    export default BottomNav;