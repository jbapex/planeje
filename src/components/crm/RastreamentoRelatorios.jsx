import React, { useState } from 'react';
import { startOfMonth, endOfMonth } from 'date-fns';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CrmRelatorioMeta from '@/components/crm/CrmRelatorioMeta';
import CrmRelatorioGoogle from '@/components/crm/CrmRelatorioGoogle';

export default function RastreamentoRelatorios({ clienteId, onShowLeadDetail }) {
  const [params, setParams] = useSearchParams();
  const requestedPlatform = params.get('relatorio_plataforma');
  const platform = ['google', 'site'].includes(requestedPlatform) ? requestedPlatform : 'meta';
  const [dateRange, setDateRange] = useState(() => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }));
  return <Tabs value={platform} onValueChange={(value) => {
    const next = new URLSearchParams(params);
    if (value !== 'meta') next.set('relatorio_plataforma', value); else next.delete('relatorio_plataforma');
    setParams(next, { replace: true });
  }} className="min-w-0">
    <div className="px-4 pt-4 sm:px-5">
      <TabsList aria-label="Plataforma dos relatórios" className="grid w-full max-w-sm grid-cols-3 rounded-xl">
        <TabsTrigger value="meta" className="rounded-lg">Meta</TabsTrigger>
        <TabsTrigger value="google" className="rounded-lg">Google</TabsTrigger>
        <TabsTrigger value="site" className="rounded-lg">Site</TabsTrigger>
      </TabsList>
    </div>
    <TabsContent value="meta" className="mt-0">
      <CrmRelatorioMeta effectiveClienteId={clienteId} embeddedInHub onShowLeadDetail={onShowLeadDetail} dateRange={dateRange} onDateRangeChange={setDateRange} />
    </TabsContent>
    <TabsContent value="google" className="mt-0">
      <CrmRelatorioGoogle clienteId={clienteId} dateRange={dateRange} onDateRangeChange={setDateRange} />
    </TabsContent>
    <TabsContent value="site" className="mt-0">
      <CrmRelatorioGoogle platform="site" clienteId={clienteId} dateRange={dateRange} onDateRangeChange={setDateRange} />
    </TabsContent>
  </Tabs>;
}
