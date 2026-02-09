import React from 'react';
import { Outlet } from 'react-router-dom';
import { CrmRefreshProvider } from '@/contexts/CrmRefreshContext';
import CrmHeader from '@/components/crm/CrmHeader';

export default function CrmLayout() {
  return (
    <CrmRefreshProvider>
      <div className="flex flex-col h-full min-h-0 w-full">
        <CrmHeader />
        <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <Outlet />
        </main>
      </div>
    </CrmRefreshProvider>
  );
}
