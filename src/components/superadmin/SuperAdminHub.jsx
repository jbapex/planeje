import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, LayoutGrid, Settings } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { SUPER_ADMIN_SECTIONS, getRememberedSuperAdminPath } from '@/lib/superAdminNav';

const SuperAdminHub = () => {
  const [stats, setStats] = useState({
    clients: null,
    team: null,
    clientLogins: null,
    modulesOn: null,
  });

  const fetchStats = useCallback(async () => {
    const [clientsRes, teamRes, loginsRes, modulesRes] = await Promise.all([
      supabase.from('clientes').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).neq('role', 'cliente'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'cliente'),
      supabase.from('module_settings').select('module_name').eq('is_enabled', true),
    ]);

    setStats({
      clients: clientsRes.count ?? 0,
      team: teamRes.count ?? 0,
      clientLogins: loginsRes.count ?? 0,
      modulesOn: modulesRes.data?.length ?? 0,
    });
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const lastPath = getRememberedSuperAdminPath();
  const lastItem = lastPath
    ? SUPER_ADMIN_SECTIONS.flatMap((s) => s.items).find((i) => i.path === lastPath)
    : null;

  return (
    <div className="planeje-super-admin-page planeje-super-admin-hub">
      <header className="planeje-super-admin-hero">
        <h1 className="planeje-super-admin-hero-title">Painel Super Admin</h1>
        <p className="planeje-super-admin-hero-sub">
          Configurações da plataforma: equipe, IA, diagnóstico e sistema. Para perfil pessoal e convites
          internos, use{' '}
          <Link to="/settings?tab=equipe" className="underline text-white/95 font-medium">
            Configurações → Equipe
          </Link>
          .
        </p>

        <div className="planeje-super-admin-stats mt-5">
          <div className="planeje-super-admin-stat">
            <div className="planeje-super-admin-stat-value">{stats.clients ?? '—'}</div>
            <div className="planeje-super-admin-stat-label">Clientes</div>
          </div>
          <div className="planeje-super-admin-stat">
            <div className="planeje-super-admin-stat-value">{stats.team ?? '—'}</div>
            <div className="planeje-super-admin-stat-label">Equipe interna</div>
          </div>
          <div className="planeje-super-admin-stat">
            <div className="planeje-super-admin-stat-value">{stats.clientLogins ?? '—'}</div>
            <div className="planeje-super-admin-stat-label">Logins de cliente</div>
          </div>
          <div className="planeje-super-admin-stat">
            <div className="planeje-super-admin-stat-value">{stats.modulesOn ?? '—'}</div>
            <div className="planeje-super-admin-stat-label">Módulos ativos (global)</div>
          </div>
        </div>

        {lastItem && (
          <div className="planeje-super-admin-quick-links">
            <Link
              to={`/super-admin/${lastItem.path}`}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/95 bg-white/15 hover:bg-white/22 px-3 py-1.5 rounded-full border border-white/25 transition-colors"
            >
              Continuar em {lastItem.label}
              <ChevronRight className="h-4 w-4" />
            </Link>
            <Link
              to="/settings?tab=integracoes"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-white/85 hover:text-white px-3 py-1.5 rounded-full border border-white/20"
            >
              <Settings className="h-3.5 w-3.5" />
              Integrações (OpenAI)
            </Link>
          </div>
        )}
      </header>

      <div className="planeje-super-admin-sections">
        {SUPER_ADMIN_SECTIONS.map((section) => (
          <article key={section.id} className="planeje-super-admin-section-card">
            <div className="planeje-super-admin-section-card-header">
              <h2 className="planeje-super-admin-section-card-title">{section.label}</h2>
              <p className="planeje-super-admin-section-card-desc">{section.description}</p>
            </div>
            <div className="planeje-super-admin-section-card-body">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={`/super-admin/${item.path}`}
                    className="planeje-super-admin-hub-link"
                  >
                    <span className="planeje-super-admin-hub-link-icon">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span>
                      <p className="planeje-super-admin-hub-link-title">{item.label}</p>
                      <p className="planeje-super-admin-hub-link-desc">{item.description}</p>
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0 mt-1" />
                  </Link>
                );
              })}
            </div>
          </article>
        ))}
      </div>

      <p className="text-xs text-muted-foreground flex items-center gap-1.5 px-1">
        <LayoutGrid className="h-3.5 w-3.5" />
        Use o menu à esquerda (ou o seletor no celular) para navegar entre as seções.
      </p>
    </div>
  );
};

export default SuperAdminHub;
