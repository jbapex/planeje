import React, { useMemo, useState } from 'react';
import { Calendar as CalendarPickerIcon, ChevronDown } from 'lucide-react';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  MESSAGE_PERIOD_PRESETS,
  isoYmdToLocalDate,
  localDateToIsoYmd,
  matchMessagePeriodPreset,
  messagePeriodIso,
  messagePeriodTriggerLabel,
} from '@/lib/contatosMessagePeriod';

export default function ContatosMessagePeriodPicker({
  fromIso,
  toIso,
  onChangeFrom,
  onChangeTo,
  onChangePeriod,
  compact = false,
}) {
  const [open, setOpen] = useState(false);
  const fromDate = isoYmdToLocalDate(fromIso);
  const toDate = isoYmdToLocalDate(toIso);
  const activePreset = useMemo(
    () => matchMessagePeriodPreset(fromIso, toIso),
    [fromIso, toIso]
  );
  const label = messagePeriodTriggerLabel(fromIso, toIso);

  const applyIso = (from, to, close = false) => {
    onChangeFrom?.(from);
    onChangeTo?.(to);
    onChangePeriod?.({ from, to });
    if (close) setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            'justify-start font-normal text-left text-xs rounded-xl bg-white border-slate-200 px-2.5 shrink-0 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:bg-card dark:border-border',
            compact ? 'h-7 min-w-[108px] max-w-[160px] text-[11px] rounded-md px-2' : 'h-9 min-w-[148px] sm:w-[188px]'
          )}
          aria-label="Filtrar por período"
          title="Atalhos e calendário do período"
        >
          <CalendarPickerIcon className="mr-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{label}</span>
          <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 overflow-hidden" align="start">
        <div className="flex flex-col sm:flex-row">
          <div className="sm:w-[148px] shrink-0 border-b sm:border-b-0 sm:border-r bg-slate-50/90 dark:bg-slate-900/40 p-2">
            <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Atalhos
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-1 gap-0.5">
              {MESSAGE_PERIOD_PRESETS.map((preset) => (
                <Button
                  key={preset.id}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-7 justify-start px-2 text-xs font-normal',
                    activePreset?.id === preset.id && 'bg-slate-200/80 dark:bg-slate-800 font-medium'
                  )}
                  onClick={() => {
                    const next = messagePeriodIso(preset.id);
                    applyIso(next.from, next.to, true);
                  }}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="p-2">
            <Calendar
              mode="range"
              locale={ptBR}
              numberOfMonths={1}
              defaultMonth={fromDate || toDate || new Date()}
              selected={{ from: fromDate, to: toDate }}
              onSelect={(range) => {
                applyIso(
                  range?.from ? localDateToIsoYmd(range.from) : '',
                  range?.to ? localDateToIsoYmd(range.to) : ''
                );
              }}
              initialFocus
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
