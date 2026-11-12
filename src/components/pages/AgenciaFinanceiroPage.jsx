import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CalendarRange,
  Check,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Loader2,
  Plus,
  Receipt,
  Repeat,
  Scale,
  Settings2,
  HelpCircle,
  Search,
  Pencil,
  Paperclip,
  Trash2,
  Users,
  Wallet,
} from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import WorkspacePageHeader from '@/components/layout/WorkspacePageHeader';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { rewritePublicStorageUrl } from '@/lib/publicStorageUrl';
import {
  FIN_GROUPS,
  GROUP_LABELS,
  STATUS_LABELS,
  canSettle,
  categoriesByGrupo,
  formatMoneyBr,
  formatMonthLabel,
  moneyAmount,
  monthStart,
  settleStatusForGrupo,
  shiftMonth,
  summarizeCaixa,
  summarizeDre,
  findCategoriaSalario,
  findCategoriaMensalidade,
  mensalidadesToCreate,
  rebalanceMensalidadesParceladas,
  mensalidadesPrevistasAntesEntrada,
  mensalidadeForaDaEntrada,
  agruparCobrancasParaTabela,
  cashDateForMensalidade,
  splitMensalidadeValor,
  splitSalario,
  partePagamento,
  folhaTotal,
  validarDescontoFolha,
  buildFolhaLancamento,
  buildValeLancamento,
  dataPrevistaPagamentoFolha,
  dataPrevistaValeFolha,
  equipeChaveOrdenacao,
  folhaCamposFromLancamentoStatus,
  folhaParteFromDescricao,
  folhaPagamentoLiquidado,
  folhaValeLiquidado,
  folhaPagamentoPagoEm,
  folhaValePagoEm,
  patchFolhaFromLancamentos,
  isCategoriaSalario,
  descricaoFolhaParte,
  grupoUsaColaborador,
  isOrigemFolha,
  grupoAceitaFixo,
  mesesDaRecorrencia,
  buildRecorrenciaLancamento,
  recorrenciasToCreate,
  folhasToCreate,
  vencimentoMensalidade,
  normalizeDiaCobranca,
  situacaoCobranca,
  dataRecebimentoMensalidade,
  isActiveLancamento,
  civilToday,
  buildFaturamentoAno,
  buildClientesNovosAno,
  totalSerie,
} from '@/lib/agenciaFinanceiro';
import {
  FinGraficoCard,
  FinSerieArea,
  FinSerieBarras,
  formatCompactMoney,
} from '@/components/financeiro/FinSerieChart';
import { DayField } from '@/components/pages/MiniCrmFollowUp';

const LANC_COLS =
  'id, competencia, data_caixa, grupo, categoria_id, cliente_id, profile_id, fornecedor_id, recorrencia_id, descricao, valor, origem, status, boleto_em, parcela_mensalidade, created_at';
const FORN_COLS = 'id, nome, ativo, created_at';
const REC_COLS =
  'id, fornecedor_id, grupo, categoria_id, descricao, valor, dia_vencimento, termina_em, ativa, created_at';
const FOLHA_COLS =
  'id, competencia, profile_id, funcao, salario, extras, desconto, desconto_motivo, pct_vale, vale, vale_status, vale_pago_em, vale_lancamento_id, forma, status, pago_em, lancamento_id, comprovante_pagamento_path, comprovante_vale_path';

const COMPROVANTE_BUCKET = 'financeiro-comprovantes';
const COMPROVANTE_MAX_BYTES = 8 * 1024 * 1024;
const COMPROVANTE_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

function comprovanteColuna(parte) {
  return parte === 'vale' ? 'comprovante_vale_path' : 'comprovante_pagamento_path';
}

function comprovantePathDaFolha(row, parte) {
  return parte === 'vale' ? row?.comprovante_vale_path || null : row?.comprovante_pagamento_path || null;
}

function safeComprovanteNome(name) {
  return String(name || 'arquivo')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

const FORMA_LABEL = {
  pix: 'Pix',
  transferencia: 'Transferência',
  dinheiro: 'Dinheiro',
  outro: 'Outro',
};

const EMPTY_FOLHA = {
  profile_id: '',
  funcao: '',
  salario: '',
  extras: '',
  desconto: '',
  desconto_motivo: '',
  forma: 'pix',
  status: 'previsto',
  pago_em: '',
  squad_id: '',
  dia_pagamento: '',
  pct_vale: '',
  pct_pagamento: '100',
  dia_vale: '',
  vale_status: 'previsto',
};

const EMPTY_FORM = {
  grupo: 'receita',
  categoria_id: '',
  cliente_id: '',
  profile_id: '',
  fornecedor_id: '',
  folha_parte: 'pagamento',
  descricao: '',
  valor: '',
  data_caixa: '',
  status: 'previsto',
  recorrente: false,
  quantos_meses: '12',
  termina_em: '',
};

const TABS = [
  { id: 'resumo', label: 'Resumo', icon: LayoutDashboard, group: 'dia' },
  { id: 'cobrancas', label: 'Cobranças', icon: Banknote, group: 'dia' },
  { id: 'equipe', label: 'Equipe', icon: Users, group: 'dia' },
  { id: 'dre', label: 'DRE', icon: Scale, group: 'contas' },
  { id: 'caixa', label: 'Caixa', icon: Wallet, group: 'contas' },
  { id: 'lancamentos', label: 'Lançamentos', icon: Receipt, group: 'contas' },
  { id: 'fixos', label: 'Fixos', icon: Repeat, group: 'contas' },
  { id: 'categorias', label: 'Categorias', icon: Settings2, group: 'contas' },
];

const TAB_HINTS = {
  resumo:
    'Gráficos do ano (só lançamentos gravados no Financeiro). Competência e caixa do mês, atalhos e fila Fazer agora com Recebi e Paguei. Clientes no gráfico usam Início na base do cadastro (ou criação do cliente se vazio).',
  cobrancas:
    'Use Gerar mensalidades do mês para criar cobranças (respeita início na base). Cancelar pede motivo e tira a linha prevista; Recebi registra o pagamento.',
  equipe:
    'Quem está na folha, vale e pagamento. Desconto do mês em Editar; comprovante no Paguei. Times filtram por área. Pagamento errado: cancele o lançamento em Lançamentos (com motivo); a folha volta a A pagar.',
  dre: 'Receitas, custos e despesas do mês, pagos ou não. Inclui a folha.',
  caixa: 'Previsto e realizado no mês. A pagar não lista salário/vale (ficam na Equipe). Repasse de mídia entra só aqui.',
  lancamentos:
    'Mensalidades do cliente e lançamentos avulsos/fixos. Clique para corrigir; lixeira cancela com motivo (inclusive um recebido). Salário e vale ficam na Equipe. Cancelados no filtro Cancelados.',
  fixos:
    'Cadastre fornecedores e veja as recorrências ativas. Parar encerra os meses futuros; o que já foi gerado permanece em Lançamentos.',
  categorias: 'Organize receitas, custos e despesas para o DRE.',
};

const GRUPO_STRIPE = {
  receita: 'border-l-emerald-500',
  custo: 'border-l-amber-500',
  despesa: 'border-l-rose-500',
  repasse: 'border-l-sky-500',
};

const GRUPO_CAT_HEAD = {
  receita: 'border-t-emerald-500/70',
  custo: 'border-t-amber-500/70',
  despesa: 'border-t-rose-500/70',
};

function tabFromParams(searchParams) {
  const raw = String(searchParams.get('aba') || 'resumo').toLowerCase();
  return TABS.some((t) => t.id === raw) ? raw : 'resumo';
}

function descricaoComCancelamento(descricao, motivo) {
  const base = String(descricao || '').replace(/\s*—\s*Cancelado:.*$/i, '').trim();
  const nota = motivo ? ` — Cancelado: ${motivo}` : ' — Cancelado';
  return (base + nota).slice(0, 200);
}

function formatDayBr(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).split('-');
  if (!y || !m || !d) return '—';
  return `${d}/${m}/${y}`;
}

function statusBadgeClass(status) {
  if (status === 'recebido' || status === 'pago') {
    return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300';
  }
  if (status === 'cancelado') {
    return 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';
  }
  if (status === 'previsto') {
    return 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300';
  }
  return 'bg-slate-100 text-slate-600';
}

function initials(text) {
  const parts = String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '—';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function ClienteFoto({ nome, logo, size = 'md' }) {
  const [broken, setBroken] = useState(false);
  const src = !broken ? rewritePublicStorageUrl(logo) : '';
  return (
    <div className={cn(
      'flex shrink-0 items-center justify-center overflow-hidden bg-slate-100 font-semibold tracking-wide text-slate-500 ring-1 ring-slate-200/80 dark:bg-white/5 dark:text-slate-300 dark:ring-white/10',
      size === 'sm' ? 'h-9 w-9 rounded-full text-[11px]' : 'h-12 w-12 rounded-2xl text-[12px]',
    )}>
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" onError={() => setBroken(true)} />
      ) : (
        initials(nome)
      )}
    </div>
  );
}

