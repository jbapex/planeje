import React from 'react';
import { HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export default function WorkspacePageHeader({
  title,
  label,
  labelClassName,
  description,
  help,
  leading,
  actions,
  className,
}) {
  return (
    <header
      className={cn(
        'flex flex-col gap-3 rounded-2xl border border-slate-200/70 bg-white px-4 py-3 shadow-[0_8px_28px_rgba(15,23,42,0.035)] dark:border-white/10 dark:bg-card md:flex-row md:items-center md:justify-between',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        {leading}
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold tracking-[-0.035em] text-slate-950 dark:text-white">
              {title}
            </h1>
            {label ? (
              <span className={cn(
                'rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]',
                labelClassName || 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300',
              )}>
                {label}
              </span>
            ) : null}
            {help ? (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 rounded-full text-slate-500"
                    aria-label={`Ajuda sobre ${typeof title === 'string' ? title : 'esta página'}`}
                  >
                    <HelpCircle className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-96 max-w-[calc(100vw-2rem)] rounded-2xl border-slate-200 p-4 text-sm leading-6 shadow-xl">
                  {help}
                </PopoverContent>
              </Popover>
            ) : null}
          </div>
          {description ? (
            <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-1.5 md:justify-end">{actions}</div> : null}
    </header>
  );
}
