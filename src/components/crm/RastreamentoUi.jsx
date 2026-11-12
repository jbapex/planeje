import React from 'react';
import { HelpCircle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/** Ícone `?` no padrão da Cobertura: a explicação só abre no clique. */
export function RastreamentoHelp({ label = 'Ajuda', children, className }) {
  if (!children) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn('rt-help', className)}
          aria-label={label}
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-80 rounded-2xl border-slate-200 p-4 text-sm leading-6 text-slate-700 shadow-[0_18px_50px_rgba(15,23,42,0.12)] dark:border-white/10 dark:text-slate-200"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

export function RastreamentoSectionTitle({ as: Tag = 'h2', title, help, helpLabel, className }) {
  return (
    <div className={cn('rt-section-title-row', className)}>
      <Tag className="rt-section-title">{title}</Tag>
      <RastreamentoHelp label={helpLabel || `Sobre ${title}`}>{help}</RastreamentoHelp>
    </div>
  );
}