function ValorEditavel({ valor, disabled, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const abrir = () => {
    if (disabled) return;
    const atual = moneyAmount(valor);
    setDraft(atual == null ? '' : String(atual).replace('.', ','));
    setEditing(true);
  };

  const gravar = async () => {
    const proximo = moneyAmount(draft);
    const atual = moneyAmount(valor);
    if (!(proximo > 0)) {
      setEditing(false);
      return;
    }
    setEditing(false);
    if (atual != null && Math.round(proximo * 100) === Math.round(atual * 100)) return;
    await onSave(Math.round(proximo * 100) / 100);
  };

  if (editing) {
    return (
      <input
        autoFocus
        inputMode="decimal"
        aria-label="Valor da cobrança"
        className="h-8 w-[124px] rounded-lg border border-slate-300 bg-white px-2 text-[14px] font-semibold tabular-nums text-slate-950 outline-none ring-fuchsia-400 focus:ring-2"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={gravar}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') setEditing(false);
        }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={abrir}
      disabled={disabled}
      className="rounded-lg px-1.5 py-1 text-right text-[14px] font-semibold tabular-nums tracking-[-0.02em] text-slate-950 hover:bg-slate-100 disabled:hover:bg-transparent dark:text-white dark:hover:bg-white/10"
      title="Editar valor"
    >
      {formatMoneyBr(valor)}
    </button>
  );
}

function FinBusca({ value, onChange, placeholder, className }) {
  return (
    <div className={cn('relative min-w-0 flex-1', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 rounded-xl border-slate-200/80 bg-white pl-9 dark:border-white/10 dark:bg-card"
      />
    </div>
  );
}

function EmptyState({ children, className }) {
  return (
    <div className={cn('flex min-h-[160px] flex-col items-center justify-center gap-2 px-6 py-10 text-center', className)}>
      <p className="max-w-sm text-[13px] leading-6 text-slate-500">{children}</p>
    </div>
  );
}

function BarraRealizadoPrevisto({ realizado, previsto, label, corReal, corPrev }) {
  const real = Number(realizado) || 0;
  const prev = Number(previsto) || 0;
  const total = real + prev;
  const pctReal = total > 0 ? (real / total) * 100 : 0;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-medium text-slate-600 dark:text-slate-300">{label}</span>
        <span className="text-right text-[11px] leading-4 text-slate-500">
          <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">{formatMoneyBr(real)}</span>
          {prev > 0 ? (
            <>
              <span className="mx-1 text-slate-300">·</span>
              <span className="tabular-nums">{formatMoneyBr(prev)} prev.</span>
            </>
          ) : null}
        </span>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10" title={total <= 0 ? 'Sem valor' : undefined}>
        {total > 0 ? (
          <>
            <div className={cn('h-full', corReal)} style={{ width: `${pctReal}%` }} />
            <div className={cn('h-full', corPrev)} style={{ width: `${100 - pctReal}%` }} />
          </>
        ) : null}
      </div>
    </div>
  );
}

function ResumoCompetenciaVisual({ dre, onDre }) {
  const custos = dre.custo + dre.despesa;
  const positivo = dre.resultado >= 0;
  const margem = dre.receita > 0 ? Math.round((dre.resultado / dre.receita) * 100) : null;
  const maxBar = Math.max(dre.receita, custos, 1);
  const pctReceita = (dre.receita / maxBar) * 100;
  const pctCustos = (custos / maxBar) * 100;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-violet-200/45 bg-gradient-to-br from-violet-50/95 via-white to-fuchsia-50/40 p-5 shadow-[0_10px_32px_rgba(139,92,246,0.07)] dark:border-violet-500/15 dark:from-violet-950/30 dark:via-card dark:to-fuchsia-950/10">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-0.5">
          <p className="text-[12px] font-medium text-violet-800/90 dark:text-violet-200/90">Competência</p>
          <Ajuda label="Ajuda: Competência">O que o mês rende por competência — receitas, custos e despesas — pagos ou não. Cancelados e repasse ficam de fora.</Ajuda>
        </div>
        <Button type="button" variant="ghost" size="sm" className="h-8 rounded-lg text-xs text-violet-700 dark:text-violet-200" onClick={onDre}>
          DRE
          <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
        </Button>
      </div>
      <p
        className={cn(
          'mt-4 text-[32px] font-semibold leading-none tracking-[-0.04em] tabular-nums',
          positivo ? 'text-slate-950 dark:text-white' : 'text-rose-600 dark:text-rose-300',
        )}
      >
        {formatMoneyBr(dre.resultado)}
      </p>
      <p className="mt-1 text-[12px] text-slate-500">Resultado do mês</p>
      {margem != null ? (
        <p className={cn('mt-2 inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold', positivo ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200' : 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200')}>
          Margem {margem}%
        </p>
      ) : null}
      <div className="mt-5 space-y-3">
        <div>
          <div className="mb-1 flex justify-between text-[11px] text-slate-500">
            <span>Receita</span>
            <span className="font-medium tabular-nums text-emerald-700 dark:text-emerald-300">{formatMoneyBr(dre.receita)}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500" style={{ width: `${pctReceita}%` }} />
          </div>
        </div>
        <div>
          <div className="mb-1 flex justify-between text-[11px] text-slate-500">
            <span>Custos e despesas</span>
            <span className="font-medium tabular-nums text-rose-600 dark:text-rose-300">{formatMoneyBr(custos)}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-rose-400 to-orange-400" style={{ width: `${pctCustos}%` }} />
          </div>
        </div>
      </div>
    </section>
  );
}

function ResumoCaixaVisual({ caixa, onCaixa }) {
  const liquido = (caixa.recebido || 0) - (caixa.pago || 0);
  return (
    <section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_10px_32px_rgba(15,23,42,0.05)] dark:border-white/10 dark:bg-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-0.5">
          <p className="text-[12px] font-medium text-slate-700 dark:text-slate-200">Caixa</p>
          <Ajuda label="Ajuda: Caixa">
            Barras cheias = já recebido ou pago no mês; claras = ainda previsto. Líquido é só movimento do mês, sem saldo de conta bancária.
          </Ajuda>
        </div>
        <Button type="button" variant="ghost" size="sm" className="h-8 rounded-lg text-xs" onClick={onCaixa}>
          Abrir
          <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
        </Button>
      </div>
      <p className="mt-4 text-[32px] font-semibold leading-none tracking-[-0.04em] tabular-nums text-slate-950 dark:text-white">
        {formatMoneyBr(liquido)}
      </p>
      <p className="mt-1 text-[12px] text-slate-500">Líquido do mês</p>
      <div className="mt-5 space-y-4">
        <BarraRealizadoPrevisto
          label="Entradas"
          realizado={caixa.recebido}
          previsto={caixa.aReceber}
          corReal="bg-emerald-500"
          corPrev="bg-emerald-200 dark:bg-emerald-500/25"
        />
        <BarraRealizadoPrevisto
          label="Saídas"
          realizado={caixa.pago}
          previsto={caixa.aPagar}
          corReal="bg-violet-600"
          corPrev="bg-violet-200 dark:bg-violet-500/25"
        />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/[0.04]">
          <p className="text-[11px] font-medium text-slate-500">A receber</p>
          <p className="mt-0.5 text-[14px] font-semibold tabular-nums text-amber-800 dark:text-amber-200">{formatMoneyBr(caixa.aReceber)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/[0.04]">
          <p className="text-[11px] font-medium text-slate-500">A pagar</p>
          <p className="mt-0.5 text-[14px] font-semibold tabular-nums text-sky-800 dark:text-sky-200">{formatMoneyBr(caixa.aPagar)}</p>
        </div>
      </div>
    </section>
  );
}

function ResumoAtalhoChip({ icon: Icon, label, badge, onClick, tone = 'slate' }) {
  const ring = {
    slate: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200',
    sky: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200',
    violet: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200/70 bg-white px-3 py-2 text-left transition hover:border-violet-200 hover:bg-violet-50/50 dark:border-white/10 dark:bg-card dark:hover:border-violet-500/30"
    >
      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', ring[tone] || ring.slate)}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="text-[12px] font-medium text-slate-800 dark:text-slate-100">{label}</span>
      {badge > 0 ? (
        <span className="ml-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function ResumoFazerAgora({
  fila,
  clienteNome,
  fotoDe,
  saving,
  onOpen,
  onSettle,
  onVerTodos,
  onNovoLancamento,
  atalhos,
}) {
  return (
    <Panel
      title="Fazer agora"
      help="Próximos recebimentos e pagamentos deste mês, pela data de caixa."
      actions={
        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:items-end">
          {atalhos ? <div className="w-full sm:flex sm:justify-end">{atalhos}</div> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" size="sm" variant="outline" className="h-8 rounded-xl text-xs" onClick={onVerTodos}>
              Ver caixa
            </Button>
            <Button type="button" size="sm" className="h-8 gap-1 rounded-xl text-xs" onClick={onNovoLancamento}>
              <Plus className="h-3.5 w-3.5" />
              Lançamento
            </Button>
          </div>
        </div>
      }
    >
      {fila.length === 0 ? (
        <EmptyState>Nada pendente neste mês. As mensalidades ficam em Cobranças; a folha em Equipe.</EmptyState>
      ) : (
        <ul className="divide-y divide-slate-100/90 dark:divide-white/[0.06]">
          {fila.map((row) => {
            const name = clientLabelFromRow(row, clienteNome);
            const quando = row.data_caixa ? formatDayBr(row.data_caixa) : 'Sem data';
            const receber = row.grupo === 'receita';
            return (
              <li key={row.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => onOpen(row)}>
                  <ClienteFoto nome={name} logo={fotoDe(row)} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={cn('h-2 w-2 shrink-0 rounded-full', receber ? 'bg-emerald-500' : 'bg-violet-500')} />
                      <span className="truncate text-[13px] font-medium text-slate-900 dark:text-white">{name}</span>
                    </span>
                    <span className="mt-0.5 block text-[11px] text-slate-400">
                      {receber ? 'Receber' : 'Pagar'} · {quando}
                    </span>
                  </span>
                  <span className="shrink-0 text-[14px] font-semibold tabular-nums text-slate-950 dark:text-white">{formatMoneyBr(row.valor)}</span>
                </button>
                {canSettle(row) ? (
                  <Button
                    type="button"
                    size="sm"
                    className={cn(
                      'h-9 shrink-0 rounded-xl px-3 text-xs text-white',
                      receber ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-violet-600 hover:bg-violet-700',
                    )}
                    disabled={saving}
                    onClick={() => onSettle(row)}
                  >
                    {receber ? 'Recebi' : 'Paguei'}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function EquipeResumoFaixa({ aPagar, pago, pendentes, naFolha }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div className="rounded-xl border border-slate-200/70 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-card">
        <p className="text-[11px] font-medium text-slate-500">A pagar</p>
        <p className="mt-0.5 text-[17px] font-semibold tabular-nums tracking-[-0.02em] text-violet-900 dark:text-violet-200">{formatMoneyBr(aPagar)}</p>
      </div>
      <div className="rounded-xl border border-slate-200/70 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-card">
        <p className="text-[11px] font-medium text-slate-500">Pago no mês</p>
        <p className="mt-0.5 text-[17px] font-semibold tabular-nums tracking-[-0.02em] text-emerald-800 dark:text-emerald-200">{formatMoneyBr(pago)}</p>
      </div>
      <div className="rounded-xl border border-slate-200/70 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-card">
        <p className="text-[11px] font-medium text-slate-500">Pendências</p>
        <p className="mt-0.5 text-[17px] font-semibold tabular-nums text-amber-800 dark:text-amber-200">{pendentes}</p>
      </div>
      <div className="rounded-xl border border-slate-200/70 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-card">
        <p className="text-[11px] font-medium text-slate-500">Na folha</p>
        <p className="mt-0.5 text-[17px] font-semibold tabular-nums text-slate-950 dark:text-white">{naFolha}</p>
      </div>
    </div>
  );
}

function EquipePagamentoCelula({
  titulo,
  valor,
  vazio,
  pago,
  pagoEm,
  previstoEm,
  desconto,
  descontoMotivo,
  temComprovante,
  onPay,
  onAjustarPago,
  onAbrirComprovante,
  saving,
}) {
  if (vazio) {
    return <span className="text-[12px] text-slate-300 dark:text-slate-600">—</span>;
  }
  const descontoValor = Number(desconto) || 0;
  return (
    <div className="min-w-[8rem] space-y-1.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{titulo}</p>
      {!pago && previstoEm ? (
        <p className="text-[10px] tabular-nums text-slate-500">Prev. {formatDayBr(previstoEm)}</p>
      ) : null}
      <p className="text-[14px] font-semibold tabular-nums text-slate-950 dark:text-white">{formatMoneyBr(valor)}</p>
      {descontoValor > 0 ? (
        <p className="text-[10px] tabular-nums text-rose-600 dark:text-rose-300">
          − {formatMoneyBr(descontoValor)}
          {descontoMotivo ? ` · ${descontoMotivo}` : ''}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-1.5">
        {pago ? (
          <button
            type="button"
            disabled={saving || !onAjustarPago}
            onClick={onAjustarPago}
            className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-800 underline-offset-2 hover:underline disabled:no-underline dark:bg-emerald-950/40 dark:text-emerald-300"
            title="Alterar data do pagamento"
          >
            Pago {pagoEm ? formatDayBr(pagoEm) : '—'}
          </button>
        ) : onPay ? (
          <Button
            type="button"
            size="sm"
            className="h-7 rounded-lg bg-emerald-600 px-3 text-[11px] font-medium text-white shadow-sm hover:bg-emerald-700"
            disabled={saving}
            onClick={onPay}
          >
            Paguei
          </Button>
        ) : (
          <span className="text-[11px] text-slate-400">—</span>
        )}
        {temComprovante && onAbrirComprovante ? (
          <button
            type="button"
            onClick={onAbrirComprovante}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"
            title="Abrir comprovante"
            aria-label="Abrir comprovante"
          >
            <Paperclip className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function equipeItemPendente(item, lancMap) {
  if (!item.naFolha || !item.linha) return false;
  const base = item.linha;
  const partes = splitSalario(base.salario, base.pct_vale);
  const pagar = partePagamento(base);
  const valePend = partes.vale > 0 && !folhaValeLiquidado(base, lancMap);
  const pagPend = pagar > 0 && !folhaPagamentoLiquidado(base, lancMap);
  return valePend || pagPend;
}

function clientLabelFromRow(row, clienteNome) {
  if (row?.cliente_id && clienteNome?.get?.(row.cliente_id)) return clienteNome.get(row.cliente_id);
  const raw = String(row?.descricao || '');
  const named = raw.match(/^(?:Mensalidade|Vale|Salário)\s*[—-]\s*(.+)$/i);
  return named?.[1]?.trim() || raw || 'Lançamento';
}

function lancamentoKind(row) {
  const raw = String(row?.descricao || '');
  if (/^Vale\s*[—-]/i.test(raw)) return 'Vale';
  if (/^Salário\s*[—-]/i.test(raw)) return 'Salário';
  return '';
}

function byCashDate(a, b) {
  const da = a?.data_caixa || '9999-12-31';
  const db = b?.data_caixa || '9999-12-31';
  if (da !== db) return da < db ? -1 : 1;
  return String(a?.descricao || '').localeCompare(String(b?.descricao || ''), 'pt');
}

function Ajuda({ label, children }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0 rounded-full text-slate-400" aria-label={label}>
          <HelpCircle className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 max-w-[calc(100vw-2rem)] rounded-2xl border-slate-200 p-3 text-[13px] leading-5 text-slate-600 shadow-lg">
        {children}
      </PopoverContent>
    </Popover>
  );
}

const FIN_TAB_GROUPS = [
  { id: 'dia', label: 'Operação' },
  { id: 'contas', label: 'Contas' },
];

function financeiroTabBadge(tabId, cobrancasAtrasadas, equipePendente) {
  if (tabId === 'cobrancas') return cobrancasAtrasadas;
  if (tabId === 'equipe') return equipePendente;
  return 0;
}

function FinanceiroTabBar({ aba, setAba, cobrancasAtrasadas, equipePendente, loading }) {
  return (
    <div className="rounded-[20px] border border-slate-200/60 bg-white shadow-sm dark:border-white/10 dark:bg-card">
      <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          {FIN_TAB_GROUPS.map((group) => (
            <div key={group.id} className="min-w-0 flex-1 sm:flex-none">
              <p className="mb-1 px-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400 dark:text-slate-500">
                {group.label}
              </p>
              <div
                className="flex gap-0.5 overflow-x-auto rounded-xl bg-slate-100/85 p-1 dark:bg-white/[0.05]"
                role="tablist"
                aria-label={group.label}
              >
                {TABS.filter((t) => t.group === group.id).map((tab) => {
                  const Icon = tab.icon;
                  const active = aba === tab.id;
                  const badge = financeiroTabBadge(tab.id, cobrancasAtrasadas, equipePendente);
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setAba(tab.id)}
                      className={cn(
                        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium transition',
                        active
                          ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                          : 'text-slate-500 hover:bg-white/65 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white',
                      )}
                    >
                      <Icon className={cn('h-3.5 w-3.5 shrink-0', active ? 'text-slate-700 dark:text-slate-200' : 'opacity-65')} />
                      <span className="whitespace-nowrap">{tab.label}</span>
                      {badge > 0 ? (
                        <span
                          className={cn(
                            'min-w-[1.1rem] rounded-full px-1 text-center text-[10px] font-semibold leading-[1.15rem]',
                            active ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300' : 'bg-rose-500 text-white',
                          )}
                        >
                          {badge}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {!loading && TAB_HINTS[aba] ? (
          <div className="flex shrink-0 items-center justify-end border-t border-slate-100 pt-2 sm:border-0 sm:pt-0 dark:border-white/[0.06]">
            <Ajuda label={`Ajuda: ${TABS.find((t) => t.id === aba)?.label || aba}`}>{TAB_HINTS[aba]}</Ajuda>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FiltroChips({ items, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-2xl bg-slate-100/80 p-1 dark:bg-white/[0.05]">
      {items.map(([id, label, count]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-[13px] font-medium transition',
            value === id
              ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
              : 'text-slate-500 hover:bg-white/60 hover:text-slate-800 dark:hover:bg-white/10 dark:hover:text-white',
          )}
        >
          {label}
          {count != null ? <span className="tabular-nums text-[12px] text-slate-400">{count}</span> : null}
        </button>
      ))}
    </div>
  );
}

function SecaoMetricas({ titulo, children }) {
  return (
    <section className="space-y-3">
      <h3 className="px-0.5 text-[13px] font-medium text-slate-500 dark:text-slate-400">{titulo}</h3>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}

function CobrancasResumoFaixa({ aReceber, recebido, atrasados, total }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div className="rounded-xl border border-slate-200/70 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-card">
        <p className="text-[11px] font-medium text-slate-500">A receber</p>
        <p className="mt-0.5 text-[17px] font-semibold tabular-nums tracking-[-0.02em] text-amber-900 dark:text-amber-200">{formatMoneyBr(aReceber)}</p>
      </div>
      <div className="rounded-xl border border-slate-200/70 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-card">
        <p className="text-[11px] font-medium text-slate-500">Recebido no mês</p>
        <p className="mt-0.5 text-[17px] font-semibold tabular-nums tracking-[-0.02em] text-emerald-800 dark:text-emerald-200">{formatMoneyBr(recebido)}</p>
      </div>
      <div className="rounded-xl border border-slate-200/70 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-card">
        <p className="text-[11px] font-medium text-slate-500">Atrasados</p>
        <p className="mt-0.5 text-[17px] font-semibold tabular-nums text-rose-700 dark:text-rose-300">{atrasados}</p>
      </div>
      <div className="rounded-xl border border-slate-200/70 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-card">
        <p className="text-[11px] font-medium text-slate-500">Mensalidades</p>
        <p className="mt-0.5 text-[17px] font-semibold tabular-nums text-slate-950 dark:text-white">{total}</p>
      </div>
    </div>
  );
}

function cobrancaVencimentoLabel(row) {
  if (row.situacao === 'sem_vencimento') return 'Sem dia';
  if (row.vence) return formatDayBr(row.vence);
  return '—';
}

function cobrancaVencimentoClass(row) {
  if (row.situacao === 'atrasado') return 'text-rose-700 dark:text-rose-300';
  return 'text-slate-600 dark:text-slate-300';
}

function cobrancaPagoEmLabel(row) {
  if (row.pagoEm) return formatDayBr(row.pagoEm);
  return '—';
}

function zebraRowClass(index) {
  return cn(
    'border-b border-b-slate-200/90 transition-colors dark:border-b-white/10',
    index % 2 === 1 ? 'bg-slate-100/55 dark:bg-white/[0.035]' : 'bg-white dark:bg-transparent',
    'hover:bg-slate-100 dark:hover:bg-white/[0.06]',
  );
}

function cobrancaRowClass(row) {
  return row?.situacao === 'atrasado' ? 'shadow-[inset_3px_0_0_0_rgb(251,113,133)]' : '';
}

function previewParcelaCobranca(client, competencia, parcela) {
  if (!client) return { valor: null, vence: null };
  const n = Number(parcela) === 2 ? 2 : 1;
  const { parcela1, parcela2 } = splitMensalidadeValor(client.valor);
  const valor = n === 2 ? parcela2 : parcela1;
  const dia = n === 2 ? client.dia_cobranca_2 : client.dia_cobranca;
  const vence = cashDateForMensalidade(competencia, dia);
  return { valor, vence };
}

function CobrancaLinhaDados({
  row,
  parcelLabel,
  parcela,
  clienteId,
  competencia,
  clienteCobranca,
  saving,
  onValor,
  onBoleto,
  onReceber,
  onAjustarPago,
  onCancelar,
  missing,
}) {
  if (missing) {
    const client = clienteCobranca?.get?.(clienteId);
    const prev = previewParcelaCobranca(client, competencia, parcela ?? 2);
    const semDia = !prev.vence;
    return (
      <>
        <td className="px-2 py-2 text-right align-middle">
          <span className="text-[10px] font-medium text-slate-400">{parcelLabel}</span>
          <p className="text-[12px] tabular-nums text-slate-500">{prev.valor > 0 ? formatMoneyBr(prev.valor) : '—'}</p>
        </td>
        <td className="px-2 py-2 text-[12px] tabular-nums text-slate-500 align-middle whitespace-nowrap">
          {semDia ? 'Sem dia' : formatDayBr(prev.vence)}
        </td>
        <td className="px-2 py-2 text-[12px] text-slate-400 align-middle">—</td>
        <td className="px-2 py-2 text-[12px] text-slate-400 align-middle">—</td>
        <td className="px-2 py-2 align-middle">
          <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300">
            A gerar
          </span>
        </td>
        <td className="px-4 py-2 text-right align-middle">
          <span className="text-[12px] text-slate-400">—</span>
        </td>
      </>
    );
  }
  return (
    <>
      <td className="px-2 py-2.5 text-right align-middle">
        {parcelLabel ? <p className="text-[10px] font-medium text-slate-400">{parcelLabel}</p> : null}
        <div className="flex justify-end">
          <ValorEditavel valor={row.valor} disabled={saving || row.situacao === 'pago'} onSave={(valor) => onValor(row, valor)} />
        </div>
      </td>
      <td className={cn('px-2 py-2.5 text-[12px] tabular-nums align-middle whitespace-nowrap', cobrancaVencimentoClass(row))}>
        {cobrancaVencimentoLabel(row)}
      </td>
      <td className="px-2 py-2.5 align-middle whitespace-nowrap">
        {row.pagoEm ? (
          <button
            type="button"
            className="text-[12px] tabular-nums font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-300"
            disabled={saving}
            title="Alterar data em que entrou no caixa"
            onClick={() => onAjustarPago(row)}
          >
            {cobrancaPagoEmLabel(row)}
          </button>
        ) : (
          <span className="text-[12px] tabular-nums text-slate-400">—</span>
        )}
      </td>
      <td className="px-2 py-2.5 align-middle">
        {row.situacao === 'pago' ? (
          <span className="text-[12px] text-slate-400">—</span>
        ) : row.boleto === 'enviado' ? (
          <span className="text-[12px] font-medium text-sky-800 dark:text-sky-200 whitespace-nowrap">{formatDayBr(row.boleto_em)}</span>
        ) : row.boleto === 'mandar' ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 whitespace-nowrap rounded-lg px-2 text-[11px]"
            disabled={saving}
            onClick={() => onBoleto(row)}
          >
            Marcar
          </Button>
        ) : (
          <span className="text-[12px] text-slate-400">Aguardando</span>
        )}
      </td>
      <td className="px-2 py-2.5 align-middle">
        <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap', cobrancaSituacaoClass(row.situacao))}>
          {cobrancaSituacaoLabel(row.situacao)}
        </span>
      </td>
      <td className="px-4 py-2.5 text-right align-middle">
        {row.situacao !== 'pago' && row.status === 'previsto' ? (
          <div className="flex flex-col items-end gap-1 sm:flex-row sm:justify-end">
            <Button
              type="button"
              size="sm"
              className="h-7 rounded-lg bg-emerald-600 px-2.5 text-[11px] text-white hover:bg-emerald-700"
              disabled={saving}
              onClick={() => onReceber(row)}
            >
              Recebi
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[11px] text-slate-500 hover:text-rose-700"
              disabled={saving}
              onClick={() => onCancelar(row)}
            >
              Cancelar
            </Button>
          </div>
        ) : row.situacao !== 'pago' ? (
          <Button
            type="button"
            size="sm"
            className="h-7 rounded-lg bg-emerald-600 px-2.5 text-[11px] text-white hover:bg-emerald-700"
            disabled={saving}
            onClick={() => onReceber(row)}
          >
            Recebi
          </Button>
        ) : (
          <span className="text-[12px] text-slate-400">—</span>
        )}
      </td>
    </>
  );
}

function CobrancasTabela({
  rows,
  competencia,
  clienteNome,
  clienteLogo,
  clienteCobranca,
  saving,
  onValor,
  onBoleto,
  onReceber,
  onAjustarPago,
  onCancelar,
}) {
  const blocos = useMemo(() => agruparCobrancasParaTabela(rows, clienteCobranca), [rows, clienteCobranca]);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] table-fixed border-collapse">
        <colgroup>
          <col className="w-[26%]" />
          <col className="w-[11%]" />
          <col className="w-[11%]" />
          <col className="w-[11%]" />
          <col className="w-[13%]" />
          <col className="w-[12%]" />
          <col className="w-[16%]" />
        </colgroup>
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-400">
            <th className="px-4 py-2.5 text-left font-medium">Cliente</th>
            <th className="px-2 py-2.5 text-right font-medium">Valor</th>
            <th className="px-2 py-2.5 text-left font-medium">Data pagamento</th>
            <th className="px-2 py-2.5 text-left font-medium">Pago em</th>
            <th className="px-2 py-2.5 text-left font-medium">Boleto</th>
            <th className="px-2 py-2.5 text-left font-medium">Status</th>
            <th className="px-4 py-2.5 text-right font-medium">Ação</th>
          </tr>
        </thead>
        <tbody>
          {(() => {
            let zebra = 0;
            return blocos.flatMap((bloco) => {
            if (bloco.kind === 'dupla') {
              const nome = clienteNome.get(bloco.clienteId) || 'Cliente';
              const logo = clienteLogo.get(bloco.clienteId);
              const slots = [
                { key: 'p1', row: bloco.p1, label: '1ª parcela', parcela: 1, missing: false },
                { key: 'p2', row: bloco.p2, label: '2ª parcela', parcela: 2, missing: !bloco.p2 },
              ];
              return slots.map((slot, idx) => (
                <tr
                  key={`dupla-${bloco.clienteId}-${slot.key}`}
                  className={cn(
                    zebraRowClass(zebra++),
                    !slot.missing && slot.row ? cobrancaRowClass(slot.row) : null,
                    idx === 0 && 'border-b-dashed',
                  )}
                >
                  {idx === 0 ? (
                    <td rowSpan={2} className="px-4 py-2.5 align-middle border-l-2 border-slate-200/70 dark:border-white/10">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <ClienteFoto nome={nome} logo={logo} size="sm" />
                        <div className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold text-slate-950 dark:text-white">{nome}</span>
                          <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">2 parcelas no mês</span>
                        </div>
                      </div>
                    </td>
                  ) : null}
                  <CobrancaLinhaDados
                    row={slot.row}
                    parcelLabel={slot.label}
                    parcela={slot.parcela}
                    clienteId={bloco.clienteId}
                    competencia={competencia}
                    clienteCobranca={clienteCobranca}
                    missing={slot.missing}
                    saving={saving}
                    onValor={onValor}
                    onBoleto={onBoleto}
                    onReceber={onReceber}
                    onAjustarPago={onAjustarPago}
                    onCancelar={onCancelar}
                  />
                </tr>
              ));
            }
            const row = bloco.row;
            const nome = clienteNome.get(row.cliente_id) || 'Cliente';
            const logo = clienteLogo.get(row.cliente_id);
            return [
              <tr
                key={row.id}
                className={cn(zebraRowClass(zebra++), cobrancaRowClass(row))}
              >
                <td className="px-4 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <ClienteFoto nome={nome} logo={logo} size="sm" />
                    <span className="min-w-0 truncate text-[13px] font-semibold text-slate-950 dark:text-white">{nome}</span>
                  </div>
                </td>
                <CobrancaLinhaDados
                  row={row}
                  saving={saving}
                  onValor={onValor}
                  onBoleto={onBoleto}
                  onReceber={onReceber}
                  onAjustarPago={onAjustarPago}
                  onCancelar={onCancelar}
                />
              </tr>,
            ];
            });
          })()}
        </tbody>
      </table>
    </div>
  );
}

function cobrancaSituacaoLabel(situacao) {
  if (situacao === 'pago') return 'Pago';
  if (situacao === 'atrasado') return 'Atrasado';
  if (situacao === 'sem_vencimento') return 'Sem dia';
  return 'A receber';
}

function cobrancaSituacaoClass(situacao) {
  if (situacao === 'pago') return 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200';
  if (situacao === 'atrasado') return 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200';
  if (situacao === 'sem_vencimento') return 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300';
  return 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100';
}

function Panel({ title, description, help, actions, children, className, flush }) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-[0_8px_28px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-card',
        className,
      )}
    >
      {(title || actions) && (
        <div
          className={cn(
            'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
            flush ? 'px-0 pb-3' : 'border-b border-slate-100 px-4 py-3 dark:border-white/[0.06]',
          )}
        >
          <div className="min-w-0">
            {title ? (
              <div className="flex items-center gap-1">
                <h2 className="text-[14px] font-semibold tracking-[-0.02em] text-slate-950 dark:text-white">{title}</h2>
                {help ? <Ajuda label={`Ajuda: ${title}`}>{help}</Ajuda> : null}
              </div>
            ) : null}
            {description ? (
              <p className="mt-0.5 text-[12px] leading-5 text-slate-500 dark:text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}

function StatTile({ label, scope, value, onClick, accent = 'from-violet-200/90 via-fuchsia-100/80 to-orange-100/70' }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white p-4 text-left shadow-[0_8px_24px_rgba(15,23,42,0.035)] dark:border-white/10 dark:bg-card',
        onClick && 'transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_32px_rgba(15,23,42,0.07)]',
      )}
    >
      <div className={cn('absolute inset-x-6 top-0 h-px bg-gradient-to-r opacity-80', accent)} />
      <p className="text-[13px] font-medium text-slate-600 dark:text-slate-300">{label}</p>
      <p className="mt-2 text-[24px] font-semibold leading-none tracking-[-0.03em] text-slate-950 tabular-nums dark:text-white">
        {formatMoneyBr(value)}
      </p>
      <p className="mt-2 text-[12px] text-slate-400">{scope}</p>
    </Comp>
  );
}

function DreLine({ label, value, strong, muted, divider, negative, className }) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-4 px-6 py-3.5',
        divider && 'border-t border-slate-100 dark:border-white/[0.06]',
        strong && 'font-semibold',
        className,
      )}
    >
      <span className={cn('text-[13px]', strong ? 'font-semibold' : muted ? 'text-slate-500' : 'font-medium text-slate-800 dark:text-slate-100')}>
        {label}
      </span>
      <span
        className={cn(
          'tabular-nums tracking-[-0.02em]',
          strong ? 'text-[15px] font-semibold text-slate-950 dark:text-white' : muted ? 'text-[13px] text-slate-500' : 'text-[13px] font-semibold text-slate-950 dark:text-white',
          negative && !strong && 'text-rose-600 dark:text-rose-300',
        )}
      >
        {negative && value > 0 ? `− ${formatMoneyBr(value)}` : formatMoneyBr(value)}
      </span>
    </div>
  );
}

function MoneyList({ title, count, rows, empty, onOpen, clienteNome, fotoDe, settleLabel, onSettle, saving }) {
  return (
    <Panel
      title={title}
      description={count != null ? `${count} item${count === 1 ? '' : 's'}` : undefined}
    >
      {rows.length === 0 ? (
        <div className="flex min-h-[180px] items-center justify-center px-6 py-10 text-center text-[13px] text-slate-400">
          {empty}
        </div>
      ) : (
        <ul>
          {rows.map((row, index) => {
            const name = clientLabelFromRow(row, clienteNome);
            const kind = lancamentoKind(row);
            const quando = row.data_caixa ? formatDayBr(row.data_caixa) : '';
            const sub = [kind, quando].filter(Boolean).join(' · ');
            return (
              <li key={row.id} className={cn('flex items-center gap-3 px-4 py-3 sm:px-5', zebraRowClass(index))}>
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  onClick={() => onOpen?.(row)}
                >
                  <ClienteFoto nome={name} logo={fotoDe?.(row) || ''} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-slate-900 dark:text-white">{name}</span>
                    {sub ? (
                      <span className="mt-0.5 block truncate text-[11px] text-slate-400">{sub}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-[13px] font-semibold tabular-nums tracking-[-0.02em] text-slate-950 dark:text-white">
                    {formatMoneyBr(row.valor)}
                  </span>
                </button>
                {onSettle && canSettle(row) ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 shrink-0 rounded-lg px-2 text-[11px] text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                    disabled={saving}
                    onClick={() => onSettle(row)}
                  >
                    {settleLabel || 'Confirmar'}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

export default function AgenciaFinanceiroPage() {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const aba = tabFromParams(searchParams);
  const [mesRef, setMesRef] = useState(() => monthStart(new Date()));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categorias, setCategorias] = useState([]);
  const [lancamentos, setLancamentos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [catForm, setCatForm] = useState({ nome: '', grupo: 'receita' });
  const [editingCat, setEditingCat] = useState(null);
  const [filtroGrupo, setFiltroGrupo] = useState('todos');
  const [folha, setFolha] = useState([]);
  const [pessoas, setPessoas] = useState([]);
  const [folhaOpen, setFolhaOpen] = useState(false);
  const [folhaEdit, setFolhaEdit] = useState(null);
  const [folhaForm, setFolhaForm] = useState(EMPTY_FOLHA);
  const [filtroCobranca, setFiltroCobranca] = useState('todos');
  const [receberAlvo, setReceberAlvo] = useState(null);
  const [receberData, setReceberData] = useState('');
  const [receberAjuste, setReceberAjuste] = useState(false);
  const [pagarFolhaAlvo, setPagarFolhaAlvo] = useState(null);
  const [pagarFolhaData, setPagarFolhaData] = useState('');
  const [pagarFolhaFile, setPagarFolhaFile] = useState(null);
  const [pagarFolhaTirar, setPagarFolhaTirar] = useState(false);
  const [squads, setSquads] = useState([]);
  const [contratos, setContratos] = useState([]);
  const [squadOpen, setSquadOpen] = useState(false);
  const [squadNome, setSquadNome] = useState('');
  const [squadEditId, setSquadEditId] = useState(null);
  const [squadEditNome, setSquadEditNome] = useState('');
  const [filtroSquad, setFiltroSquad] = useState('todos');
  const [pendenciasAnteriores, setPendenciasAnteriores] = useState([]);
  const [buscaCobranca, setBuscaCobranca] = useState('');
  const [buscaLancamento, setBuscaLancamento] = useState('');
  const [mostrarCancelados, setMostrarCancelados] = useState(false);
  const [cancelAlvo, setCancelAlvo] = useState(null);
  const [cancelMotivo, setCancelMotivo] = useState('');
  const [lancamentosAno, setLancamentosAno] = useState([]);
  const [fornecedores, setFornecedores] = useState([]);
  const [recorrencias, setRecorrencias] = useState([]);
  const [fornNome, setFornNome] = useState('');
  const [mostrarRecorrenciasParadas, setMostrarRecorrenciasParadas] = useState(false);

  const setAba = useCallback(
    (next) => {
      const params = new URLSearchParams(searchParams);
      if (next === 'resumo') params.delete('aba');
      else params.set('aba', next);
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const clienteNome = useMemo(() => {
    const map = new Map();
    (clientes || []).forEach((c) => map.set(c.id, c.empresa || c.nome_contato || 'Cliente'));
    return map;
  }, [clientes]);

  const clienteLogo = useMemo(() => {
    const map = new Map();
    (clientes || []).forEach((c) => {
      const url = Array.isArray(c.logo_urls) ? c.logo_urls.find(Boolean) : '';
      if (url) map.set(c.id, url);
    });
    return map;
  }, [clientes]);

  const clienteCobranca = useMemo(() => {
    const map = new Map();
    (clientes || []).forEach((c) => map.set(c.id, c));
    return map;
  }, [clientes]);

  const lancMapFolha = useMemo(() => new Map((lancamentos || []).map((l) => [l.id, l])), [lancamentos]);

  const pessoaFoto = useMemo(() => {
    const avatar = new Map();
    (pessoas || []).forEach((pessoa) => {
      if (pessoa?.avatar_url) avatar.set(pessoa.id, pessoa.avatar_url);
    });
    const map = new Map();
    (folha || []).forEach((row) => {
      const foto = avatar.get(row.profile_id);
      if (!foto) return;
      if (row.lancamento_id) map.set(row.lancamento_id, foto);
      if (row.vale_lancamento_id) map.set(row.vale_lancamento_id, foto);
    });
    return map;
  }, [folha, pessoas]);

  const fotoDoLancamento = useCallback((row) => {
    if (row?.cliente_id && clienteLogo.get(row.cliente_id)) return clienteLogo.get(row.cliente_id);
    if (row?.profile_id) {
      const pessoa = (pessoas || []).find((p) => p.id === row.profile_id);
      if (pessoa?.avatar_url) return pessoa.avatar_url;
    }
    return pessoaFoto.get(row?.id) || '';
  }, [clienteLogo, pessoaFoto, pessoas]);

  const pessoaNomeMap = useMemo(() => {
    const map = new Map();
    (pessoas || []).forEach((p) => map.set(p.id, p.full_name || 'Colaborador'));
    return map;
  }, [pessoas]);

  const categoriaNome = useMemo(() => {
    const map = new Map();
    (categorias || []).forEach((c) => map.set(c.id, c.nome));
    return map;
  }, [categorias]);

  const dre = useMemo(() => summarizeDre(lancamentos), [lancamentos]);
  const caixa = useMemo(() => summarizeCaixa(lancamentos), [lancamentos]);
  const activeRows = useMemo(() => (lancamentos || []).filter(isActiveLancamento), [lancamentos]);

  const dreBreakdown = useMemo(() => {
    const byGrupo = { receita: {}, custo: {}, despesa: {} };
    activeRows.forEach((row) => {
      if (!byGrupo[row.grupo]) return;
      const key = row.categoria_id || '_';
      byGrupo[row.grupo][key] = (byGrupo[row.grupo][key] || 0) + Number(row.valor || 0);
    });
    const toList = (grupo) =>
      Object.entries(byGrupo[grupo])
        .map(([id, valor]) => ({
          id,
          nome: categoriaNome.get(id) || 'Sem categoria',
          valor: Math.round(valor * 100) / 100,
        }))
        .sort((a, b) => b.valor - a.valor);
    return {
      receita: toList('receita'),
      custo: toList('custo'),
      despesa: toList('despesa'),
    };
  }, [activeRows, categoriaNome]);

  const aReceberRows = useMemo(
    () => activeRows.filter((l) => l.grupo === 'receita' && l.status === 'previsto').sort(byCashDate),
    [activeRows],
  );
  const aPagarRows = useMemo(
    () =>
      activeRows
        .filter(
          (l) =>
            !isOrigemFolha(l)
            && (l.grupo === 'custo' || l.grupo === 'despesa' || l.grupo === 'repasse')
            && l.status === 'previsto',
        )
        .sort(byCashDate),
    [activeRows],
  );
  const recebidoRows = useMemo(
    () => activeRows.filter((l) => (l.grupo === 'receita' || l.grupo === 'repasse') && l.status === 'recebido').sort(byCashDate),
    [activeRows],
  );
  const pagoRows = useMemo(
    () => activeRows.filter((l) => (l.grupo === 'custo' || l.grupo === 'despesa' || l.grupo === 'repasse') && l.status === 'pago').sort(byCashDate),
    [activeRows],
  );

  const categoriasDoGrupo = useMemo(
    () => categoriesByGrupo(categorias, form.grupo, { onlyActive: !editing }),
    [categorias, form.grupo, editing],
  );

  const lancamentosFiltrados = useMemo(() => {
    let outros = (lancamentos || []).filter((l) => !isOrigemFolha(l));
    if (mostrarCancelados) outros = outros.filter((l) => l.status === 'cancelado');
    else outros = outros.filter((l) => l.status !== 'cancelado');
    if (filtroGrupo === 'todos') return outros;
    return outros.filter((l) => l.grupo === filtroGrupo);
  }, [lancamentos, filtroGrupo, mostrarCancelados]);

  const lancamentosBusca = useMemo(() => {
    const q = buscaLancamento.trim().toLowerCase();
    if (!q) return lancamentosFiltrados;
    return lancamentosFiltrados.filter((row) => {
      const cliente = row.cliente_id ? clienteNome.get(row.cliente_id) : '';
      const pessoa = row.profile_id ? pessoaNomeMap.get(row.profile_id) : '';
      const cat = categoriaNome.get(row.categoria_id) || '';
      const blob = `${row.descricao || ''} ${cliente} ${pessoa} ${cat}`.toLowerCase();
      return blob.includes(q);
    });
  }, [lancamentosFiltrados, buscaLancamento, clienteNome, categoriaNome, pessoaNomeMap]);

  const formCategoria = useMemo(
    () => (categorias || []).find((c) => c.id === form.categoria_id) || null,
    [categorias, form.categoria_id],
  );
  const formEhSalario = isCategoriaSalario(formCategoria);
  const formUsaColaborador = grupoUsaColaborador(form.grupo);
  const formUsaFixo = grupoAceitaFixo(form.grupo) && !formEhSalario;

  const fornecedorNome = useMemo(() => {
    const map = new Map();
    (fornecedores || []).forEach((f) => map.set(f.id, f.nome));
    return map;
  }, [fornecedores]);

  const fornecedoresAtivos = useMemo(
    () => (fornecedores || []).filter((f) => f.ativo !== false).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR')),
    [fornecedores],
  );

  const recorrenciasVisiveis = useMemo(() => {
    const lista = (recorrencias || []).filter((r) => (mostrarRecorrenciasParadas ? true : r.ativa !== false));
    return lista.slice().sort((a, b) => {
      if ((a.ativa !== false) !== (b.ativa !== false)) return a.ativa !== false ? -1 : 1;
      return String(a.descricao || '').localeCompare(String(b.descricao || ''), 'pt-BR');
    });
  }, [recorrencias, mostrarRecorrenciasParadas]);

  const mesesPreviewRecorrente = useMemo(() => {
    if (!form.recorrente || !formUsaFixo) return [];
    return mesesDaRecorrencia({
      inicioMes: monthStart(mesRef),
      quantosMeses: form.quantos_meses,
      terminaEm: form.termina_em || null,
    });
  }, [form.recorrente, form.quantos_meses, form.termina_em, formUsaFixo, mesRef]);

  const mensalidadesDoMes = useMemo(
    () => (lancamentos || []).filter((l) => l.origem === 'mensalidade' && l.status !== 'cancelado').length,
    [lancamentos],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const competencia = monthStart(mesRef);
      const anoGrafico = Number(competencia.slice(0, 4));
      const [catRes, lancRes, cliRes, folhaRes, pessoaRes, squadRes, contratoRes, anualRes, fornRes, recRes] = await Promise.all([
        supabase.from('agencia_fin_categorias').select('id, nome, grupo, ordem, ativa').order('ordem'),
        supabase
          .from('agencia_fin_lancamentos')
          .select(LANC_COLS)
          .eq('competencia', competencia)
          .order('created_at', { ascending: false }),
        supabase
          .from('clientes')
          .select(
            'id, empresa, nome_contato, etapa, valor, dia_cobranca, dia_cobranca_2, cobranca_parcelada, inicio_na_base, logo_urls, created_at',
          )
          .order('empresa'),
        supabase
          .from('agencia_fin_folha')
          .select(FOLHA_COLS)
          .eq('competencia', competencia)
          .order('created_at', { ascending: false }),
        supabase
          .from('profiles')
          .select('id, full_name, role, status, avatar_url')
          .in('role', ['superadmin', 'admin', 'colaborador'])
          .order('full_name'),
        supabase.from('agencia_fin_squads').select('id, nome, ordem, ativo').eq('ativo', true).order('ordem').order('nome'),
        supabase.from('agencia_fin_contratos').select('id, profile_id, squad_id, funcao, salario, extras, pct_vale, vale, dia_vale, forma, dia_pagamento, ativo'),
        supabase
          .from('agencia_fin_lancamentos')
          .select('competencia, grupo, valor, status, origem')
          .gte('competencia', `${anoGrafico}-01-01`)
          .lte('competencia', `${anoGrafico}-12-01`),
        supabase.from('agencia_fin_fornecedores').select(FORN_COLS).order('nome'),
        supabase.from('agencia_fin_recorrencias').select(REC_COLS).order('created_at', { ascending: false }),
      ]);

      if (catRes.error) throw catRes.error;
      if (lancRes.error) throw lancRes.error;
      if (cliRes.error) throw cliRes.error;
      if (folhaRes.error) throw folhaRes.error;
      if (pessoaRes.error) throw pessoaRes.error;
      if (squadRes.error) throw squadRes.error;
      if (contratoRes.error) throw contratoRes.error;
      if (anualRes.error) throw anualRes.error;
      if (fornRes.error) throw fornRes.error;
      if (recRes.error) throw recRes.error;

      const cats = catRes.data || [];
      const clients = cliRes.data || [];
      let rows = lancRes.data || [];
      const listaRecorrencias = recRes.data || [];
      const cancelarIds = mensalidadesPrevistasAntesEntrada({ clients, lancamentos: rows });
      if (cancelarIds.length) {
        for (const id of cancelarIds) {
          const { error } = await supabase.from('agencia_fin_lancamentos').update({ status: 'cancelado' }).eq('id', id);
          if (error) throw error;
        }
        const limpo = await supabase
          .from('agencia_fin_lancamentos')
          .select(LANC_COLS)
          .eq('competencia', competencia)
          .order('created_at', { ascending: false });
        if (limpo.error) throw limpo.error;
        rows = limpo.data || [];
      }

      const faltamFixos = recorrenciasToCreate({
        recorrencias: listaRecorrencias,
        existingLancamentos: rows,
        mesRef: competencia,
      });
      if (faltamFixos.length) {
        const insFixos = await supabase.from('agencia_fin_lancamentos').insert(faltamFixos).select(LANC_COLS);
        if (insFixos.error) throw insFixos.error;
        rows = [...(insFixos.data || []), ...rows];
      }

      const listaSquads = squadRes.data || [];
      const listaContratos = contratoRes.data || [];
      const listaPessoas = pessoaRes.data || [];
      let listaFolha = folhaRes.data || [];
      const lancMapLoad = new Map(rows.map((l) => [l.id, l]));
      for (const row of listaFolha) {
        const patch = patchFolhaFromLancamentos(row, lancMapLoad);
        if (Object.keys(patch).length) {
          const { error } = await supabase.from('agencia_fin_folha').update(patch).eq('id', row.id);
          if (error) throw error;
          Object.assign(row, patch);
        }
      }
      const salarioCatLoad = findCategoriaSalario(cats);
      for (const row of listaFolha) {
        const nome = listaPessoas.find((p) => p.id === row.profile_id)?.full_name || 'Colaborador';
        const contrato = listaContratos.find((c) => c.profile_id === row.profile_id);
        const base = {
          ...row,
          dia_pagamento: contrato?.dia_pagamento,
          dia_vale: contrato?.dia_vale,
        };
        const valeLanc = row.vale_lancamento_id ? lancMapLoad.get(row.vale_lancamento_id) : null;
        if (valeLanc?.status === 'cancelado' && salarioCatLoad?.id) {
          const payload = buildValeLancamento({
            folha: { ...base, vale_status: 'previsto', vale_pago_em: null },
            mesRef: competencia,
            categoriaId: salarioCatLoad.id,
            nome,
          });
          if (payload) {
            const ins = await supabase.from('agencia_fin_lancamentos').insert(payload).select('id').single();
            if (ins.error) throw ins.error;
            const { error } = await supabase
              .from('agencia_fin_folha')
              .update({ vale_lancamento_id: ins.data.id, vale_status: 'previsto', vale_pago_em: null })
              .eq('id', row.id);
            if (error) throw error;
            row.vale_lancamento_id = ins.data.id;
            row.vale_status = 'previsto';
            row.vale_pago_em = null;
            lancMapLoad.set(ins.data.id, { ...payload, id: ins.data.id });
            rows = [...rows, { ...payload, id: ins.data.id, created_at: new Date().toISOString() }];
          }
        }
        const pagLanc = row.lancamento_id ? lancMapLoad.get(row.lancamento_id) : null;
        if (pagLanc?.status === 'cancelado' && salarioCatLoad?.id) {
          const payload = buildFolhaLancamento({
            folha: { ...base, status: 'previsto', pago_em: null },
            mesRef: competencia,
            categoriaId: salarioCatLoad.id,
            nome,
          });
          if (payload) {
            const ins = await supabase.from('agencia_fin_lancamentos').insert(payload).select('id').single();
            if (ins.error) throw ins.error;
            const { error } = await supabase
              .from('agencia_fin_folha')
              .update({ lancamento_id: ins.data.id, status: 'previsto', pago_em: null })
              .eq('id', row.id);
            if (error) throw error;
            row.lancamento_id = ins.data.id;
            row.status = 'previsto';
            row.pago_em = null;
            lancMapLoad.set(ins.data.id, { ...payload, id: ins.data.id });
            rows = [...rows, { ...payload, id: ins.data.id, created_at: new Date().toISOString() }];
          }
        }
      }
      const pendRes = await supabase
        .from('agencia_fin_lancamentos')
        .select(LANC_COLS)
        .eq('status', 'previsto')
        .neq('origem', 'folha')
        .lt('competencia', competencia)
        .order('data_caixa', { ascending: true })
        .limit(40);

      setCategorias(cats);
      setClientes(clients);
      setLancamentos(rows);
      setFolha(listaFolha);
      setPessoas(listaPessoas);
      setSquads(listaSquads);
      setContratos(listaContratos);
      setLancamentosAno(anualRes.data || []);
      setFornecedores(fornRes.data || []);
      setRecorrencias(listaRecorrencias);
      setPendenciasAnteriores(pendRes.error ? [] : (pendRes.data || []).filter((l) => !isOrigemFolha(l)));
    } catch (error) {
      console.error(error);
      toast({
        title: 'Não foi possível carregar o financeiro',
        description: error.message || 'Tente de novo.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [mesRef, toast]);

  const gerarMensalidadesDoMes = async () => {
    setSaving(true);
    try {
      const competencia = monthStart(mesRef);
      const cat = findCategoriaMensalidade(categorias);
      if (!cat) {
        toast({ title: 'Falta a categoria Mensalidade', variant: 'destructive' });
        return;
      }
      const rebalance = rebalanceMensalidadesParceladas({
        clients: clientes,
        lancamentos: lancamentos,
        mesRef: competencia,
      });
      for (const patch of rebalance) {
        const { error } = await supabase.from('agencia_fin_lancamentos').update({ valor: patch.valor }).eq('id', patch.id);
        if (error) throw error;
      }
      let baseLanc = lancamentos;
      if (rebalance.length) {
        const reb = await supabase
          .from('agencia_fin_lancamentos')
          .select(LANC_COLS)
          .eq('competencia', competencia)
          .order('created_at', { ascending: false });
        if (reb.error) throw reb.error;
        baseLanc = reb.data || [];
      }
      const faltam = mensalidadesToCreate({
        clients: clientes,
        existingLancamentos: baseLanc,
        mesRef: competencia,
        categoriaId: cat.id,
      });
      if (!faltam.length && !rebalance.length) {
        toast({ title: 'As mensalidades deste mês já estão geradas' });
        return;
      }
      for (const payload of faltam) {
        const { error } = await supabase.from('agencia_fin_lancamentos').insert(payload);
        if (error) throw error;
      }
      await load();
      const partes = [];
      if (rebalance.length) partes.push(`${rebalance.length} valor${rebalance.length === 1 ? '' : 'es'} ajustado${rebalance.length === 1 ? '' : 's'}`);
      if (faltam.length) partes.push(`${faltam.length} cobrança${faltam.length === 1 ? '' : 's'} criada${faltam.length === 1 ? '' : 's'}`);
      toast({ title: partes.join(' · ') || 'Mensalidades atualizadas' });
    } catch (error) {
      toast({ title: 'Não foi possível gerar as mensalidades', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const gerarFolhasDoMes = async () => {
    setSaving(true);
    try {
      const competencia = monthStart(mesRef);
      const salarioCat = findCategoriaSalario(categorias);
      const atuais = await supabase.from('agencia_fin_folha').select(FOLHA_COLS).eq('competencia', competencia);
      if (atuais.error) throw atuais.error;
      const faltamFolha = folhasToCreate({ contratos, existingFolha: atuais.data || [], mesRef: competencia });
      if (!salarioCat) {
        toast({ title: 'Falta a categoria Salário', variant: 'destructive' });
        return;
      }
      if (!faltamFolha.length) {
        toast({ title: 'As folhas deste mês já estão geradas' });
        return;
      }
      for (const item of faltamFolha) {
        const nome = pessoas.find((pessoa) => pessoa.id === item.profile_id)?.full_name || 'Colaborador';
        const { dia_pagamento: _dia, dia_vale: _diaVale, ...folhaRow } = item;
        const lancPayload = buildFolhaLancamento({ folha: item, mesRef: competencia, categoriaId: salarioCat.id, nome });
        if (!lancPayload) continue;
        const lanc = await supabase.from('agencia_fin_lancamentos').insert(lancPayload).select('id').single();
        if (lanc.error) throw lanc.error;
        let valeLancamentoId = null;
        const valePayload = buildValeLancamento({ folha: item, mesRef: competencia, categoriaId: salarioCat.id, nome });
        if (valePayload) {
          const valeLanc = await supabase.from('agencia_fin_lancamentos').insert(valePayload).select('id').single();
          if (valeLanc.error) throw valeLanc.error;
          valeLancamentoId = valeLanc.data.id;
        }
        const gravada = await supabase
          .from('agencia_fin_folha')
          .insert({ ...folhaRow, lancamento_id: lanc.data.id, vale_lancamento_id: valeLancamentoId });
        if (gravada.error) throw gravada.error;
      }
      await load();
      toast({ title: 'Folhas deste mês geradas' });
    } catch (error) {
      toast({ title: 'Não foi possível gerar as folhas', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = (presetGrupo) => {
    setEditing(null);
    const grupo = presetGrupo || 'receita';
    const first = categoriesByGrupo(categorias, grupo)[0];
    setForm({
      ...EMPTY_FORM,
      grupo,
      categoria_id: first?.id || '',
      data_caixa: format(new Date(), 'yyyy-MM-dd'),
    });
    setDialogOpen(true);
  };

  const openEdit = (row) => {
    if (row.status === 'cancelado') return;
    setEditing(row);
    const parte = folhaParteFromDescricao(row.descricao) || 'pagamento';
    setForm({
      grupo: row.grupo,
      categoria_id: row.categoria_id,
      cliente_id: row.cliente_id || '',
      profile_id: row.profile_id || '',
      fornecedor_id: row.fornecedor_id || '',
      folha_parte: parte,
      descricao: row.descricao || '',
      valor: String(row.valor ?? ''),
      data_caixa: row.data_caixa || '',
      status: row.status,
      recorrente: false,
      quantos_meses: '12',
      termina_em: '',
    });
    setDialogOpen(true);
  };

  const onGrupoChange = (grupo) => {
    const first = categoriesByGrupo(categorias, grupo)[0];
    setForm((prev) => ({
      ...prev,
      grupo,
      categoria_id: first?.id || '',
      status: prev.status === 'cancelado' ? 'previsto' : prev.status,
      cliente_id: grupoUsaColaborador(grupo) ? '' : prev.cliente_id,
      profile_id: grupoUsaColaborador(grupo) ? prev.profile_id : '',
      fornecedor_id: grupoAceitaFixo(grupo) ? prev.fornecedor_id : '',
      folha_parte: 'pagamento',
      recorrente: grupoAceitaFixo(grupo) ? prev.recorrente : false,
    }));
  };

  const garantirFolhaDoMes = async (profileId, competencia) => {
    const existente = (folha || []).find((f) => f.profile_id === profileId);
    if (existente) return existente;
    const contrato = contratos.find((c) => c.profile_id === profileId && c.ativo !== false);
    if (!contrato) {
      throw new Error('Coloque a pessoa na Equipe antes de lançar salário ou vale.');
    }
    const criadas = folhasToCreate({
      contratos: [contrato],
      existingFolha: [],
      mesRef: competencia,
    });
    const item = criadas[0];
    if (!item) throw new Error('Não foi possível montar a folha desta pessoa.');
    const { dia_pagamento: _d, dia_vale: _v, ...folhaRow } = item;
    const ins = await supabase.from('agencia_fin_folha').insert(folhaRow).select(FOLHA_COLS).single();
    if (ins.error) throw ins.error;
    return ins.data;
  };

  const saveLancamento = async () => {
    const valor = Number(String(form.valor).replace(',', '.'));
    const cat = (categorias || []).find((c) => c.id === form.categoria_id) || null;
    const ehSalario = isCategoriaSalario(cat);
    const usaColab = grupoUsaColaborador(form.grupo);
    const profileId = usaColab ? (form.profile_id || null) : null;
    const clienteId = !usaColab ? (form.cliente_id || null) : null;

    if (!form.categoria_id) {
      toast({ title: 'Escolha a categoria', variant: 'destructive' });
      return;
    }
    if (!(valor > 0)) {
      toast({ title: 'Informe um valor maior que zero', variant: 'destructive' });
      return;
    }
    if (ehSalario && !profileId) {
      toast({ title: 'Escolha o colaborador', variant: 'destructive' });
      return;
    }
    if (!ehSalario && !String(form.descricao || '').trim()) {
      toast({ title: 'Informe a descrição', variant: 'destructive' });
      return;
    }

    const competencia = monthStart(mesRef);
    const nomePessoa = profileId
      ? (pessoas.find((p) => p.id === profileId)?.full_name || 'Colaborador')
      : '';
    const parte = form.folha_parte === 'vale' ? 'vale' : 'pagamento';
    const descricao = ehSalario
      ? descricaoFolhaParte(parte, nomePessoa)
      : String(form.descricao).trim();

    setSaving(true);
    try {
      const payloadBase = {
        competencia,
        data_caixa: form.data_caixa || null,
        grupo: form.grupo,
        categoria_id: form.categoria_id,
        cliente_id: clienteId,
        profile_id: profileId,
        descricao,
        valor: Math.round(valor * 100) / 100,
        status: form.status || 'previsto',
      };

      if (ehSalario) {
        const folhaRow = await garantirFolhaDoMes(profileId, competencia);
        const colId = parte === 'vale' ? 'vale_lancamento_id' : 'lancamento_id';
        const linkedId = folhaRow[colId] || null;
        const linked = linkedId ? (lancamentos || []).find((l) => l.id === linkedId) : null;
        const targetId = editing?.id
          || (linked && linked.status !== 'cancelado' ? linked.id : null);

        const payload = {
          ...payloadBase,
          origem: 'folha',
          status: form.status === 'pago' || form.status === 'recebido' ? 'pago' : 'previsto',
        };

        let lancId = targetId;
        if (targetId) {
          const { error } = await supabase.from('agencia_fin_lancamentos').update(payload).eq('id', targetId);
          if (error) throw error;
          if (!folhaRow[colId] || folhaRow[colId] !== targetId) {
            const link = await supabase.from('agencia_fin_folha').update({ [colId]: targetId }).eq('id', folhaRow.id);
            if (link.error) throw link.error;
          }
        } else {
          const ins = await supabase.from('agencia_fin_lancamentos').insert(payload).select('id').single();
          if (ins.error) throw ins.error;
          lancId = ins.data.id;
          const folhaPatch = {
            [colId]: lancId,
            ...folhaCamposFromLancamentoStatus(parte, payload.status, payload.data_caixa),
          };
          const upd = await supabase.from('agencia_fin_folha').update(folhaPatch).eq('id', folhaRow.id);
          if (upd.error) throw upd.error;
        }

        await syncFolhaFromLancamento({
          id: lancId,
          origem: 'folha',
          descricao: payload.descricao,
          status: payload.status,
          data_caixa: payload.data_caixa,
        });
      } else {
        const origem =
          editing?.origem === 'mensalidade' || editing?.origem === 'folha'
            ? editing.origem
            : 'manual';
        const fornecedorId = grupoAceitaFixo(form.grupo) ? (form.fornecedor_id || null) : null;
        const querRecorrente = !editing && form.recorrente && grupoAceitaFixo(form.grupo);

        if (querRecorrente) {
          const meses = mesesDaRecorrencia({
            inicioMes: competencia,
            quantosMeses: form.quantos_meses,
            terminaEm: form.termina_em || null,
          });
          if (!meses.length) {
            toast({ title: 'Informe quantos meses ou a data de término', variant: 'destructive' });
            return;
          }
          const dia = normalizeDiaCobranca(Number(String(form.data_caixa || '').slice(8, 10))) || 10;
          const ultimoMes = meses[meses.length - 1];
          const recIns = await supabase
            .from('agencia_fin_recorrencias')
            .insert({
              fornecedor_id: fornecedorId,
              grupo: form.grupo,
              categoria_id: form.categoria_id,
              descricao,
              valor: Math.round(valor * 100) / 100,
              dia_vencimento: dia,
              termina_em: form.termina_em ? monthStart(form.termina_em) : ultimoMes,
              ativa: true,
            })
            .select(REC_COLS)
            .single();
          if (recIns.error) throw recIns.error;
          const payloads = meses.map((mes) =>
            buildRecorrenciaLancamento({
              recorrencia: {
                ...recIns.data,
                valor: Math.round(valor * 100) / 100,
                descricao,
                categoria_id: form.categoria_id,
                grupo: form.grupo,
                fornecedor_id: fornecedorId,
                dia_vencimento: dia,
              },
              mesRef: mes,
            }),
          ).filter(Boolean);
          if (meses[0] === competencia && form.data_caixa) {
            payloads[0] = {
              ...payloads[0],
              data_caixa: form.data_caixa,
              status: form.status || 'previsto',
            };
          }
          const { error } = await supabase.from('agencia_fin_lancamentos').insert(payloads);
          if (error) throw error;
        } else {
          const payload = {
            ...payloadBase,
            origem,
            fornecedor_id: fornecedorId,
            recorrencia_id: editing?.recorrencia_id || null,
          };
          let error;
          if (editing?.id) {
            ({ error } = await supabase.from('agencia_fin_lancamentos').update(payload).eq('id', editing.id));
          } else {
            ({ error } = await supabase.from('agencia_fin_lancamentos').insert(payload));
          }
          if (error) throw error;
          if (editing?.id && editing.origem === 'folha') {
            await syncFolhaFromLancamento({
              id: editing.id,
              origem: payload.origem,
              descricao: payload.descricao,
              status: payload.status,
              data_caixa: payload.data_caixa,
            });
          }
        }
      }

      setDialogOpen(false);
      setEditing(null);
      await load();
      toast({
        title: editing
          ? 'Lançamento atualizado'
          : form.recorrente && grupoAceitaFixo(form.grupo)
            ? 'Recorrência criada'
            : 'Lançamento criado',
      });
    } catch (error) {
      toast({
        title: 'Não foi possível salvar',
        description: error.message || 'Tente de novo.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const abrirRecebimento = (row) => {
    setReceberAjuste(false);
    setReceberData(civilToday());
    setReceberAlvo(row);
  };

  const abrirAjustePago = (row) => {
    setReceberAjuste(true);
    setReceberData(row.pagoEm || civilToday());
    setReceberAlvo(row);
  };

  const salvarDataRecebimento = async (row, dataIso) => {
    const data = String(dataIso || '').slice(0, 10);
    if (!row?.id || !data) {
      toast({ title: 'Informe a data do recebimento', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('agencia_fin_lancamentos').update({ data_caixa: data }).eq('id', row.id);
      if (error) throw error;
      await load();
      toast({ title: 'Data do recebimento atualizada' });
    } catch (error) {
      toast({ title: 'Não foi possível salvar a data', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const settle = async (row, dataCaixa) => {
    if (!canSettle(row)) return;
    const quando = String(dataCaixa || '').slice(0, 10) || civilToday();
    setSaving(true);
    try {
      const { error } = await supabase
        .from('agencia_fin_lancamentos')
        .update({
          status: settleStatusForGrupo(row.grupo),
          data_caixa: row.grupo === 'receita' ? quando : (row.data_caixa || quando),
        })
        .eq('id', row.id);
      if (error) throw error;
      await load();
      toast({ title: row.grupo === 'receita' ? 'Recebimento registrado manualmente' : 'Pagamento registrado manualmente' });
    } catch (error) {
      toast({ title: 'Não foi possível atualizar', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const marcarBoleto = async (row) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('agencia_fin_lancamentos')
        .update({ boleto_em: format(new Date(), 'yyyy-MM-dd') })
        .eq('id', row.id);
      if (error) throw error;
      await load();
      toast({ title: 'Boleto marcado como enviado' });
    } catch (error) {
      toast({ title: 'Não foi possível marcar o boleto', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const salvarValorCobranca = async (row, valor) => {
    setSaving(true);
    try {
      const client = clienteCobranca.get(row.cliente_id);
      const parcelada = Boolean(client?.cobranca_parcelada);
      let totalMensal = Math.round(Number(valor) * 100) / 100;
      if (row.cliente_id && row.origem === 'mensalidade' && parcelada) {
        const irma = (lancamentos || []).find(
          (l) =>
            l.id !== row.id
            && l.cliente_id === row.cliente_id
            && l.origem === 'mensalidade'
            && l.competencia === row.competencia
            && l.status !== 'cancelado',
        );
        totalMensal = Math.round((Number(valor) + Number(irma?.valor || 0)) * 100) / 100;
        const { parcela1, parcela2 } = splitMensalidadeValor(totalMensal);
        const updates = [
          { id: row.id, valor: Number(row.parcela_mensalidade) === 2 ? parcela2 : parcela1 },
        ];
        if (irma) {
          updates.push({ id: irma.id, valor: Number(irma.parcela_mensalidade) === 2 ? parcela2 : parcela1 });
        }
        for (const patch of updates) {
          const { error } = await supabase.from('agencia_fin_lancamentos').update({ valor: patch.valor }).eq('id', patch.id);
          if (error) throw error;
        }
        const cliente = await supabase.from('clientes').update({ valor: totalMensal }).eq('id', row.cliente_id);
        if (cliente.error) throw cliente.error;
      } else {
        const { error } = await supabase.from('agencia_fin_lancamentos').update({ valor: totalMensal }).eq('id', row.id);
        if (error) throw error;
        if (row.cliente_id && row.origem === 'mensalidade') {
          const cliente = await supabase.from('clientes').update({ valor: totalMensal }).eq('id', row.cliente_id);
          if (cliente.error) throw cliente.error;
        }
      }
      await load();
      toast({ title: 'Valor atualizado' });
    } catch (error) {
      toast({ title: 'Não foi possível salvar o valor', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const abrirGestao = (pessoa) => {
    const contrato = contratos.find((item) => item.profile_id === pessoa.id) || null;
    const linha = folha.find((item) => item.profile_id === pessoa.id) || null;
    const naFolha = Boolean(contrato && contrato.ativo !== false);
    const pct = linha?.pct_vale ?? contrato?.pct_vale ?? 0;
    setFolhaEdit(linha);
    setFolhaForm({
      profile_id: pessoa.id,
      funcao: linha?.funcao || contrato?.funcao || '',
      salario: String(linha?.salario ?? contrato?.salario ?? ''),
      extras: String(linha?.extras ?? contrato?.extras ?? ''),
      desconto: linha?.desconto ? String(linha.desconto) : '',
      desconto_motivo: linha?.desconto_motivo || '',
      forma: linha?.forma || contrato?.forma || 'pix',
      status: linha?.status || 'previsto',
      pago_em: linha?.pago_em || '',
      vale_status: linha?.vale_status || 'previsto',
      vale_pago_em: linha?.vale_pago_em || '',
      squad_id: naFolha ? (contrato?.squad_id || '') : '',
      dia_pagamento: contrato?.dia_pagamento ? String(contrato.dia_pagamento) : '',
      dia_vale: contrato?.dia_vale ? String(contrato.dia_vale) : '',
      pct_vale: pct ? String(pct) : '',
      pct_pagamento: String(100 - (Number(pct) || 0)),
    });
    setFolhaOpen(true);
  };

  const saveFolha = async () => {
    const salario = Number(String(folhaForm.salario).replace(',', '.'));
    const extras = Number(String(folhaForm.extras || '0').replace(',', '.')) || 0;
    const desconto = Number(String(folhaForm.desconto || '0').replace(',', '.')) || 0;
    const descontoMotivo = String(folhaForm.desconto_motivo || '').trim();
    const partes = splitSalario(salario, folhaForm.pct_vale);
    const vale = partes.vale;
    if (!folhaForm.profile_id) {
      toast({ title: 'Escolha a pessoa', variant: 'destructive' });
      return;
    }
    if (!(salario > 0)) {
      toast({ title: 'Informe o salário', variant: 'destructive' });
      return;
    }
    const cat = findCategoriaSalario(categorias);
    if (!cat) {
      toast({ title: 'Falta a categoria Salário', variant: 'destructive' });
      return;
    }
    const pagPago = folhaEdit ? folhaPagamentoLiquidado(folhaEdit, lancMapFolha) : false;
    const checkDesconto = validarDescontoFolha(
      {
        salario,
        extras,
        pct_vale: partes.pctVale,
        desconto,
        desconto_motivo: descontoMotivo,
      },
      { pagamentoPago: pagPago, descontoAnterior: folhaEdit?.desconto ?? 0 },
    );
    if (!checkDesconto.ok) {
      toast({ title: checkDesconto.message, variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const pessoa = pessoas.find((p) => p.id === folhaForm.profile_id);
      const nome = pessoa?.full_name || 'Colaborador';
      const pago = folhaForm.status === 'pago';
      const valePago = vale > 0 && folhaForm.vale_status === 'pago';
      const draft = {
        salario,
        extras,
        desconto: checkDesconto.desconto,
        desconto_motivo: checkDesconto.motivo,
        vale,
        pct_vale: partes.pctVale,
        status: pago ? 'pago' : 'previsto',
        pago_em: pago ? (folhaForm.pago_em || format(new Date(), 'yyyy-MM-dd')) : null,
        dia_pagamento: normalizeDiaCobranca(folhaForm.dia_pagamento),
        vale_status: valePago ? 'pago' : 'previsto',
        vale_pago_em: valePago ? (folhaForm.vale_pago_em || format(new Date(), 'yyyy-MM-dd')) : null,
        dia_vale: normalizeDiaCobranca(folhaForm.dia_vale),
      };
      const lancPayload = buildFolhaLancamento({
        folha: draft,
        mesRef,
        categoriaId: cat.id,
        nome,
      });
      let lancamentoId = folhaEdit?.lancamento_id || null;
      if (lancPayload) {
        if (lancamentoId) {
          const upd = await supabase.from('agencia_fin_lancamentos').update(lancPayload).eq('id', lancamentoId);
          if (upd.error) throw upd.error;
        } else {
          const ins = await supabase.from('agencia_fin_lancamentos').insert(lancPayload).select('id').single();
          if (ins.error) throw ins.error;
          lancamentoId = ins.data.id;
        }
      } else if (lancamentoId && folhaEdit?.status !== 'pago') {
        const cancelado = await supabase.from('agencia_fin_lancamentos').update({ status: 'cancelado' }).eq('id', lancamentoId);
        if (cancelado.error) throw cancelado.error;
        lancamentoId = null;
      }
      let valeLancamentoId = folhaEdit?.vale_lancamento_id || null;
      const valePayload = buildValeLancamento({
        folha: draft,
        mesRef,
        categoriaId: cat.id,
        nome,
      });
      if (valePayload) {
        if (valeLancamentoId) {
          const updVale = await supabase.from('agencia_fin_lancamentos').update(valePayload).eq('id', valeLancamentoId);
          if (updVale.error) throw updVale.error;
        } else {
          const insVale = await supabase.from('agencia_fin_lancamentos').insert(valePayload).select('id').single();
          if (insVale.error) throw insVale.error;
          valeLancamentoId = insVale.data.id;
        }
      } else if (valeLancamentoId && folhaEdit?.vale_status !== 'pago') {
        const cancelado = await supabase.from('agencia_fin_lancamentos').update({ status: 'cancelado' }).eq('id', valeLancamentoId);
        if (cancelado.error) throw cancelado.error;
        valeLancamentoId = null;
      }
      const folhaPayload = {
        competencia: monthStart(mesRef),
        profile_id: folhaForm.profile_id,
        funcao: String(folhaForm.funcao || '').trim(),
        salario: Math.round(salario * 100) / 100,
        extras: Math.round(extras * 100) / 100,
        desconto: checkDesconto.desconto,
        desconto_motivo: checkDesconto.motivo,
        vale: Math.round(Math.max(vale, 0) * 100) / 100,
        pct_vale: partes.pctVale,
        vale_status: draft.vale_status,
        vale_pago_em: draft.vale_pago_em,
        vale_lancamento_id: valeLancamentoId,
        forma: folhaForm.forma || 'pix',
        status: draft.status,
        pago_em: draft.pago_em,
        lancamento_id: lancamentoId,
      };
      const saved = folhaEdit?.id
        ? await supabase.from('agencia_fin_folha').update(folhaPayload).eq('id', folhaEdit.id)
        : await supabase.from('agencia_fin_folha').insert(folhaPayload);
      if (saved.error) throw saved.error;
      const contratoPayload = {
        profile_id: folhaForm.profile_id,
        squad_id: folhaForm.squad_id || null,
        funcao: String(folhaForm.funcao || '').trim(),
        salario: Math.round(salario * 100) / 100,
        extras: Math.round(extras * 100) / 100,
        vale: Math.round(Math.max(vale, 0) * 100) / 100,
        pct_vale: partes.pctVale,
        dia_vale: normalizeDiaCobranca(folhaForm.dia_vale),
        forma: folhaForm.forma || 'pix',
        dia_pagamento: normalizeDiaCobranca(folhaForm.dia_pagamento),
        ativo: true,
      };
      const contratoAtual = contratos.find((item) => item.profile_id === folhaForm.profile_id);
      const contratoSalvo = contratoAtual?.id
        ? await supabase.from('agencia_fin_contratos').update(contratoPayload).eq('id', contratoAtual.id)
        : await supabase.from('agencia_fin_contratos').insert(contratoPayload);
      if (contratoSalvo.error) throw contratoSalvo.error;
      setFolhaOpen(false);
      await load();
      toast({ title: folhaEdit ? 'Registro atualizado' : 'Salário registrado' });
    } catch (error) {
      toast({ title: 'Não foi possível salvar', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const abrirPagamentoEquipe = (row, parte, ajuste = false) => {
    const pagoEm = parte === 'vale' ? row?.vale_pago_em : row?.pago_em;
    setPagarFolhaData(ajuste && pagoEm ? String(pagoEm).slice(0, 10) : civilToday());
    setPagarFolhaFile(null);
    setPagarFolhaTirar(false);
    setPagarFolhaAlvo({ row, parte, ajuste });
  };

  const abrirComprovanteFolha = async (row, parte) => {
    const path = comprovantePathDaFolha(row, parte);
    if (!path) return;
    try {
      const { data, error } = await supabase.storage.from(COMPROVANTE_BUCKET).createSignedUrl(path, 120);
      if (error) throw error;
      if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast({ title: 'Não foi possível abrir o comprovante', description: error.message, variant: 'destructive' });
    }
  };

  const aplicarComprovanteFolha = async (row, parte, { file, tirar } = {}) => {
    if (!row?.id) return comprovantePathDaFolha(row, parte);
    const col = comprovanteColuna(parte);
    const atual = comprovantePathDaFolha(row, parte);
    if (tirar) {
      if (atual) {
        await supabase.storage.from(COMPROVANTE_BUCKET).remove([atual]);
      }
      const { error } = await supabase.from('agencia_fin_folha').update({ [col]: null }).eq('id', row.id);
      if (error) throw error;
      return null;
    }
    if (!file) return atual;
    if (!COMPROVANTE_MIME.has(file.type)) {
      throw new Error('Use PDF, JPG, PNG ou WEBP.');
    }
    if (file.size > COMPROVANTE_MAX_BYTES) {
      throw new Error('Arquivo até 8 MB.');
    }
    const path = `folha/${row.id}/${parte}/${Date.now()}-${safeComprovanteNome(file.name)}`;
    const { error: upErr } = await supabase.storage.from(COMPROVANTE_BUCKET).upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (upErr) throw upErr;
    if (atual && atual !== path) {
      await supabase.storage.from(COMPROVANTE_BUCKET).remove([atual]);
    }
    const { error } = await supabase.from('agencia_fin_folha').update({ [col]: path }).eq('id', row.id);
    if (error) throw error;
    return path;
  };

  const salvarDataPagamentoEquipe = async (row, parte, dataIso) => {
    const data = String(dataIso || '').slice(0, 10);
    if (!row?.id || !data) {
      toast({ title: 'Informe a data do pagamento', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      if (parte === 'vale') {
        if (row.vale_lancamento_id) {
          const upd = await supabase.from('agencia_fin_lancamentos').update({ data_caixa: data }).eq('id', row.vale_lancamento_id);
          if (upd.error) throw upd.error;
        }
        const { error } = await supabase.from('agencia_fin_folha').update({ vale_pago_em: data }).eq('id', row.id);
        if (error) throw error;
      } else {
        if (row.lancamento_id) {
          const upd = await supabase.from('agencia_fin_lancamentos').update({ data_caixa: data }).eq('id', row.lancamento_id);
          if (upd.error) throw upd.error;
        }
        const { error } = await supabase.from('agencia_fin_folha').update({ pago_em: data }).eq('id', row.id);
        if (error) throw error;
      }
      await load();
      toast({ title: 'Data do pagamento atualizada' });
    } catch (error) {
      toast({ title: 'Não foi possível salvar a data', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const pagarFolha = async (row, dataCaixa) => {
    setSaving(true);
    try {
      const pagoEm = String(dataCaixa || '').slice(0, 10) || civilToday();
      if (row.lancamento_id) {
        const upd = await supabase.from('agencia_fin_lancamentos').update({ status: 'pago', data_caixa: pagoEm }).eq('id', row.lancamento_id);
        if (upd.error) throw upd.error;
      }
      const { error } = await supabase.from('agencia_fin_folha').update({ status: 'pago', pago_em: pagoEm }).eq('id', row.id);
      if (error) throw error;
      await load();
      toast({ title: 'Pagamento registrado' });
    } catch (error) {
      toast({ title: 'Não foi possível atualizar', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const pagarVale = async (row, dataCaixa) => {
    setSaving(true);
    try {
      const pagoEm = String(dataCaixa || '').slice(0, 10) || civilToday();
      if (row.vale_lancamento_id) {
        const upd = await supabase.from('agencia_fin_lancamentos').update({ status: 'pago', data_caixa: pagoEm }).eq('id', row.vale_lancamento_id);
        if (upd.error) throw upd.error;
      }
      const { error } = await supabase.from('agencia_fin_folha').update({ vale_status: 'pago', vale_pago_em: pagoEm }).eq('id', row.id);
      if (error) throw error;
      await load();
      toast({ title: 'Vale registrado' });
    } catch (error) {
      toast({ title: 'Não foi possível atualizar', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const syncFolhaFromLancamento = async (lanc) => {
    if (!lanc?.id || lanc.origem !== 'folha') return;
    const [byVale, byPag] = await Promise.all([
      supabase.from('agencia_fin_folha').select('id').eq('vale_lancamento_id', lanc.id).limit(1),
      supabase.from('agencia_fin_folha').select('id').eq('lancamento_id', lanc.id).limit(1),
    ]);
    if (byVale.error) throw byVale.error;
    if (byPag.error) throw byPag.error;
    const folhaId = byVale.data?.[0]?.id || byPag.data?.[0]?.id;
    if (!folhaId) return;
    const parte = byVale.data?.[0]?.id ? 'vale' : 'pagamento';
    const patch = folhaCamposFromLancamentoStatus(parte, lanc.status, lanc.data_caixa);
    const { error } = await supabase.from('agencia_fin_folha').update(patch).eq('id', folhaId);
    if (error) throw error;
  };

  const recriarLancamentoFolhaSeCancelado = async (lanc, parte) => {
    if (!lanc?.id || lanc.status !== 'cancelado' || !parte) return;
    const col = parte === 'vale' ? 'vale_lancamento_id' : 'lancamento_id';
    const { data: folhaRows, error: selErr } = await supabase.from('agencia_fin_folha').select(FOLHA_COLS).eq(col, lanc.id).limit(1);
    if (selErr) throw selErr;
    const folhaRow = folhaRows?.[0];
    if (!folhaRow) return;
    const cat = findCategoriaSalario(categorias);
    const nome = pessoas.find((p) => p.id === folhaRow.profile_id)?.full_name || 'Colaborador';
    const contrato = contratos.find((c) => c.profile_id === folhaRow.profile_id);
    const mes = folhaRow.competencia || monthStart(mesRef);
    const base = {
      ...folhaRow,
      dia_pagamento: contrato?.dia_pagamento,
      dia_vale: contrato?.dia_vale,
      status: parte === 'pagamento' ? 'previsto' : folhaRow.status,
      pago_em: parte === 'pagamento' ? null : folhaRow.pago_em,
      vale_status: parte === 'vale' ? 'previsto' : folhaRow.vale_status,
      vale_pago_em: parte === 'vale' ? null : folhaRow.vale_pago_em,
    };
    if (parte === 'vale') {
      const payload = buildValeLancamento({ folha: base, mesRef: mes, categoriaId: cat?.id, nome });
      if (!payload) return;
      const ins = await supabase.from('agencia_fin_lancamentos').insert(payload).select('id').single();
      if (ins.error) throw ins.error;
      const { error } = await supabase
        .from('agencia_fin_folha')
        .update({ vale_lancamento_id: ins.data.id, vale_status: 'previsto', vale_pago_em: null })
        .eq('id', folhaRow.id);
      if (error) throw error;
      return;
    }
    const payload = buildFolhaLancamento({ folha: base, mesRef: mes, categoriaId: cat?.id, nome });
    if (!payload) return;
    const ins = await supabase.from('agencia_fin_lancamentos').insert(payload).select('id').single();
    if (ins.error) throw ins.error;
    const { error } = await supabase
      .from('agencia_fin_folha')
      .update({ lancamento_id: ins.data.id, status: 'previsto', pago_em: null })
      .eq('id', folhaRow.id);
    if (error) throw error;
  };

  const abrirCancelarLancamento = (row) => {
    if (!row?.id || row.status === 'cancelado') return;
    setCancelAlvo(row);
    setCancelMotivo('');
  };

  const confirmarCancelarLancamento = async () => {
    const row = cancelAlvo;
    if (!row?.id) return;
    const motivo = String(cancelMotivo || '').trim();
    if (motivo.length < 2) {
      toast({ title: 'Informe o motivo do cancelamento', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const descricao = descricaoComCancelamento(row.descricao, motivo);
      const { error } = await supabase
        .from('agencia_fin_lancamentos')
        .update({ status: 'cancelado', descricao })
        .eq('id', row.id);
      if (error) throw error;
      const parte = folhaParteFromDescricao(row.descricao) || folhaParteFromDescricao(descricao);
      if (row.origem === 'folha') {
        await syncFolhaFromLancamento({ ...row, status: 'cancelado', descricao });
        if (parte) await recriarLancamentoFolhaSeCancelado({ ...row, status: 'cancelado', descricao }, parte);
      }
      setCancelAlvo(null);
      setCancelMotivo('');
      await load();
      toast({ title: 'Lançamento cancelado' });
    } catch (error) {
      toast({ title: 'Não foi possível cancelar', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const tirarDaFolha = async () => {
    const profileId = folhaForm.profile_id || folhaEdit?.profile_id;
    if (!profileId) return;
    if (!window.confirm('Tirar esta pessoa da folha? Vale e salário deixam de se repetir nos próximos meses.')) return;
    setSaving(true);
    try {
      const contratoAtual = contratos.find((item) => item.profile_id === profileId);
      if (contratoAtual?.id) {
        const upd = await supabase.from('agencia_fin_contratos').update({ ativo: false }).eq('id', contratoAtual.id);
        if (upd.error) throw upd.error;
      }
      if (folhaEdit && folhaEdit.status !== 'pago') {
        if (folhaEdit.lancamento_id) {
          const cancelado = await supabase.from('agencia_fin_lancamentos').update({ status: 'cancelado' }).eq('id', folhaEdit.lancamento_id);
          if (cancelado.error) throw cancelado.error;
        }
        if (folhaEdit.vale_lancamento_id && folhaEdit.vale_status !== 'pago') {
          const canceladoVale = await supabase.from('agencia_fin_lancamentos').update({ status: 'cancelado' }).eq('id', folhaEdit.vale_lancamento_id);
          if (canceladoVale.error) throw canceladoVale.error;
        }
        const apagada = await supabase.from('agencia_fin_folha').delete().eq('id', folhaEdit.id);
        if (apagada.error) throw apagada.error;
      }
      setFolhaOpen(false);
      await load();
      toast({ title: 'Pessoa fora da folha' });
    } catch (error) {
      toast({ title: 'Não foi possível tirar da folha', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const salvarSquad = async () => {
    const nome = String(squadNome || '').trim();
    if (nome.length < 2) {
      toast({ title: 'Dê um nome ao time', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('agencia_fin_squads').insert({ nome });
      if (error) throw error;
      setSquadNome('');
      await load();
      toast({ title: 'Time criado' });
    } catch (error) {
      toast({ title: 'Não foi possível criar o time', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const salvarEdicaoSquad = async () => {
    const nome = String(squadEditNome || '').trim();
    if (!squadEditId || nome.length < 2) {
      toast({ title: 'Nome do time precisa ter pelo menos 2 letras', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('agencia_fin_squads').update({ nome }).eq('id', squadEditId);
      if (error) throw error;
      setSquadEditId(null);
      setSquadEditNome('');
      await load();
      toast({ title: 'Time atualizado' });
    } catch (error) {
      toast({ title: 'Não foi possível renomear', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const removerSquad = async (squad) => {
    if (!squad?.id) return;
    if (!window.confirm(`Remover o time "${squad.nome}"? Quem estava nele fica sem time.`)) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('agencia_fin_squads').update({ ativo: false }).eq('id', squad.id);
      if (error) throw error;
      if (squadEditId === squad.id) {
        setSquadEditId(null);
        setSquadEditNome('');
      }
      if (filtroSquad === squad.id) setFiltroSquad('todos');
      await load();
      toast({ title: 'Time removido' });
    } catch (error) {
      toast({ title: 'Não foi possível remover', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const cancelarCobranca = (row) => {
    if (!row?.id || row.status === 'cancelado' || row.status === 'recebido' || row.situacao === 'pago') return;
    abrirCancelarLancamento(row);
  };

  const saveCategoria = async () => {
    const nome = String(catForm.nome || '').trim();
    if (nome.length < 2) {
      toast({ title: 'Informe o nome da categoria', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      if (editingCat?.id) {
        const { error } = await supabase
          .from('agencia_fin_categorias')
          .update({ nome, grupo: catForm.grupo })
          .eq('id', editingCat.id);
        if (error) throw error;
      } else {
        const ordem = (categoriesByGrupo(categorias, catForm.grupo, { onlyActive: false }).length + 1) * 10;
        const { error } = await supabase
          .from('agencia_fin_categorias')
          .insert({ nome, grupo: catForm.grupo, ordem, ativa: true });
        if (error) throw error;
      }
      setEditingCat(null);
      setCatForm({ nome: '', grupo: 'receita' });
      await load();
      toast({ title: editingCat ? 'Categoria atualizada' : 'Categoria criada' });
    } catch (error) {
      toast({ title: 'Não foi possível salvar a categoria', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggleCategoria = async (cat) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('agencia_fin_categorias')
        .update({ ativa: !cat.ativa })
        .eq('id', cat.id);
      if (error) throw error;
      await load();
      toast({ title: cat.ativa ? 'Categoria ocultada' : 'Categoria reativada' });
    } catch (error) {
      toast({ title: 'Não foi possível atualizar a categoria', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const saveFornecedor = async () => {
    const nome = String(fornNome || '').trim();
    if (nome.length < 2) {
      toast({ title: 'Informe o nome do fornecedor', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('agencia_fin_fornecedores')
        .insert({ nome, ativo: true });
      if (error) throw error;
      setFornNome('');
      await load();
      toast({ title: 'Fornecedor cadastrado' });
    } catch (error) {
      toast({
        title: 'Não foi possível cadastrar',
        description: error.message || 'Tente de novo.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleFornecedor = async (forn) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('agencia_fin_fornecedores')
        .update({ ativo: !forn.ativo })
        .eq('id', forn.id);
      if (error) throw error;
      await load();
      toast({ title: forn.ativo ? 'Fornecedor ocultado' : 'Fornecedor reativado' });
    } catch (error) {
      toast({ title: 'Não foi possível atualizar', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const pararRecorrencia = async (rec) => {
    if (!rec?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('agencia_fin_recorrencias')
        .update({ ativa: false, termina_em: monthStart(mesRef) })
        .eq('id', rec.id);
      if (error) throw error;
      await load();
      toast({ title: 'Recorrência parada', description: 'Meses futuros não serão gerados. O que já está em Lançamentos permanece.' });
    } catch (error) {
      toast({ title: 'Não foi possível parar', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const todayIso = civilToday();

  const cobrancas = useMemo(() => {
    return (lancamentos || [])
      .filter((l) => l.origem === 'mensalidade' && l.status !== 'cancelado')
      .filter((l) => {
        const client = clienteCobranca.get(l.cliente_id);
        return !client || !mensalidadeForaDaEntrada(client, l);
      })
      .map((l) => {
        const client = clienteCobranca.get(l.cliente_id);
        return {
          ...l,
          ...situacaoCobranca(l, todayIso, client?.dia_cobranca, client?.dia_cobranca_2),
          pagoEm: dataRecebimentoMensalidade(l),
        };
      })
      .sort((a, b) => {
        const rank = { atrasado: 0, a_receber: 1, pago: 2 };
        const diff = (rank[a.situacao] ?? 9) - (rank[b.situacao] ?? 9);
        if (diff) return diff;
        const nome = String(clienteNome.get(a.cliente_id) || '').localeCompare(String(clienteNome.get(b.cliente_id) || ''), 'pt-BR');
        if (nome) return nome;
        const pa = Number(a.parcela_mensalidade) || 1;
        const pb = Number(b.parcela_mensalidade) || 1;
        if (pa !== pb) return pa - pb;
        return String(a.vence || '9999').localeCompare(String(b.vence || '9999'));
      });
  }, [lancamentos, todayIso, clienteCobranca, clienteNome]);

  const cobrancasVisiveis = useMemo(() => {
    let list = cobrancas;
    if (filtroCobranca === 'atrasado') list = list.filter((r) => r.situacao === 'atrasado');
    else if (filtroCobranca === 'boleto') list = list.filter((r) => r.boleto === 'mandar');
    else if (filtroCobranca === 'pago') list = list.filter((r) => r.situacao === 'pago');
    const q = buscaCobranca.trim().toLowerCase();
    if (!q) return list;
    return list.filter((row) => String(clienteNome.get(row.cliente_id) || '').toLowerCase().includes(q));
  }, [cobrancas, filtroCobranca, buscaCobranca, clienteNome]);

  const cobrancasAtrasadas = useMemo(() => cobrancas.filter((r) => r.situacao === 'atrasado').length, [cobrancas]);

  const cobrancasResumo = useMemo(() => {
    let aReceber = 0;
    let recebido = 0;
    for (const row of cobrancas) {
      const v = moneyAmount(row.valor) || 0;
      if (row.situacao === 'pago') recebido += v;
      else aReceber += v;
    }
    return {
      aReceber: Math.round(aReceber * 100) / 100,
      recebido: Math.round(recebido * 100) / 100,
      total: cobrancas.length,
    };
  }, [cobrancas]);

  const equipePendente = useMemo(
    () =>
      folha.filter((row) => {
        const partes = splitSalario(row.salario, row.pct_vale);
        const pagar = partePagamento(row);
        return (
          (pagar > 0 && !folhaPagamentoLiquidado(row, lancMapFolha))
          || (partes.vale > 0 && !folhaValeLiquidado(row, lancMapFolha))
        );
      }).length,
    [folha, lancMapFolha],
  );

  const anoGrafico = useMemo(() => Number(monthStart(mesRef).slice(0, 4)), [mesRef]);

  const serieFaturamentoAno = useMemo(
    () => buildFaturamentoAno(lancamentosAno, anoGrafico),
    [lancamentosAno, anoGrafico],
  );

  const serieClientesAno = useMemo(
    () => buildClientesNovosAno(clientes, anoGrafico),
    [clientes, anoGrafico],
  );

  const totalFaturamentoAno = useMemo(() => totalSerie(serieFaturamentoAno, 'faturamento'), [serieFaturamentoAno]);
  const totalResultadoAno = useMemo(() => totalSerie(serieFaturamentoAno, 'resultado'), [serieFaturamentoAno]);
  const carteiraAtual = useMemo(() => {
    const last = serieClientesAno[serieClientesAno.length - 1];
    return last?.carteira ?? 0;
  }, [serieClientesAno]);

  const resumoFila = useMemo(() => {
    const merged = [
      ...aReceberRows.map((row) => ({ ...row, _tipo: 'receber' })),
      ...aPagarRows.map((row) => ({ ...row, _tipo: 'pagar' })),
    ].sort(byCashDate);
    return merged.slice(0, 8);
  }, [aReceberRows, aPagarRows]);

  const somaPendencias = useMemo(
    () => Math.round(pendenciasAnteriores.reduce((sum, row) => sum + (Number(row.valor) || 0), 0) * 100) / 100,
    [pendenciasAnteriores],
  );

  const pessoaNome = (id) => pessoas.find((p) => p.id === id)?.full_name || '—';

  const equipeGestao = useMemo(() => {
    const papel = { superadmin: 'Administrador', admin: 'Administrador', colaborador: 'Colaborador' };
    return (pessoas || [])
      .filter((pessoa) => pessoa.status !== 'inactive')
      .map((pessoa) => {
        const contrato = contratos.find((item) => item.profile_id === pessoa.id) || null;
        const naFolha = Boolean(contrato && contrato.ativo !== false);
        const linha = folha.find((item) => item.profile_id === pessoa.id) || null;
        const squad = squads.find((item) => item.id === (naFolha ? contrato.squad_id : null)) || null;
        return { pessoa, contrato: naFolha ? contrato : contrato, naFolha, linha, squad, papel: papel[pessoa.role] || 'Equipe' };
      })
      .sort((a, b) => {
        if (a.naFolha !== b.naFolha) return a.naFolha ? -1 : 1;
        return String(a.pessoa.full_name || '').localeCompare(String(b.pessoa.full_name || ''), 'pt-BR');
      });
  }, [pessoas, contratos, folha, squads]);

  const equipeVisivel = useMemo(() => {
    return equipeGestao
      .filter((item) => {
        if (filtroSquad === 'folha') return item.naFolha;
        if (filtroSquad === 'fora') return !item.naFolha;
        if (filtroSquad === 'todos') return true;
        return item.naFolha && item.squad?.id === filtroSquad;
      })
      .sort((a, b) => {
        const pa = equipeItemPendente(a, lancMapFolha) ? 0 : 1;
        const pb = equipeItemPendente(b, lancMapFolha) ? 0 : 1;
        if (pa !== pb) return pa - pb;
        if (a.naFolha !== b.naFolha) return a.naFolha ? -1 : 1;
        const oa = equipeChaveOrdenacao(a.linha, mesRef);
        const ob = equipeChaveOrdenacao(b.linha, mesRef);
        if (oa.prioridade !== ob.prioridade) return oa.prioridade - ob.prioridade;
        if (oa.iso !== ob.iso) return oa.iso.localeCompare(ob.iso);
        return String(a.pessoa.full_name || '').localeCompare(String(b.pessoa.full_name || ''), 'pt-BR');
      });
  }, [equipeGestao, filtroSquad, mesRef, lancMapFolha]);

  const equipeResumo = useMemo(() => {
    let aPagar = 0;
    let pago = 0;
    for (const row of folha || []) {
      const partes = splitSalario(row.salario, row.pct_vale);
      const pag = partePagamento(row);
      if (folhaValeLiquidado(row, lancMapFolha)) pago += partes.vale;
      else if (partes.vale > 0) aPagar += partes.vale;
      if (folhaPagamentoLiquidado(row, lancMapFolha)) pago += pag;
      else if (pag > 0) aPagar += pag;
    }
    return {
      aPagar: Math.round(aPagar * 100) / 100,
      pago: Math.round(pago * 100) / 100,
      pendentes: equipePendente,
      naFolha: (folha || []).length,
    };
  }, [folha, equipePendente, lancMapFolha]);

  const ativos = useMemo(
    () =>
      (clientes || [])
        .filter((c) => c.etapa === 'closed')
        .sort((a, b) => String(a.empresa || '').localeCompare(String(b.empresa || ''), 'pt-BR')),
    [clientes],
  );

  const mesLabel = formatMonthLabel(mesRef);

  return (
    <div className="min-h-full w-full p-4 md:p-6">
      <div className="mx-auto max-w-[1200px] space-y-5">
        <WorkspacePageHeader
          title="Financeiro"
          label="Agência"
          description={mesLabel}
          help={
            <div className="space-y-2">
              <p>Competência soma os lançamentos do mês escolhido, pagos ou não. Caixa separa, nesse mesmo mês, o que ainda está previsto do que já foi recebido ou pago.</p>
              <p>Pendências anteriores são previstos de outros meses. A soma delas fica só naquela lista e não entra nos cartões do mês.</p>
              <p>Repasse de mídia fica só no caixa. Cliente fechado não cria cobrança. Marcar boleto só grava a data e não emite boleto.</p>
              <p>Os números são os lançamentos gravados. Sem saldo inicial, o movimento do caixa não é saldo de banco.</p>
            </div>
          }
          actions={
            <>
              <div className="flex h-9 items-center rounded-xl border border-slate-200/80 bg-slate-50/80 px-0.5 dark:border-white/10 dark:bg-white/[0.04]">
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-lg" aria-label="Mês anterior" onClick={() => setMesRef((m) => shiftMonth(m, -1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="inline-flex min-w-[148px] items-center justify-center gap-1.5 px-1 text-xs font-semibold capitalize">
                  <CalendarRange className="h-3.5 w-3.5 text-slate-500" />
                  {mesLabel}
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-lg" aria-label="Próximo mês" onClick={() => setMesRef((m) => shiftMonth(m, 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <Button type="button" variant="secondary" size="sm" className="h-9 rounded-xl px-3 text-xs" onClick={() => setMesRef(monthStart(new Date()))}>
                Mês atual
              </Button>
              {aba === 'cobrancas' ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9 rounded-xl px-3 text-xs"
                  disabled={saving || loading}
                  onClick={gerarMensalidadesDoMes}
                >
                  Gerar mensalidades do mês
                </Button>
              ) : null}
              {aba === 'equipe' ? (
                <>
                  <Button type="button" size="sm" variant="outline" className="h-9 rounded-xl px-3 text-xs" disabled={saving || loading} onClick={gerarFolhasDoMes}>
                    Gerar folhas deste mês
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-9 rounded-xl px-3 text-xs" onClick={() => setSquadOpen(true)}>
                    Times
                  </Button>
                </>
              ) : null}
              {(aba === 'lancamentos' || aba === 'fixos' || aba === 'resumo' || aba === 'caixa' || aba === 'dre') && (
                <Button type="button" size="sm" className="h-9 gap-1.5 rounded-xl px-3 text-xs" onClick={() => openCreate(aba === 'fixos' ? 'despesa' : undefined)}>
                  <Plus className="h-3.5 w-3.5" />
                  Lançamento
                </Button>
              )}
            </>
          }
        />

        <FinanceiroTabBar
          aba={aba}
          setAba={setAba}
          cobrancasAtrasadas={cobrancasAtrasadas}
          equipePendente={equipePendente}
          loading={loading}
        />

        {loading ? (
          <div className="flex min-h-[360px] items-center justify-center gap-2 rounded-[24px] border border-slate-200/60 bg-white text-slate-500 shadow-sm dark:border-white/10 dark:bg-card">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando financeiro…
          </div>
        ) : (
          <>
            {aba === 'resumo' && (
              <div className="space-y-4">
                <div className="grid items-stretch gap-4 lg:grid-cols-2">
                  <ResumoCompetenciaVisual dre={dre} onDre={() => setAba('dre')} />
                  <ResumoCaixaVisual caixa={caixa} onCaixa={() => setAba('caixa')} />
                </div>

                <Panel
                  title={`Evolução em ${anoGrafico}`}
                  help="Faturamento e resultado vêm dos lançamentos do ano (competência). Meses sem lançamento ficam zerados. Clientes: fechados no cadastro por mês; o total no canto é a carteira ativa hoje."
                >
                  <div className="grid items-start gap-3 border-t border-slate-100 px-4 py-4 dark:border-white/[0.06] sm:grid-cols-2 xl:grid-cols-3">
                    <FinGraficoCard
                      title="Faturamento"
                      subtitle="Receita do mês"
                      totalCaption="Acumulado"
                      totalDisplay={formatCompactMoney(totalFaturamentoAno)}
                      accent="#059669"
                      titleAddon={
                        <Ajuda label="Ajuda: Faturamento">
                          Soma das receitas por competência no ano. Mensalidades no ano: {formatMoneyBr(totalSerie(serieFaturamentoAno, 'mensalidade'))}.
                        </Ajuda>
                      }
                    >
                      <FinSerieBarras series={serieFaturamentoAno} valueKey="faturamento" color="#10b981" kind="money" height={104} />
                    </FinGraficoCard>
                    <FinGraficoCard
                      title="Resultado"
                      subtitle="Receita − custos − despesas"
                      totalCaption="Acumulado"
                      totalDisplay={formatMoneyBr(totalResultadoAno)}
                      accent={totalResultadoAno >= 0 ? '#7c3aed' : '#e11d48'}
                      titleAddon={
                        <Ajuda label="Ajuda: Resultado">Receita menos custos e despesas do mês (DRE). Repasse de mídia não entra.</Ajuda>
                      }
                    >
                      <FinSerieArea series={serieFaturamentoAno} valueKey="resultado" color={totalResultadoAno >= 0 ? '#8b5cf6' : '#f43f5e'} kind="money" height={104} />
                    </FinGraficoCard>
                    <div className="sm:col-span-2 xl:col-span-1">
                      <FinGraficoCard
                        title="Clientes"
                        subtitle="Contratos fechados no mês"
                        totalCaption="Carteira ativa"
                        totalDisplay={String(carteiraAtual)}
                        accent="#0284c7"
                        titleAddon={
                          <Ajuda label="Ajuda: Clientes">
                            Barras: contratos fechados cadastrados naquele mês. O número no canto é quantos fechados existem hoje — não é faturamento.
                          </Ajuda>
                        }
                      >
                        <FinSerieBarras series={serieClientesAno} valueKey="contratos" color="#0ea5e9" kind="count" unit={['fechado', 'fechados']} height={104} />
                      </FinGraficoCard>
                    </div>
                  </div>
                </Panel>

                {cobrancasAtrasadas > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setFiltroCobranca('atrasado');
                      setAba('cobrancas');
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-rose-200/80 bg-gradient-to-r from-rose-50 to-orange-50/80 px-4 py-3 text-left dark:border-rose-500/25 dark:from-rose-950/30 dark:to-orange-950/10"
                  >
                    <span className="text-[13px] font-medium text-rose-900 dark:text-rose-100">
                      {cobrancasAtrasadas} mensalidade{cobrancasAtrasadas === 1 ? '' : 's'} atrasada{cobrancasAtrasadas === 1 ? '' : 's'} — abrir cobranças
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-rose-600" />
                  </button>
                ) : null}

                <ResumoFazerAgora
                  fila={resumoFila}
                  clienteNome={clienteNome}
                  fotoDe={fotoDoLancamento}
                  saving={saving}
                  onOpen={(row) => openEdit(row)}
                  onSettle={settle}
                  onVerTodos={() => setAba('caixa')}
                  onNovoLancamento={() => openCreate()}
                  atalhos={
                    <div className="flex max-w-full gap-1.5 overflow-x-auto pb-0.5 sm:flex-wrap sm:overflow-visible">
                      <ResumoAtalhoChip icon={Banknote} label="Cobranças" badge={cobrancasAtrasadas} tone="amber" onClick={() => setAba('cobrancas')} />
                      <ResumoAtalhoChip icon={Users} label="Equipe" badge={equipePendente} tone="sky" onClick={() => setAba('equipe')} />
                      <ResumoAtalhoChip icon={Wallet} label="Caixa" tone="violet" onClick={() => setAba('caixa')} />
                      <ResumoAtalhoChip icon={Scale} label="DRE" tone="violet" onClick={() => setAba('dre')} />
                    </div>
                  }
                />

                {pendenciasAnteriores.length > 0 ? (
                  <Panel
                    title="Pendências de meses anteriores"
                    help="Previstos de competências anteriores a este mês. A soma é só desta lista e não entra nos cartões de competência nem de caixa."
                    actions={<span className="rounded-full bg-slate-100 px-3 py-1 text-[12px] font-medium tabular-nums text-slate-700 dark:bg-white/10 dark:text-slate-200">{formatMoneyBr(somaPendencias)} no total</span>}
                  >
                    <ul className="divide-y divide-slate-100/90 dark:divide-white/[0.06]">
                      {pendenciasAnteriores.slice(0, 6).map((row) => {
                        const nome = clientLabelFromRow(row, clienteNome);
                        const quando = row.data_caixa ? formatDayBr(row.data_caixa) : 'sem data';
                        const receber = row.grupo === 'receita';
                        return (
                          <li key={row.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                            <ClienteFoto nome={nome} logo={fotoDoLancamento(row)} size="sm" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] font-medium text-slate-900 dark:text-white">{nome}</p>
                              <p className="mt-0.5 text-[12px] text-slate-400">{quando}</p>
                            </div>
                            <span className="shrink-0 text-[13px] font-semibold tabular-nums text-slate-950 dark:text-white">{formatMoneyBr(row.valor)}</span>
                            {canSettle(row) ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 rounded-lg text-[11px]"
                                disabled={saving}
                                onClick={() => settle(row)}
                              >
                                {receber ? 'Recebi' : 'Paguei'}
                              </Button>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                    {pendenciasAnteriores.length > 6 ? (
                      <p className="border-t border-slate-100 px-5 py-3 text-center text-[12px] text-slate-500 dark:border-white/[0.06]">
                        + {pendenciasAnteriores.length - 6} outras na lista completa em Caixa
                      </p>
                    ) : null}
                  </Panel>
                ) : null}
              </div>
            )}

            {aba === 'cobrancas' && (
              <div className="space-y-4">
                <CobrancasResumoFaixa
                  aReceber={cobrancasResumo.aReceber}
                  recebido={cobrancasResumo.recebido}
                  atrasados={cobrancasAtrasadas}
                  total={cobrancasResumo.total}
                />
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <FinBusca value={buscaCobranca} onChange={setBuscaCobranca} placeholder="Buscar cliente…" className="sm:max-w-xs" />
                  <FiltroChips
                    value={filtroCobranca}
                    onChange={setFiltroCobranca}
                    items={[
                      ['todos', 'Todos', cobrancas.length],
                      ['atrasado', 'Atrasados', cobrancasAtrasadas],
                      ['boleto', 'A marcar', cobrancas.filter((r) => r.boleto === 'mandar').length],
                      ['pago', 'Pagos', cobrancas.filter((r) => r.situacao === 'pago').length],
                    ]}
                  />
                </div>
                <Panel
                  title="Mensalidades deste mês"
                  help="Gere o mês com o botão no topo (só clientes já na base naquele mês). Duas parcelas no cadastro viram duas linhas. Cancelar remove cobrança prevista; Recebi grava Pago em."
                >
                  {cobrancasVisiveis.length === 0 ? (
                    <EmptyState className="min-h-[120px] py-8">Nenhuma cobrança neste recorte. Troque o filtro ou limpe a busca.</EmptyState>
                  ) : (
                    <CobrancasTabela
                      rows={cobrancasVisiveis}
                      competencia={monthStart(mesRef)}
                      clienteNome={clienteNome}
                      clienteLogo={clienteLogo}
                      clienteCobranca={clienteCobranca}
                      saving={saving}
                      onValor={salvarValorCobranca}
                      onBoleto={marcarBoleto}
                      onReceber={abrirRecebimento}
                      onAjustarPago={abrirAjustePago}
                      onCancelar={cancelarCobranca}
                    />
                  )}
                </Panel>
              </div>
            )}

            {aba === 'equipe' && (
              <div className="space-y-4">
                <EquipeResumoFaixa
                  aPagar={equipeResumo.aPagar}
                  pago={equipeResumo.pago}
                  pendentes={equipeResumo.pendentes}
                  naFolha={equipeResumo.naFolha}
                />
                <FiltroChips
                  value={filtroSquad}
                  onChange={setFiltroSquad}
                  items={[
                    ['todos', 'Todos', equipeGestao.length],
                    ['folha', 'Na folha', equipeGestao.filter((item) => item.naFolha).length],
                    ['fora', 'Fora da folha', equipeGestao.filter((item) => !item.naFolha).length],
                    ...squads.map((squad) => [squad.id, squad.nome, null]),
                  ]}
                />
                <Panel
                  title="Gestão da equipe"
                  help="Colunas: pagamento deste mês (restante + extras − desconto), depois vale (adiantamento do mês seguinte). A lista ordena por data prevista. Extra fixo no mês: Editar → Extras. Desconto do mês: Editar → Desconto. Comprovante: no Paguei do vale ou do salário."
                >
                  {equipeVisivel.length === 0 ? (
                    <EmptyState className="min-h-[120px] py-10">
                      Nenhum colaborador neste recorte. Cadastro em Configurações → Equipe.
                    </EmptyState>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[720px] border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-400">
                            <th className="px-4 py-2.5 text-left font-medium">Colaborador</th>
                            <th className="px-2 py-2.5 text-left font-medium">Pagamento</th>
                            <th className="px-2 py-2.5 text-left font-medium">Vale</th>
                            <th className="px-2 py-2.5 text-right font-medium">Total</th>
                            <th className="px-4 py-2.5 text-right font-medium">Ação</th>
                          </tr>
                        </thead>
                        <tbody>
                          {equipeVisivel.map((item, index) => {
                            const { pessoa, contrato, naFolha, linha, squad, papel } = item;
                            const nome = pessoa.full_name || 'Pessoa';
                            const base = linha || contrato;
                            const partes = splitSalario(base?.salario, base?.pct_vale);
                            const baseComDesconto = {
                              ...base,
                              desconto: linha?.desconto ?? 0,
                              desconto_motivo: linha?.desconto_motivo || '',
                            };
                            const pagar = partePagamento(baseComDesconto);
                            const funcao = String(contrato?.funcao || linha?.funcao || '').trim();
                            const sub = [squad?.nome, funcao || papel].filter(Boolean).join(' · ');
                            const temVale = partes.pctVale > 0;
                            const descontoMes = Number(linha?.desconto) || 0;
                            const totalMes = folhaTotal(baseComDesconto);
                            const pagLiquidado = linha ? folhaPagamentoLiquidado(linha, lancMapFolha) : false;
                            const valeLiquidado = linha ? folhaValeLiquidado(linha, lancMapFolha) : false;
                            const temCompPag = Boolean(linha?.comprovante_pagamento_path);
                            const temCompVale = Boolean(linha?.comprovante_vale_path);
                            return (
                              <tr
                                key={pessoa.id}
                                className={zebraRowClass(index)}
                              >
                                <td className="px-4 py-3 align-middle">
                                  <button type="button" onClick={() => abrirGestao(pessoa)} className="flex min-w-0 items-center gap-2.5 text-left">
                                    <ClienteFoto nome={nome} logo={pessoa.avatar_url} size="sm" />
                                    <span className="min-w-0">
                                      <span className="block truncate text-[13px] font-semibold text-slate-950 dark:text-white">{nome}</span>
                                      <span className="block truncate text-[11px] text-slate-500">{naFolha ? sub : papel}</span>
                                    </span>
                                  </button>
                                </td>
                                <td className="px-2 py-3 align-top">
                                  {naFolha ? (
                                    <EquipePagamentoCelula
                                      titulo={temVale ? `Restante ${partes.pctPagamento}%` : 'Salário'}
                                      valor={pagar}
                                      vazio={!(pagar > 0) && descontoMes <= 0}
                                      pago={pagLiquidado}
                                      pagoEm={linha ? folhaPagamentoPagoEm(linha, lancMapFolha) : null}
                                      previstoEm={!pagLiquidado ? dataPrevistaPagamentoFolha(linha || base, mesRef) : null}
                                      desconto={descontoMes}
                                      descontoMotivo={linha?.desconto_motivo || ''}
                                      temComprovante={temCompPag}
                                      saving={saving}
                                      onPay={linha && pagar > 0 && !pagLiquidado ? () => abrirPagamentoEquipe(linha, 'pagamento') : null}
                                      onAjustarPago={linha && pagLiquidado ? () => abrirPagamentoEquipe(linha, 'pagamento', true) : null}
                                      onAbrirComprovante={temCompPag ? () => abrirComprovanteFolha(linha, 'pagamento') : null}
                                    />
                                  ) : (
                                    <span className="text-[12px] text-slate-400">Fora da folha</span>
                                  )}
                                </td>
                                <td className="px-2 py-3 align-top">
                                  {naFolha ? (
                                    <EquipePagamentoCelula
                                      titulo={temVale ? `Vale ${partes.pctVale}%` : 'Vale'}
                                      valor={partes.vale}
                                      vazio={!temVale}
                                      pago={valeLiquidado}
                                      pagoEm={linha ? folhaValePagoEm(linha, lancMapFolha) : null}
                                      previstoEm={!valeLiquidado ? dataPrevistaValeFolha(linha || base, mesRef) : null}
                                      temComprovante={temCompVale}
                                      saving={saving}
                                      onPay={linha && temVale && !valeLiquidado ? () => abrirPagamentoEquipe(linha, 'vale') : null}
                                      onAjustarPago={linha && valeLiquidado ? () => abrirPagamentoEquipe(linha, 'vale', true) : null}
                                      onAbrirComprovante={temCompVale ? () => abrirComprovanteFolha(linha, 'vale') : null}
                                    />
                                  ) : (
                                    <span className="text-[12px] text-slate-400">—</span>
                                  )}
                                </td>
                                <td className="px-2 py-3 text-right align-middle tabular-nums text-[13px] font-semibold text-slate-800 dark:text-slate-100">
                                  {naFolha && totalMes > 0 ? formatMoneyBr(totalMes) : '—'}
                                </td>
                                <td className="px-4 py-3 text-right align-middle">
                                  {!naFolha ? (
                                    <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg text-[11px]" onClick={() => abrirGestao(pessoa)}>
                                      Na folha
                                    </Button>
                                  ) : (
                                    <Button type="button" size="sm" variant="ghost" className="h-8 rounded-lg text-[11px] text-slate-500" onClick={() => abrirGestao(pessoa)}>
                                      Editar
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Panel>
              </div>
            )}

            {aba === 'dre' && (
              <div className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <Panel title="Resultado por competência" help="Receitas, custos e despesas do mês escolhido, pagos ou não. Cancelados e repasses ficam de fora.">
                  <div className="border-b border-slate-100 px-6 py-5 dark:border-white/[0.06]">
                    <p className="text-[12px] font-medium text-slate-500">Resultado do mês</p>
                    <p
                      className={cn(
                        'mt-1 text-[28px] font-semibold tracking-[-0.03em] tabular-nums',
                        dre.resultado >= 0 ? 'text-slate-950 dark:text-white' : 'text-rose-600',
                      )}
                    >
                      {formatMoneyBr(dre.resultado)}
                    </p>
                  </div>
                  <div>
                    <DreLine className={zebraRowClass(0)} label="Receita" value={dre.receita} />
                    <DreLine className={zebraRowClass(1)} label="Custos" value={dre.custo} muted negative />
                    <DreLine className={zebraRowClass(2)} label="Despesas" value={dre.despesa} muted negative />
                    <DreLine className={zebraRowClass(3)} label="Resultado" value={dre.resultado} strong divider />
                  </div>
                </Panel>

                <div className="space-y-4">
                  {[
                    { key: 'receita', title: 'Receitas' },
                    { key: 'custo', title: 'Custos' },
                    { key: 'despesa', title: 'Despesas' },
                  ].map((block) => (
                    <Panel key={block.key} title={block.title}>
                      {(dreBreakdown[block.key] || []).length === 0 ? (
                        <p className="px-6 py-8 text-center text-[13px] text-slate-400">Sem lançamentos.</p>
                      ) : (
                        <ul>
                          {dreBreakdown[block.key].map((item, index) => {
                            const totalGrupo = block.key === 'receita' ? dre.receita : block.key === 'custo' ? dre.custo : dre.despesa;
                            const pct = totalGrupo > 0 ? Math.round((item.valor / totalGrupo) * 100) : 0;
                            return (
                              <li key={item.id} className={cn('px-6 py-3.5', zebraRowClass(index))}>
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-[13px] text-slate-700 dark:text-slate-200">{item.nome}</span>
                                  <span className="text-[13px] font-semibold tabular-nums text-slate-950 dark:text-white">
                                    {formatMoneyBr(item.valor)}
                                  </span>
                                </div>
                                <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                                  <div className="h-full rounded-full bg-slate-900/70 dark:bg-white/70" style={{ width: `${pct}%` }} />
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </Panel>
                  ))}
                </div>
              </div>
            )}

            {aba === 'caixa' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-card">
                  <p className="text-[13px] font-medium text-slate-500">Movimento líquido do mês</p>
                  <p className="mt-1 text-[28px] font-semibold tracking-[-0.03em] tabular-nums text-slate-950 dark:text-white">
                    {formatMoneyBr((caixa.recebido || 0) - (caixa.pago || 0))}
                  </p>
                  <p className="mt-2 text-[12px] text-slate-500">
                    Recebido {formatMoneyBr(caixa.recebido)} · Pago {formatMoneyBr(caixa.pago)}. Sem saldo inicial de banco.
                  </p>
                </div>
                <SecaoMetricas titulo="Detalhe do caixa">
                  <StatTile label="A receber" scope="Ainda previsto" value={caixa.aReceber} accent="from-amber-200/90 via-yellow-100/80 to-orange-100/70" />
                  <StatTile label="Recebido" scope="Já entrou no caixa" value={caixa.recebido} accent="from-emerald-200/90 via-teal-100/80 to-cyan-100/70" />
                  <StatTile label="A pagar" scope="Ainda previsto" value={caixa.aPagar} accent="from-sky-200/90 via-blue-100/80 to-indigo-100/70" />
                  <StatTile label="Pago" scope="Já saiu do caixa" value={caixa.pago} accent="from-violet-200/90 via-fuchsia-100/80 to-pink-100/70" />
                </SecaoMetricas>

                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between px-1">
                      <h2 className="text-[15px] font-semibold tracking-[-0.02em]">Entradas</h2>
                      <Button type="button" size="sm" variant="outline" className="h-8 gap-1 rounded-xl text-xs" onClick={() => openCreate('receita')}>
                        <ArrowDownLeft className="h-3.5 w-3.5" />
                        Entrada
                      </Button>
                    </div>
                    <MoneyList title="A receber" count={aReceberRows.length} rows={aReceberRows} empty="Nada pendente." clienteNome={clienteNome} fotoDe={fotoDoLancamento} onOpen={openEdit} settleLabel="Receber" onSettle={settle} saving={saving} />
                    <MoneyList title="Recebido" count={recebidoRows.length} rows={recebidoRows} empty="Nada recebido ainda." clienteNome={clienteNome} fotoDe={fotoDoLancamento} onOpen={openEdit} />
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between px-1">
                      <h2 className="text-[15px] font-semibold tracking-[-0.02em]">Saídas</h2>
                      <Button type="button" size="sm" variant="outline" className="h-8 gap-1 rounded-xl text-xs" onClick={() => openCreate('despesa')}>
                        <ArrowUpRight className="h-3.5 w-3.5" />
                        Saída
                      </Button>
                    </div>
                    <MoneyList title="A pagar" count={aPagarRows.length} rows={aPagarRows} empty="Nada pendente." clienteNome={clienteNome} fotoDe={fotoDoLancamento} onOpen={openEdit} settleLabel="Pagar" onSettle={settle} saving={saving} />
                    <MoneyList title="Pago" count={pagoRows.length} rows={pagoRows} empty="Nada pago ainda." clienteNome={clienteNome} fotoDe={fotoDoLancamento} onOpen={openEdit} />
                  </div>
                </div>
              </div>
            )}

            {aba === 'lancamentos' && (
              <div className="space-y-4">
                <FinBusca value={buscaLancamento} onChange={setBuscaLancamento} placeholder="Buscar por descrição, pessoa, cliente ou categoria…" />
                <Panel
                  title="Lançamentos do mês"
                  help="Inclui mensalidade do cliente. Clique na linha para corrigir valor, data ou status. Lixeira cancela com motivo (também um recebido). Boleto e atraso ficam em Cobranças. Salário e vale ficam na Equipe."
                  actions={
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100/80 p-1 dark:bg-white/[0.05]">
                        {[{ id: 'todos', label: 'Todos' }, ...FIN_GROUPS.map((g) => ({ id: g, label: GROUP_LABELS[g] }))].map((filter) => (
                          <button
                            key={filter.id}
                            type="button"
                            onClick={() => setFiltroGrupo(filter.id)}
                            className={cn(
                              'rounded-lg px-3 py-1.5 text-xs font-medium transition',
                              filtroGrupo === filter.id
                                ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-700 dark:text-white'
                                : 'text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white',
                            )}
                          >
                            {filter.label}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setMostrarCancelados((v) => !v)}
                        className={cn(
                          'rounded-xl px-3 py-1.5 text-xs font-medium transition',
                          mostrarCancelados
                            ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/[0.06] dark:text-slate-300',
                        )}
                      >
                        Cancelados
                      </button>
                      {mensalidadesDoMes > 0 ? (
                        <button
                          type="button"
                          onClick={() => setAba('cobrancas')}
                          className="rounded-xl px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.06]"
                        >
                          Cobranças
                        </button>
                      ) : null}
                    </div>
                  }
                >
                  {lancamentosBusca.length === 0 ? (
                    <EmptyState>
                      {mostrarCancelados
                        ? 'Nenhum lançamento cancelado neste filtro.'
                        : buscaLancamento.trim()
                          ? 'Nenhum lançamento com esse texto. Limpe a busca ou troque o filtro de grupo.'
                          : 'Nenhum lançamento neste filtro. Use Lançamento para uma entrada ou saída; mensalidades em Cobranças → Gerar.'}
                    </EmptyState>
                  ) : (
                    <ul>
                      {lancamentosBusca.map((row, index) => {
                        const cliente = row.cliente_id ? clienteNome.get(row.cliente_id) : '';
                        const pessoa = row.profile_id ? pessoaNomeMap.get(row.profile_id) : '';
                        const forn = row.fornecedor_id ? fornecedorNome.get(row.fornecedor_id) : '';
                        const parte = folhaParteFromDescricao(row.descricao);
                        const titulo = pessoa && parte
                          ? (parte === 'vale' ? `Vale — ${pessoa}` : `Salário — ${pessoa}`)
                          : row.descricao;
                        const situacao = row.status === 'cancelado'
                          ? 'Cancelado'
                          : row.status === 'recebido'
                            ? 'Recebido'
                            : row.status === 'pago'
                              ? 'Pago'
                              : row.grupo === 'receita'
                                ? 'A receber'
                                : 'A pagar';
                        return (
                          <li
                            key={row.id}
                            className={cn(
                              'flex flex-col gap-3 border-l-[3px] px-5 py-4 sm:flex-row sm:items-center sm:justify-between',
                              zebraRowClass(index),
                              GRUPO_STRIPE[row.grupo] || 'border-l-slate-300',
                              row.status === 'cancelado' && 'opacity-45',
                            )}
                          >
                            <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => openEdit(row)}>
                              <ClienteFoto nome={pessoa || cliente || forn || row.descricao} logo={fotoDoLancamento(row)} size="sm" />
                              <span className="min-w-0">
                                <span className="block truncate text-[15px] font-semibold tracking-[-0.02em] text-slate-950 dark:text-white">{titulo}</span>
                                <span className="mt-1 flex flex-wrap gap-x-3 text-[12px] text-slate-500">
                                  <span>{categoriaNome.get(row.categoria_id) || GROUP_LABELS[row.grupo]}</span>
                                  {row.origem === 'mensalidade' ? <span>Mensalidade</span> : null}
                                  {pessoa && !parte ? <span>{pessoa}</span> : null}
                                  {forn ? <span>{forn}</span> : null}
                                  {cliente ? <span>{cliente}</span> : null}
                                  {row.recorrencia_id ? <span>Recorrente</span> : null}
                                  <span>{row.data_caixa ? formatDayBr(row.data_caixa) : 'Sem data'}</span>
                                </span>
                              </span>
                            </button>
                            <div className="flex shrink-0 items-center gap-3">
                              <span className={cn('rounded-full px-2.5 py-1 text-[12px] font-medium', statusBadgeClass(row.status))}>
                                {situacao}
                              </span>
                              <span className="text-[15px] font-semibold tabular-nums">{formatMoneyBr(row.valor)}</span>
                              {canSettle(row) ? (
                                <Button type="button" size="sm" className="h-8 rounded-xl bg-slate-950 text-xs text-white hover:bg-slate-800" disabled={saving} onClick={() => settle(row)}>
                                  {row.grupo === 'receita' ? 'Recebi' : 'Paguei'}
                                </Button>
                              ) : null}
                              {row.status !== 'cancelado' ? (
                                <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-rose-600" disabled={saving} onClick={() => abrirCancelarLancamento(row)} aria-label="Cancelar lançamento">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Panel>
              </div>
            )}

            {aba === 'fixos' && (
              <div className="space-y-4">
                <Panel
                  title="Fornecedores"
                  help="Quem recebe o pagamento do custo ou da despesa fixa (aluguel, software, freela). Depois escolha no lançamento."
                >
                  <div className="space-y-3 p-5">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        placeholder="Nome do fornecedor"
                        value={fornNome}
                        onChange={(e) => setFornNome(e.target.value)}
                        className="rounded-xl"
                        maxLength={80}
                      />
                      <Button type="button" className="rounded-xl" disabled={saving} onClick={saveFornecedor}>
                        Cadastrar
                      </Button>
                    </div>
                    {(fornecedores || []).length === 0 ? (
                      <EmptyState>Nenhum fornecedor ainda.</EmptyState>
                    ) : (
                      <ul>
                        {(fornecedores || []).map((forn, index) => (
                          <li
                            key={forn.id}
                            className={cn(
                              'flex items-center justify-between gap-3 px-1 py-3',
                              zebraRowClass(index),
                              forn.ativo === false && 'opacity-45',
                            )}
                          >
                            <span className="truncate text-[14px] font-medium text-slate-900 dark:text-white">{forn.nome}</span>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-8 rounded-lg text-[12px]"
                              disabled={saving}
                              onClick={() => toggleFornecedor(forn)}
                            >
                              {forn.ativo === false ? 'Reativar' : 'Ocultar'}
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </Panel>

                <Panel
                  title="Recorrências"
                  help="Criadas ao lançar com Recorrente. Parar impede novos meses; o que já gerou fica em Lançamentos para pagar ou cancelar."
                  actions={
                    <button
                      type="button"
                      onClick={() => setMostrarRecorrenciasParadas((v) => !v)}
                      className={cn(
                        'rounded-xl px-3 py-1.5 text-xs font-medium transition',
                        mostrarRecorrenciasParadas
                          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/[0.06] dark:text-slate-300',
                      )}
                    >
                      Paradas
                    </button>
                  }
                >
                  {recorrenciasVisiveis.length === 0 ? (
                    <EmptyState>
                      {mostrarRecorrenciasParadas
                        ? 'Nenhuma recorrência parada.'
                        : 'Nenhuma recorrência ativa. Em Lançamentos, marque Recorrente ao criar um custo ou despesa.'}
                    </EmptyState>
                  ) : (
                    <ul>
                      {recorrenciasVisiveis.map((rec, index) => {
                        const forn = rec.fornecedor_id ? fornecedorNome.get(rec.fornecedor_id) : '';
                        return (
                          <li
                            key={rec.id}
                            className={cn(
                              'flex flex-col gap-3 border-l-[3px] px-5 py-4 sm:flex-row sm:items-center sm:justify-between',
                              zebraRowClass(index),
                              GRUPO_STRIPE[rec.grupo] || 'border-l-slate-300',
                              rec.ativa === false && 'opacity-45',
                            )}
                          >
                            <div className="min-w-0">
                              <p className="truncate text-[15px] font-semibold tracking-[-0.02em] text-slate-950 dark:text-white">
                                {rec.descricao}
                              </p>
                              <p className="mt-1 flex flex-wrap gap-x-3 text-[12px] text-slate-500">
                                <span>{categoriaNome.get(rec.categoria_id) || GROUP_LABELS[rec.grupo]}</span>
                                {forn ? <span>{forn}</span> : null}
                                <span>Dia {rec.dia_vencimento}</span>
                                {rec.termina_em ? <span>Até {formatMonthLabel(rec.termina_em)}</span> : null}
                                <span>{rec.ativa === false ? 'Parada' : 'Ativa'}</span>
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-3">
                              <span className="text-[15px] font-semibold tabular-nums">{formatMoneyBr(rec.valor)}</span>
                              {rec.ativa !== false ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 rounded-xl text-xs"
                                  disabled={saving}
                                  onClick={() => pararRecorrencia(rec)}
                                >
                                  Parar
                                </Button>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Panel>
              </div>
            )}

            {aba === 'categorias' && (
              <Panel title="Categorias" help="Inclua, renomeie ou oculte. Categoria já usada não se apaga.">
                <div className="space-y-4 p-6">
                  <div className="grid gap-2 rounded-2xl border border-dashed border-slate-200/80 bg-slate-50/40 p-4 dark:border-white/10 dark:bg-white/[0.02] sm:grid-cols-[1fr_9rem_auto]">
                    <Input
                      placeholder="Nome da categoria"
                      value={catForm.nome}
                      onChange={(e) => setCatForm((p) => ({ ...p, nome: e.target.value }))}
                      className="rounded-xl bg-white dark:bg-transparent"
                    />
                    <Select value={catForm.grupo} onValueChange={(v) => setCatForm((p) => ({ ...p, grupo: v }))} disabled={Boolean(editingCat)}>
                      <SelectTrigger className="rounded-xl bg-white dark:bg-transparent"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FIN_GROUPS.map((g) => (
                          <SelectItem key={g} value={g}>{GROUP_LABELS[g]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2">
                      {editingCat ? (
                        <Button type="button" variant="outline" className="rounded-xl" onClick={() => { setEditingCat(null); setCatForm({ nome: '', grupo: 'receita' }); }}>
                          Cancelar
                        </Button>
                      ) : null}
                      <Button type="button" className="rounded-xl" onClick={saveCategoria} disabled={saving}>
                        {editingCat ? 'Salvar' : 'Incluir'}
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    {FIN_GROUPS.map((grupo) => {
                      const list = categoriesByGrupo(categorias, grupo, { onlyActive: false });
                      return (
                        <div key={grupo} className={cn('overflow-hidden rounded-2xl border border-slate-200/70 border-t-[3px] dark:border-white/10', GRUPO_CAT_HEAD[grupo])}>
                          <div className="border-b border-slate-100 px-4 py-3 dark:border-white/[0.06]">
                            <h3 className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">{GROUP_LABELS[grupo]}</h3>
                          </div>
                          {list.length === 0 ? (
                            <p className="px-4 py-6 text-[13px] text-slate-400">Nenhuma categoria.</p>
                          ) : (
                            <ul className="divide-y divide-slate-100/90 dark:divide-white/[0.05]">
                              {list.map((cat) => (
                                <li key={cat.id} className={cn('flex items-center justify-between gap-2 px-4 py-2.5', !cat.ativa && 'opacity-45')}>
                                  <button
                                    type="button"
                                    className="min-w-0 flex-1 text-left text-[13px] font-medium hover:underline"
                                    onClick={() => {
                                      setEditingCat(cat);
                                      setCatForm({ nome: cat.nome, grupo: cat.grupo });
                                    }}
                                  >
                                    {cat.nome}
                                  </button>
                                  <Button type="button" size="sm" variant="ghost" className="h-8 rounded-lg text-xs" disabled={saving} onClick={() => toggleCategoria(cat)}>
                                    {cat.ativa ? 'Ocultar' : 'Reativar'}
                                  </Button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Panel>
            )}
          </>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar lançamento' : 'Novo lançamento'}</DialogTitle>
            <DialogDescription>
              {formEhSalario
                ? 'Salário e Vale atualizam a Equipe. A descrição monta sozinha com o nome da pessoa.'
                : formUsaColaborador
                  ? 'Em despesa ou custo você pode ligar o colaborador. Cliente fica em receita e repasse.'
                  : 'Receita e repasse usam o cliente. Mensalidade se edita também em Cobranças.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Grupo</Label>
                <Select value={form.grupo} onValueChange={onGrupoChange} disabled={editing?.origem === 'mensalidade'}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FIN_GROUPS.map((g) => (
                      <SelectItem key={g} value={g}>{GROUP_LABELS[g]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select
                  value={form.categoria_id}
                  onValueChange={(v) => {
                    const cat = categorias.find((c) => c.id === v);
                    setForm((p) => ({
                      ...p,
                      categoria_id: v,
                      folha_parte: isCategoriaSalario(cat) ? (p.folha_parte || 'pagamento') : 'pagamento',
                    }));
                  }}
                >
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Escolha" /></SelectTrigger>
                  <SelectContent>
                    {categoriasDoGrupo.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formUsaColaborador ? (
              <div className={cn('grid gap-2', formEhSalario ? 'sm:grid-cols-2' : '')}>
                <div className="space-y-1.5">
                  <Label>{formEhSalario ? 'Colaborador' : 'Colaborador (opcional)'}</Label>
                  <Select
                    value={form.profile_id || '__none__'}
                    onValueChange={(v) => setForm((p) => ({ ...p, profile_id: v === '__none__' ? '' : v }))}
                  >
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="Escolher da equipe" /></SelectTrigger>
                    <SelectContent>
                      {!formEhSalario ? <SelectItem value="__none__">Nenhum</SelectItem> : null}
                      {(pessoas || [])
                        .filter((pessoa) => pessoa.status !== 'inactive')
                        .map((pessoa) => (
                          <SelectItem key={pessoa.id} value={pessoa.id}>{pessoa.full_name || pessoa.id}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                {formEhSalario ? (
                  <div className="space-y-1.5">
                    <Label>Tipo</Label>
                    <Select
                      value={form.folha_parte || 'pagamento'}
                      onValueChange={(v) => setForm((p) => ({ ...p, folha_parte: v }))}
                    >
                      <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pagamento">Salário (restante)</SelectItem>
                        <SelectItem value="vale">Vale</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Cliente (opcional)</Label>
                <Select
                  value={form.cliente_id || '__none__'}
                  onValueChange={(v) => setForm((p) => ({ ...p, cliente_id: v === '__none__' ? '' : v }))}
                  disabled={editing?.origem === 'mensalidade'}
                >
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
                    {ativos.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.empresa || c.nome_contato}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {!formEhSalario ? (
              <div className="space-y-1.5">
                <Label>Descrição</Label>
                <Textarea
                  value={form.descricao}
                  onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
                  rows={2}
                  maxLength={200}
                  className="rounded-xl"
                />
              </div>
            ) : (
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-[12px] text-slate-500 dark:bg-white/[0.04]">
                {form.profile_id
                  ? descricaoFolhaParte(form.folha_parte === 'vale' ? 'vale' : 'pagamento', pessoaNomeMap.get(form.profile_id) || 'Colaborador')
                  : 'Escolha o colaborador para montar a descrição.'}
              </p>
            )}

            {formUsaFixo ? (
              <div className="space-y-1.5">
                <Label>Fornecedor (opcional)</Label>
                <Select
                  value={form.fornecedor_id || '__none__'}
                  onValueChange={(v) => setForm((p) => ({ ...p, fornecedor_id: v === '__none__' ? '' : v }))}
                >
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
                    {fornecedoresAtivos.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-slate-400">Cadastre novos em Fixos.</p>
              </div>
            ) : null}

            {formUsaFixo && !editing ? (
              <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50/50 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-slate-800 dark:text-slate-100">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300"
                    checked={Boolean(form.recorrente)}
                    onChange={(e) => setForm((p) => ({ ...p, recorrente: e.target.checked }))}
                  />
                  Recorrente (cria vários meses)
                </label>
                {form.recorrente ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Quantos meses</Label>
                      <Input
                        type="number"
                        min="1"
                        max="60"
                        value={form.quantos_meses}
                        onChange={(e) => setForm((p) => ({ ...p, quantos_meses: e.target.value }))}
                        className="rounded-xl bg-white dark:bg-transparent"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Termina em (opcional)</Label>
                      <DayField
                        ariaLabel="Data de término da recorrência"
                        value={form.termina_em}
                        onChange={(iso) => setForm((p) => ({ ...p, termina_em: iso }))}
                        className="flex h-10 w-full rounded-xl border border-input bg-white px-3 py-2 text-sm tabular-nums ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-transparent"
                      />
                    </div>
                    <p className="sm:col-span-2 text-[11px] text-slate-500">
                      {mesesPreviewRecorrente.length
                        ? `Vai criar ${mesesPreviewRecorrente.length} lançamento${mesesPreviewRecorrente.length === 1 ? '' : 's'} (${formatMonthLabel(mesesPreviewRecorrente[0])} → ${formatMonthLabel(mesesPreviewRecorrente[mesesPreviewRecorrente.length - 1])}). Depois dá para parar em Fixos.`
                        : 'Informe quantos meses ou a data de término.'}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Valor (R$)</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.valor}
                  onChange={(e) => setForm((p) => ({ ...p, valor: e.target.value }))}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Data de caixa</Label>
                <DayField
                  ariaLabel="Data de caixa"
                  value={form.data_caixa}
                  onChange={(iso) => setForm((p) => ({ ...p, data_caixa: iso }))}
                  className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm tabular-nums ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v }))}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="previsto">Previsto</SelectItem>
                  {form.grupo === 'receita' || form.grupo === 'repasse' ? (
                    <SelectItem value="recebido">Recebido</SelectItem>
                  ) : null}
                  {form.grupo !== 'receita' && form.grupo !== 'repasse' ? (
                    <SelectItem value="pago">Pago</SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button type="button" className="rounded-xl" onClick={saveLancamento} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={folhaOpen} onOpenChange={setFolhaOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Gestão do colaborador</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-500">O salário se repete todo mês. A pessoa precisa já existir em Configurações.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Pessoa</Label>
              <Select value={folhaForm.profile_id} onValueChange={(v) => setFolhaForm((p) => ({ ...p, profile_id: v }))} disabled={Boolean(folhaForm.profile_id)}>
                <SelectTrigger><SelectValue placeholder="Escolher da equipe" /></SelectTrigger>
                <SelectContent>
                  {pessoas
                    .filter((pessoa) => pessoa.status !== 'inactive')
                    .filter((pessoa) => pessoa.id === folhaForm.profile_id || !contratos.some((contrato) => contrato.ativo !== false && contrato.profile_id === pessoa.id))
                    .map((pessoa) => (
                      <SelectItem key={pessoa.id} value={pessoa.id}>{pessoa.full_name || pessoa.id}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Time (área)</Label>
              <Select value={folhaForm.squad_id || '__none__'} onValueChange={(v) => setFolhaForm((p) => ({ ...p, squad_id: v === '__none__' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Sem time" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem time</SelectItem>
                  {squads.map((squad) => (
                    <SelectItem key={squad.id} value={squad.id}>{squad.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Função</Label>
              <Input value={folhaForm.funcao} onChange={(e) => setFolhaForm((p) => ({ ...p, funcao: e.target.value }))} placeholder="Ex.: Designer" />
            </div>
            <div className="space-y-1.5">
              <Label>Salário</Label>
              <Input inputMode="decimal" value={folhaForm.salario} onChange={(e) => setFolhaForm((p) => ({ ...p, salario: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Vale</Label>
                <div className="flex items-center gap-2">
                  <Input
                    inputMode="numeric"
                    value={folhaForm.pct_vale}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 3);
                      const n = digits === '' ? '' : String(Math.min(100, Number(digits)));
                      setFolhaForm((p) => ({ ...p, pct_vale: n, pct_pagamento: n === '' ? '100' : String(100 - Number(n)) }));
                    }}
                    placeholder="0"
                  />
                  <span className="text-sm text-slate-500">%</span>
                </div>
                <p className="text-xs tabular-nums text-slate-500">{formatMoneyBr(splitSalario(folhaForm.salario, folhaForm.pct_vale).vale)}</p>
              </div>
              <div className="space-y-1.5">
                <Label>Dia do vale</Label>
                <Input inputMode="numeric" value={folhaForm.dia_vale} onChange={(e) => setFolhaForm((p) => ({ ...p, dia_vale: e.target.value }))} placeholder="1 a 28" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Pagamento</Label>
                <div className="flex items-center gap-2">
                  <Input
                    inputMode="numeric"
                    value={folhaForm.pct_pagamento}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 3);
                      const n = digits === '' ? '' : String(Math.min(100, Number(digits)));
                      setFolhaForm((p) => ({ ...p, pct_pagamento: n, pct_vale: n === '' ? '0' : String(100 - Number(n)) }));
                    }}
                    placeholder="100"
                  />
                  <span className="text-sm text-slate-500">%</span>
                </div>
                <p className="text-xs tabular-nums text-slate-500">{formatMoneyBr(splitSalario(folhaForm.salario, folhaForm.pct_vale).pagamento)}</p>
              </div>
              <div className="space-y-1.5">
                <Label>Dia do pagamento</Label>
                <Input inputMode="numeric" value={folhaForm.dia_pagamento} onChange={(e) => setFolhaForm((p) => ({ ...p, dia_pagamento: e.target.value }))} placeholder="1 a 28" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Extras</Label>
              <Input inputMode="decimal" value={folhaForm.extras} onChange={(e) => setFolhaForm((p) => ({ ...p, extras: e.target.value }))} />
              <p className="text-xs text-slate-500">Entram no pagamento.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Desconto</Label>
                <Input
                  inputMode="decimal"
                  value={folhaForm.desconto}
                  onChange={(e) => setFolhaForm((p) => ({ ...p, desconto: e.target.value }))}
                  disabled={folhaEdit ? folhaPagamentoLiquidado(folhaEdit, lancMapFolha) : false}
                />
                <p className="text-xs text-slate-500">Sai só do pagamento deste mês.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Motivo do desconto</Label>
                <Input
                  value={folhaForm.desconto_motivo}
                  onChange={(e) => setFolhaForm((p) => ({ ...p, desconto_motivo: e.target.value }))}
                  placeholder="Falta, adiantamento…"
                  maxLength={120}
                  disabled={folhaEdit ? folhaPagamentoLiquidado(folhaEdit, lancMapFolha) : false}
                />
              </div>
            </div>
            {folhaEdit && folhaPagamentoLiquidado(folhaEdit, lancMapFolha) ? (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Pagamento já marcado como pago. Para mudar o desconto, cancele o lançamento em Lançamentos.
              </p>
            ) : null}
            <div className="space-y-1.5">
              <Label>Como paga</Label>
              <Select value={folhaForm.forma} onValueChange={(v) => setFolhaForm((p) => ({ ...p, forma: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(FORMA_LABEL).map(([id, label]) => (
                    <SelectItem key={id} value={id}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Pagamento deste mês</Label>
                <Select value={folhaForm.status} onValueChange={(v) => setFolhaForm((p) => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="previsto">A pagar</SelectItem>
                    <SelectItem value="pago">Pago</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {splitSalario(folhaForm.salario, folhaForm.pct_vale).vale > 0 ? (
                <div className="space-y-1.5">
                  <Label>Vale (mês seguinte)</Label>
                  <Select value={folhaForm.vale_status} onValueChange={(v) => setFolhaForm((p) => ({ ...p, vale_status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="previsto">A pagar</SelectItem>
                      <SelectItem value="pago">Pago</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            {contratos.some((item) => item.profile_id === folhaForm.profile_id && item.ativo !== false) ? (
              <Button type="button" variant="ghost" className="mr-auto text-rose-600" onClick={tirarDaFolha} disabled={saving}>
                Tirar da folha
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={() => setFolhaOpen(false)}>Cancelar</Button>
            <Button type="button" onClick={saveFolha} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {folhaEdit ? 'Salvar' : 'Colocar na folha'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={squadOpen}
        onOpenChange={(open) => {
          setSquadOpen(open);
          if (!open) {
            setSquadEditId(null);
            setSquadEditNome('');
          }
        }}
      >
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Times da equipe</DialogTitle>
            <DialogDescription className="text-[13px] leading-5 text-slate-500">
              Agrupe por área (Tráfego, Criação, Social…) só para filtrar a folha. Não altera salário nem pagamento.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              value={squadNome}
              onChange={(e) => setSquadNome(e.target.value)}
              placeholder="Ex.: Criação"
              onKeyDown={(e) => {
                if (e.key === 'Enter') salvarSquad();
              }}
            />
            <Button type="button" className="shrink-0" onClick={salvarSquad} disabled={saving}>
              Criar
            </Button>
          </div>
          <ul className="max-h-[min(50vh,280px)] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200/70 dark:divide-white/[0.06] dark:border-white/10">
            {squads.length === 0 ? (
              <li className="px-3 py-6 text-center text-[13px] text-slate-500">Nenhum time ainda. Crie o primeiro acima.</li>
            ) : (
              squads.map((squad) => {
                const editando = squadEditId === squad.id;
                return (
                  <li key={squad.id} className="flex items-center gap-2 px-3 py-2.5">
                    {editando ? (
                      <Input
                        className="h-8 flex-1 text-sm"
                        value={squadEditNome}
                        onChange={(e) => setSquadEditNome(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') salvarEdicaoSquad();
                          if (e.key === 'Escape') {
                            setSquadEditId(null);
                            setSquadEditNome('');
                          }
                        }}
                        autoFocus
                      />
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-900 dark:text-white">{squad.nome}</span>
                    )}
                    <div className="flex shrink-0 items-center gap-0.5">
                      {editando ? (
                        <>
                          <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-[11px]" disabled={saving} onClick={() => { setSquadEditId(null); setSquadEditNome(''); }}>
                            Cancelar
                          </Button>
                          <Button type="button" size="sm" className="h-8 px-2 text-[11px]" disabled={saving} onClick={salvarEdicaoSquad}>
                            Salvar
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-slate-500"
                            aria-label={`Renomear ${squad.nome}`}
                            disabled={saving}
                            onClick={() => {
                              setSquadEditId(squad.id);
                              setSquadEditNome(squad.nome);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-slate-400 hover:text-rose-600"
                            aria-label={`Remover ${squad.nome}`}
                            disabled={saving}
                            onClick={() => removerSquad(squad)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(pagarFolhaAlvo)}
        onOpenChange={(open) => {
          if (!open) {
            setPagarFolhaAlvo(null);
            setPagarFolhaData('');
            setPagarFolhaFile(null);
            setPagarFolhaTirar(false);
          }
        }}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pagarFolhaAlvo?.ajuste ? 'Data do pagamento' : 'Registrar pagamento'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pagarFolhaAlvo?.row
                ? (() => {
                    const p = pessoas.find((x) => x.id === pagarFolhaAlvo.row.profile_id);
                    const nome = p?.full_name || 'Colaborador';
                    const base = pagarFolhaAlvo.row;
                    const partes = splitSalario(base.salario, base.pct_vale);
                    const valor =
                      pagarFolhaAlvo.parte === 'vale' ? partes.vale : partePagamento(base);
                    const tipo = pagarFolhaAlvo.parte === 'vale' ? 'Vale' : 'Salário';
                    return `${nome} · ${tipo} · ${formatMoneyBr(valor)}.`;
                  })()
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>Pago em (entra no caixa)</Label>
              <DayField
                ariaLabel="Pago em (entra no caixa)"
                value={pagarFolhaData}
                onChange={setPagarFolhaData}
                className="flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm tabular-nums text-slate-950 outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring dark:border-white/10 dark:bg-card dark:text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Comprovante</Label>
              {pagarFolhaAlvo?.row && comprovantePathDaFolha(pagarFolhaAlvo.row, pagarFolhaAlvo.parte) && !pagarFolhaTirar ? (
                <div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-600 dark:text-slate-300">
                  <Paperclip className="h-3.5 w-3.5" />
                  <span>Arquivo anexado</span>
                  <button
                    type="button"
                    className="underline underline-offset-2"
                    onClick={() => abrirComprovanteFolha(pagarFolhaAlvo.row, pagarFolhaAlvo.parte)}
                  >
                    Abrir
                  </button>
                  <button
                    type="button"
                    className="text-rose-600 underline underline-offset-2"
                    onClick={() => {
                      setPagarFolhaTirar(true);
                      setPagarFolhaFile(null);
                    }}
                  >
                    Tirar
                  </button>
                </div>
              ) : null}
              {pagarFolhaTirar ? (
                <p className="text-[12px] text-rose-600">O comprovante será removido ao salvar.</p>
              ) : null}
              <Input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setPagarFolhaFile(file);
                  if (file) setPagarFolhaTirar(false);
                }}
              />
              <p className="text-xs text-slate-500">PDF, JPG, PNG ou WEBP até 8 MB. Vale e salário têm arquivos separados.</p>
              {pagarFolhaFile ? (
                <p className="text-[12px] text-slate-600 dark:text-slate-300">Novo arquivo: {pagarFolhaFile.name}</p>
              ) : null}
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Fechar</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-slate-950 text-white hover:bg-slate-800"
              onClick={async (e) => {
                e.preventDefault();
                const alvo = pagarFolhaAlvo;
                const data = pagarFolhaData;
                const file = pagarFolhaFile;
                const tirar = pagarFolhaTirar;
                if (!alvo?.row) return;
                setSaving(true);
                try {
                  await aplicarComprovanteFolha(alvo.row, alvo.parte, { file, tirar });
                  setPagarFolhaAlvo(null);
                  setPagarFolhaData('');
                  setPagarFolhaFile(null);
                  setPagarFolhaTirar(false);
                  if (alvo.ajuste) await salvarDataPagamentoEquipe(alvo.row, alvo.parte, data);
                  else if (alvo.parte === 'vale') await pagarVale(alvo.row, data);
                  else await pagarFolha(alvo.row, data);
                } catch (error) {
                  toast({
                    title: 'Não foi possível salvar o comprovante',
                    description: error.message,
                    variant: 'destructive',
                  });
                  setSaving(false);
                }
              }}
            >
              {pagarFolhaAlvo?.ajuste ? 'Salvar' : 'Registrar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(receberAlvo)}
        onOpenChange={(open) => {
          if (!open) {
            setReceberAlvo(null);
            setReceberAjuste(false);
            setReceberData('');
          }
        }}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{receberAjuste ? 'Data do recebimento' : 'Registrar recebimento'}</AlertDialogTitle>
            <AlertDialogDescription>
              {receberAlvo
                ? `${clienteNome.get(receberAlvo.cliente_id) || 'Cliente'} · ${formatMoneyBr(receberAlvo.valor)}.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5 py-1">
            <Label>Pago em (entra no caixa)</Label>
            <DayField
              ariaLabel="Pago em (entra no caixa)"
              value={receberData}
              onChange={setReceberData}
              className="flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm tabular-nums text-slate-950 outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring dark:border-white/10 dark:bg-card dark:text-white"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Fechar</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-slate-950 text-white hover:bg-slate-800"
              onClick={(e) => {
                e.preventDefault();
                const row = receberAlvo;
                const data = receberData;
                const ajuste = receberAjuste;
                setReceberAlvo(null);
                setReceberAjuste(false);
                setReceberData('');
                if (!row) return;
                if (ajuste) salvarDataRecebimento(row, data);
                else settle(row, data);
              }}
            >
              {receberAjuste ? 'Salvar data' : 'Registrar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(cancelAlvo)}
        onOpenChange={(open) => {
          if (!open) {
            setCancelAlvo(null);
            setCancelMotivo('');
          }
        }}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar lançamento</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelAlvo
                ? `${cancelAlvo.descricao || 'Lançamento'} · ${formatMoneyBr(cancelAlvo.valor)}. Sai do DRE e do caixa.`
                : ''}
              {cancelAlvo?.origem === 'folha'
                ? ' Na Equipe, o pagamento volta a A pagar; use Paguei de novo se precisar.'
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5 py-1">
            <Label htmlFor="cancel-motivo">Motivo</Label>
            <Textarea
              id="cancel-motivo"
              value={cancelMotivo}
              onChange={(e) => setCancelMotivo(e.target.value)}
              placeholder="Ex.: marquei Paguei por engano"
              rows={3}
              className="resize-none rounded-xl"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-rose-600 text-white hover:bg-rose-700"
              disabled={saving}
              onClick={(e) => {
                e.preventDefault();
                confirmarCancelarLancamento();
              }}
            >
              Cancelar lançamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
