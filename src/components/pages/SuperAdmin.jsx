import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ModuleManagement from '@/components/pages/ModuleManagement';
import ClientFieldPermissions from '@/components/pages/ClientFieldPermissions';
import DashboardSettings from '@/components/pages/DashboardSettings';
import ClientUsersSuperAdmin from '@/components/pages/ClientUsersSuperAdmin';
import ContentPlatformsSettings from '@/components/pages/ContentPlatformsSettings';
import SuperAdminHub from '@/components/superadmin/SuperAdminHub';
import SuperAdminSidebar from '@/components/superadmin/SuperAdminSidebar';
import SuperAdminTabbedHub from '@/components/superadmin/SuperAdminTabbedHub';
import SuperAdminLegacyRedirect from '@/components/superadmin/SuperAdminLegacyRedirect';
import {
  SUPER_ADMIN_IA_HUB,
  SUPER_ADMIN_DIAGNOSTIC_HUB,
  SUPER_ADMIN_LEGACY_REDIRECTS,
} from '@/lib/superAdminHubs';
import '@/components/superadmin/SuperAdmin.css';

const SuperAdmin = () => (
  <div className="planeje-super-admin">
    <SuperAdminSidebar />
    <main className="planeje-super-admin-main">
      <Routes>
        <Route index element={<SuperAdminHub />} />
        <Route path="modules" element={<ModuleManagement />} />
        <Route path="client-permissions" element={<ClientFieldPermissions />} />
        <Route path="client-users" element={<ClientUsersSuperAdmin />} />
        <Route path="dashboard-settings" element={<DashboardSettings />} />
        <Route path="content-platforms" element={<ContentPlatformsSettings />} />
        <Route path="ia" element={<SuperAdminTabbedHub hub={SUPER_ADMIN_IA_HUB} />} />
        <Route path="diagnostico" element={<SuperAdminTabbedHub hub={SUPER_ADMIN_DIAGNOSTIC_HUB} />} />
        {Object.keys(SUPER_ADMIN_LEGACY_REDIRECTS).map((segment) => (
          <Route
            key={segment}
            path={segment}
            element={<SuperAdminLegacyRedirect segment={segment} />}
          />
        ))}
        <Route path="*" element={<Navigate to="/super-admin" replace />} />
      </Routes>
    </main>
  </div>
);

export default SuperAdmin;
