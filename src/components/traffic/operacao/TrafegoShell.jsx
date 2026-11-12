import { Link } from 'react-router-dom';
import {
  Bell,
  ClipboardList,
  FileBarChart,
  Filter,
  LayoutDashboard,
  ListTodo,
  MoreHorizontal,
  Paperclip,
  Users,
} from 'lucide-react';

export const TRAFEGO_NAV = [
  { tab: 'visao', label: 'Visão geral', short: 'Visão', icon: LayoutDashboard, primary: true },
  { tab: 'operacoes', label: 'Operações', short: 'Fila', icon: Filter, primary: true },
  { tab: 'checkup', label: 'Check-up', short: 'Check-up', icon: ClipboardList, primary: true },
  { tab: 'clientes', label: 'Clientes', short: 'Clientes', icon: Users, primary: true },
  { tab: 'tarefas', label: 'Tarefas', short: 'Tarefas', icon: ListTodo, primary: false },
  { tab: 'alertas', label: 'Alertas', short: 'Alertas', icon: Bell, primary: false },
  { tab: 'criativos', label: 'Criativos', short: 'Criativos', icon: Paperclip, primary: false },
  { tab: 'relatorios', label: 'Relatórios', short: 'Relatórios', icon: FileBarChart, primary: false },
];

export const TRAFEGO_TITLES = {
  visao: { title: 'Visão geral', hint: 'O que precisa de ação agora' },
  operacoes: { title: 'Central de operações', hint: 'Fila por exceção' },
  checkup: { title: 'Check-up diário', hint: 'Confirme uma conta por vez' },
  clientes: { title: 'Clientes', hint: 'Mesma saúde da Central' },
  tarefas: { title: 'Tarefas', hint: 'Demandas reais de tráfego pago' },
  alertas: { title: 'Alertas', hint: 'Somente o que é acionável' },
  criativos: { title: 'Criativos', hint: 'Anexos e Drive da operação' },
  relatorios: { title: 'Relatórios', hint: 'Estrutura visual do período' },
};

export function navHref(basePath, tab) {
  return `${basePath}/${tab}`;
}

export default function TrafegoShell({ tab, basePath, overview, primaryAction, children }) {
  const copy = TRAFEGO_TITLES[tab] || TRAFEGO_TITLES.visao;
  const checkup = overview?.checkup;
  const dateLabel = formatDay(overview?.operationalDate);
  const primary = TRAFEGO_NAV.filter((item) => item.primary);
  const extra = TRAFEGO_NAV.filter((item) => !item.primary);
  const progress = checkup?.total ? Math.round((checkup.reviewed / checkup.total) * 100) : 0;

  return (
    <div className="trafego-app">
      <aside className="trafego-side" aria-label="Navegação de tráfego">
        <p className="trafego-side-kicker">Tráfego pago</p>
        {TRAFEGO_NAV.map((item) => {
          const Icon = item.icon;
          const active = tab === item.tab;
          return (
            <Link
              key={item.tab}
              to={navHref(basePath, item.tab)}
              className={`trafego-side-link${active ? ' is-active' : ''}`}
            >
              <Icon size={16} strokeWidth={2} />
              {item.label}
            </Link>
          );
        })}
      </aside>

      <div className="trafego-main">
        <nav className="trafego-mobile-nav" aria-label="Seções principais">
          {primary.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.tab}
                to={navHref(basePath, item.tab)}
                className={`trafego-mobile-link${tab === item.tab ? ' is-active' : ''}`}
              >
                <Icon size={15} strokeWidth={2} />
                {item.short}
              </Link>
            );
          })}
          <details className="trafego-more">
            <summary>
              <MoreHorizontal size={15} />
              Mais
            </summary>
            <div className="trafego-more-menu">
              {extra.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.tab} to={navHref(basePath, item.tab)}>
                    <Icon size={14} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </details>
        </nav>

        <header className="trafego-head">
          <div>
            <p className="trafego-head-kicker">Tráfego pago · {dateLabel}</p>
            <h1>{copy.title}</h1>
            <p className="trafego-head-hint">{copy.hint}</p>
          </div>
          <div className="trafego-head-meta">
            {checkup ? (
              <div className="trafego-progress" title="Progresso do check-up de hoje">
                <span>
                  Check-up {checkup.reviewed}/{checkup.total}
                </span>
                <b aria-hidden>
                  <i style={{ width: `${progress}%` }} />
                </b>
              </div>
            ) : null}
            {primaryAction}
          </div>
        </header>

        {children}
      </div>
    </div>
  );
}

function formatDay(iso) {
  const day = String(iso || '').slice(0, 10);
  if (!day) return 'Dados indisponíveis';
  const [y, m, d] = day.split('-');
  if (!y || !m || !d) return 'Dados indisponíveis';
  return `${d}/${m}/${y}`;
}
