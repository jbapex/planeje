import React from 'react';
    import { NavLink, useLocation, Routes, Route, Navigate } from 'react-router-dom';
    import ModuleManagement from './ModuleManagement';
    import ClientFieldPermissions from './ClientFieldPermissions';
    import { ShieldCheck, Settings, Users, GitBranch, BarChart2, Sparkles, Bot } from 'lucide-react';
    import DiagnosticLeads from '@/components/admin/DiagnosticLeads';
    import AiAgentsManager from './AiAgentsManager';
    import DiagnosticSettings from './DiagnosticSettings';
    import ChatLimitsManager from './ChatLimitsManager';
    import DiagnosticTemplatesManager from './DiagnosticTemplatesManager';
import DashboardSettings from './DashboardSettings';
import CompanyInfoSettings from './CompanyInfoSettings';
import ApexIAClientPersonalitySettings from './ApexIAClientPersonalitySettings';
import AssistantProjectModelSettings from './AssistantProjectModelSettings';
import { LayoutDashboard } from 'lucide-react';

    const SuperAdmin = () => {
        const location = useLocation();

        const navItems = [
            { path: '/super-admin/modules', label: 'Gerenciar Módulos', icon: <Settings className="h-4 w-4" /> },
            { path: '/super-admin/client-permissions', label: 'Permissões de Campos', icon: <ShieldCheck className="h-4 w-4" /> },
            { path: '/super-admin/dashboard-settings', label: 'Config. Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
            { path: '/super-admin/company-info', label: 'Info. Empresa (IA)', icon: <Users className="h-4 w-4" /> },
            { path: '/super-admin/diagnostic-leads', label: 'Leads do Diagnóstico', icon: <BarChart2 className="h-4 w-4" /> },
            { path: '/super-admin/diagnostic-templates', label: 'Templates Diagnóstico', icon: <Settings className="h-4 w-4" /> },
            { path: '/super-admin/diagnostic-settings', label: 'Config. Diagnóstico', icon: <Settings className="h-4 w-4" /> },
            { path: '/super-admin/ai-agents', label: 'Agentes de IA', icon: <Sparkles className="h-4 w-4" /> },
            { path: '/super-admin/apexia-client-personality', label: 'Personalidade ApexIA', icon: <Bot className="h-4 w-4" /> },
            { path: '/super-admin/chat-limits', label: 'Limites do Chat IA', icon: <Bot className="h-4 w-4" /> },
            { path: '/super-admin/assistant-project-models', label: 'Modelos Assistente', icon: <Sparkles className="h-4 w-4" /> },
        ];
        
        return (
            <div className="flex h-full">
                <aside className="w-64 flex-shrink-0 border-r dark:border-gray-700 p-4">
                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <ShieldCheck className="h-6 w-6" />
                        Painel Super Admin
                    </h2>
                    <nav className="flex flex-col space-y-2">
                        {navItems.map(item => (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                className={({ isActive }) =>
                                    `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                        isActive
                                            ? 'bg-primary text-primary-foreground'
                                            : 'text-muted-foreground hover:bg-muted'
                                    }`
                                }
                            >
                                {item.icon}
                                {item.label}
                            </NavLink>
                        ))}
                    </nav>
                </aside>
                <main className="flex-1 p-0 overflow-auto">
                   <Routes>
                        <Route path="modules" element={<ModuleManagement />} />
                        <Route path="client-permissions" element={<ClientFieldPermissions />} />
                        <Route path="dashboard-settings" element={<DashboardSettings />} />
                        <Route path="company-info" element={<CompanyInfoSettings />} />
                        <Route path="diagnostic-leads" element={<DiagnosticLeads />} />
                        <Route path="diagnostic-templates" element={<DiagnosticTemplatesManager />} />
                        <Route path="diagnostic-settings" element={<DiagnosticSettings />} />
                        <Route path="ai-agents" element={<AiAgentsManager />} />
                        <Route path="apexia-client-personality" element={<ApexIAClientPersonalitySettings />} />
                        <Route path="chat-limits" element={<ChatLimitsManager />} />
                        <Route path="assistant-project-models" element={<AssistantProjectModelSettings />} />
                        <Route index element={<Navigate to="modules" replace />} />
                   </Routes>
                </main>
            </div>
        );
    };

    export default SuperAdmin;