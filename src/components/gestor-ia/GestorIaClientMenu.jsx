import React from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Bell, FileText, Link2, MoreHorizontal, Pencil, Target, User } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const settingsOptions = [
  ['metricas', 'Métricas', BarChart3], ['contas', 'Contas vinculadas', Link2], ['metas', 'Metas cadastradas', Target],
  ['decisoes', 'Decisões', Bell], ['relatorios', 'Relatório do cliente', FileText], ['memoria', 'Memória do cliente', User],
];
const rowOptions = [
  ['metricas', 'Abrir cliente', BarChart3], ['metas', 'Metas do cliente', Target], ['contas', 'Contas de anúncio', Link2],
];

export default function GestorIaClientMenu({ label, destination, editTo, compact = false }) {
  const options = compact ? rowOptions : settingsOptions;
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button className="gia-icon-button gia-menu-trigger" type="button" aria-label={label}><MoreHorizontal aria-hidden="true" /></button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="gia-context-menu">
      {options.map(([tab, title, Icon]) => <DropdownMenuItem key={tab} asChild>
        <Link to={destination(tab)}><Icon aria-hidden="true" />{title}</Link>
      </DropdownMenuItem>)}
      {editTo && <DropdownMenuItem asChild><Link to={editTo} state={{ backOnClose: true }}><Pencil aria-hidden="true" />Editar cliente</Link></DropdownMenuItem>}
    </DropdownMenuContent>
  </DropdownMenu>;
}
