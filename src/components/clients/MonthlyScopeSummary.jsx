import { Badge } from '@/components/ui/badge';
import { SCOPE_DELIVERABLES, SCOPE_PRODUCTS } from '@/lib/clientMonthlyScopes';

const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));

export default function MonthlyScopeSummary({ scope, canViewField = () => true }) {
  const goals = scope?.media_goals || {};
  const hasValue = (value) => value !== '' && value != null && Number.isFinite(Number(value));
  const objective = { mensagens: 'Mensagens', compras: 'Compras', misto: 'Mensagens e compras' }[goals.objetivo_meta] || goals.objetivo_meta;
  const hasMedia = scope?.meta_ads || scope?.google_ads || objective || Object.values(goals).some((value) => value !== '' && value != null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{SCOPE_PRODUCTS[scope?.product] || scope?.product || 'Serviço a definir'}</Badge>
        {(scope?.channels || []).map((channel) => <Badge key={channel} variant="outline">{channel}</Badge>)}
      </div>
      {canViewField('entregaveis') && <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {SCOPE_DELIVERABLES.map(([key, label]) => <div key={key} className="rounded-lg border bg-muted/20 px-3 py-2">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold tabular-nums">{scope?.deliverables?.[key] ?? 0}</p>
        </div>)}
      </div>}
      {hasMedia && <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-lg bg-muted/30 p-3 text-sm">
        <span className="font-medium">Tráfego</span>
        {scope?.meta_ads && <span>Meta Ads</span>}
        {scope?.google_ads && <span>Google Ads</span>}
        {objective && canViewField('objetivo_meta') && <span>Objetivo: {objective}</span>}
        {hasValue(goals.budget) && canViewField('valor') && <span>Verba do mês: {money(goals.budget)}</span>}
        {hasValue(goals.meta_custo_mensagem) && canViewField('meta_custo_mensagem') && <span>Custo por mensagem: {money(goals.meta_custo_mensagem)}</span>}
        {hasValue(goals.meta_custo_compra) && canViewField('meta_custo_compra') && <span>Custo por compra: {money(goals.meta_custo_compra)}</span>}
        {hasValue(goals.roas_alvo) && canViewField('roas_alvo') && <span>ROAS: {goals.roas_alvo}×</span>}
      </div>}
      {scope?.scope_exceptions && <p className="whitespace-pre-wrap text-sm text-muted-foreground"><span className="font-medium text-foreground">Ajustes do mês: </span>{scope.scope_exceptions}</p>}
    </div>
  );
}
