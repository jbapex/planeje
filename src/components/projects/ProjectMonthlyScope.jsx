import { useEffect, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { projectMonths, formatProjectMonth } from '@/lib/projectPeriod';
import { Link } from 'react-router-dom';
import { HelpCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useClientMonthlyScope } from '@/hooks/useClientMonthlyScope';
import { clientScopeReference, clientScopeUrl, formatScopeMonth } from '@/lib/clientMonthlyScopes';
import MonthlyScopeSummary from '@/components/clients/MonthlyScopeSummary';

export default function ProjectMonthlyScope({ client, project }) {
  const [selectedMonth, setSelectedMonth] = useState(project?.mes_referencia);
  const months = projectMonths(project);
  useEffect(() => {
    if (!months.includes(String(selectedMonth || '').slice(0, 7))) setSelectedMonth(project?.mes_referencia);
  }, [project?.id, project?.mes_referencia, project?.mes_fim, selectedMonth]);
  const { canViewField } = useAuth();
  const { scope, loading, error, refresh, referenceMonth } = useClientMonthlyScope(client?.id || project?.client_id, selectedMonth);
  if (!client) return null;
  return <details className="rounded-xl border bg-card p-4" aria-label="Escopo contratado do projeto">
    <summary className="cursor-pointer list-none">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <h2 className="text-sm font-semibold">Escopo contratado{referenceMonth ? ` · ${formatScopeMonth(referenceMonth)}` : ''}</h2>
          <Popover><PopoverTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Como o contrato orienta este projeto?" onClick={(event) => event.preventDefault()}><HelpCircle className="h-4 w-4" /></Button></PopoverTrigger>
            <PopoverContent className="w-80 text-sm">O contrato é administrado na ficha do cliente. As quantidades orientam o plano do mês; a execução segue as regras de Tarefas.</PopoverContent>
          </Popover>
        </div>
        <span className="text-xs text-muted-foreground">Ver detalhes</span>
      </div>
    </summary>
    <div className="mt-4 space-y-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">{months.length > 1 && <Select value={String(selectedMonth || project.mes_referencia).slice(0, 7)} onValueChange={(month) => setSelectedMonth(`${month}-01`)}><SelectTrigger aria-label="Mês do escopo contratado" className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger><SelectContent>{months.map((month) => <SelectItem key={month} value={month}>{formatProjectMonth(month)}</SelectItem>)}</SelectContent></Select>}<Button variant="outline" size="sm" asChild><Link to={clientScopeUrl(client.id, referenceMonth)}>Abrir ficha do cliente</Link></Button></div>
      {loading ? <Loader2 className="h-5 w-5 animate-spin" aria-label="Carregando escopo" /> : error ? <div className="flex items-center gap-3 text-sm text-destructive">Não foi possível consultar o escopo.<Button variant="outline" size="sm" onClick={refresh}>Tentar novamente</Button></div> : <>
        {!scope && <p className="text-xs text-amber-700 dark:text-amber-300">{referenceMonth ? 'Este mês ainda não tem escopo registrado. Abaixo, a referência atual do cadastro.' : 'Defina o mês do projeto para consultar seu escopo. Abaixo, a referência atual do cadastro.'}</p>}
        <MonthlyScopeSummary scope={scope || clientScopeReference(client)} canViewField={canViewField} />
      </>}
    </div>
  </details>;
}
