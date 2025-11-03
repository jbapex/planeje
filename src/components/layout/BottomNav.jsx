import React from 'react';
    import { NavLink } from 'react-router-dom';
    import { Home, Users, FolderKanban, ListTodo, MessageSquare, Megaphone, Rocket, BarChart2, ListChecks } from 'lucide-react';
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import { useModuleSettings } from '@/contexts/ModuleSettingsContext';

    const allNavItems = [
      { to: '/dashboard', icon: Home, label: 'Início', roles: ['superadmin', 'admin', 'colaborador'], module: 'dashboard' },
      { to: '/clients', icon: Users, label: 'Clientes', roles: ['superadmin', 'admin', 'colaborador'], module: 'clients' },
      { to: '/projects', icon: FolderKanban, label: 'Projetos', roles: ['superadmin', 'admin', 'colaborador'], module: 'projects' },
      { to: '/tasks', icon: ListTodo, label: 'Tarefas', roles: ['superadmin', 'admin', 'colaborador'], module: 'tasks' },
      { to: '/onboarding', icon: ListChecks, label: 'Onboarding', roles: ['superadmin', 'admin', 'colaborador'] },
      { to: '/requests', icon: MessageSquare, label: 'Solicitações', roles: ['superadmin', 'admin'], module: 'requests' },
      { to: '/social-media', icon: Megaphone, label: 'Social', roles: ['superadmin', 'admin', 'colaborador'] },
      { to: '/paid-traffic', icon: Rocket, label: 'Tráfego', roles: ['superadmin', 'admin', 'colaborador'], module: 'paid_traffic' },
      { to: '/reports', icon: BarChart2, label: 'Relatórios', roles: ['superadmin', 'admin'] },
    ];

    const BottomNav = () => {
      const { profile } = useAuth();
      const { moduleSettings, loading } = useModuleSettings();
      const userRole = profile?.role;

      if (loading) {
        return <div className="md:hidden h-16 bg-white dark:bg-gray-800 border-t dark:border-gray-700"></div>;
      }
      
      const navItems = allNavItems.filter(item => {
        const roleMatch = userRole && item.roles.includes(userRole);
        const moduleEnabled = !item.module || item.module === 'dashboard' || moduleSettings[item.module] === true;
        return roleMatch && moduleEnabled;
      });

      return (
        <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white dark:bg-gray-800 border-t dark:border-gray-700 shadow-t-lg z-50">
          <div className="grid h-full max-w-lg grid-cols-5 mx-auto font-medium">
            {navItems.slice(0, 5).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `inline-flex flex-col items-center justify-center px-2 hover:bg-gray-50 dark:hover:bg-gray-700 group ${
                    isActive ? 'text-blue-600 dark:text-blue-500' : 'text-gray-500 dark:text-gray-400'
                  }`
                }
              >
                <item.icon className="w-6 h-6 mb-1" />
                <span className="text-[10px]">{item.label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      );
    };

    export default BottomNav;