import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LayoutGrid, Search, Shield } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  SUPER_ADMIN_ALL_ITEMS,
  SUPER_ADMIN_SECTIONS,
  filterSuperAdminNav,
  rememberSuperAdminPath,
} from '@/lib/superAdminNav';

const SuperAdminSidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const filteredSections = useMemo(() => filterSuperAdminNav(query), [query]);

  const activeSegment = useMemo(() => {
    const parts = location.pathname.replace(/\/$/, '').split('/');
    const idx = parts.indexOf('super-admin');
    const segment = idx >= 0 ? parts[idx + 1] || '' : '';
    if (segment === 'ia' || segment === 'diagnostico') return segment;
    return segment;
  }, [location.pathname]);

  const isHubActive = (hubPath) => activeSegment === hubPath;

  useEffect(() => {
    if (activeSegment) rememberSuperAdminPath(activeSegment);
  }, [activeSegment]);

  const isHub = !activeSegment;

  return (
    <>
      <div className="planeje-super-admin-mobile-picker">
        <Select
          value={isHub ? '__hub__' : activeSegment}
          onValueChange={(value) => {
            if (value === '__hub__') navigate('/super-admin');
            else navigate(`/super-admin/${value}`);
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Super Admin" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__hub__">Visão geral</SelectItem>
            {SUPER_ADMIN_SECTIONS.map((section) => (
              <React.Fragment key={section.id}>
                {section.items.map((item) => (
                  <SelectItem key={item.path} value={item.path}>
                    {section.label} — {item.label}
                  </SelectItem>
                ))}
              </React.Fragment>
            ))}
          </SelectContent>
        </Select>
      </div>

      <aside className="planeje-super-admin-sidebar hidden lg:block">
        <div className="planeje-super-admin-sidebar-brand">
          <Shield className="h-5 w-5" />
          Super Admin
        </div>

        <div className="planeje-super-admin-search relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar configuração..."
            className="pl-8 h-9 text-sm"
          />
        </div>

        <nav aria-label="Super Admin">
          <NavLink
            to="/super-admin"
            end
            className={({ isActive }) =>
              `planeje-super-admin-nav-link planeje-super-admin-nav-link--hub ${isActive ? 'is-active' : ''}`
            }
          >
            <LayoutGrid className="h-4 w-4 shrink-0" />
            Visão geral
          </NavLink>

          {filteredSections.map((section) => (
            <div key={section.id} className="planeje-super-admin-nav-section">
              <div className="planeje-super-admin-nav-section-label">{section.label}</div>
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={`/super-admin/${item.path}`}
                    className={({ isActive }) =>
                      `planeje-super-admin-nav-link ${isActive || isHubActive(item.path) ? 'is-active' : ''}`
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}

          {filteredSections.length === 0 && (
            <p className="text-xs text-muted-foreground px-2 py-3">Nenhum item para &quot;{query}&quot;.</p>
          )}
        </nav>
      </aside>
    </>
  );
};

export { SUPER_ADMIN_ALL_ITEMS };
export default SuperAdminSidebar;
