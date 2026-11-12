import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarDays } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatDayBr } from '@/lib/miniCrm';

const toDate = (ymd) => (ymd ? new Date(`${ymd}T12:00:00`) : undefined);
const toYmd = (date) => format(date, 'yyyy-MM-dd');

/** Período personalizado: 1º clique = início, 2º = fim (troca se vier antes). */
export default function MiniCrmRangePicker({ from, to, onChange, open, onOpenChange }) {
  const [draft, setDraft] = useState({ from: toDate(from), to: toDate(to) });
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft({ from: toDate(from), to: toDate(to) });
      setPending(false);
    }
  }, [open, from, to]);

  const pickDay = (day) => {
    if (!pending) {
      setDraft({ from: day, to: undefined });
      setPending(true);
      return;
    }
    const start = draft.from;
    const [a, b] = day < start ? [day, start] : [start, day];
    setDraft({ from: a, to: b });
    setPending(false);
    onChange(toYmd(a), toYmd(b));
    onOpenChange(false);
  };

  const label = from || to
    ? `${from ? formatDayBr(from) : '…'} – ${to ? formatDayBr(to) : '…'}`
    : 'Escolher datas';

  const month = draft.from || new Date();
  const defaultMonth = new Date(month.getFullYear(), month.getMonth(), 1);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button type="button" className="mini-crm-field mini-crm-range-trigger" aria-label="Escolher período personalizado">
          <CalendarDays size={15} aria-hidden="true" />
          <span>{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="z-[80] w-auto p-0" align="start">
        <Calendar
          locale={ptBR}
          mode="range"
          numberOfMonths={2}
          defaultMonth={defaultMonth}
          selected={draft}
          onDayClick={pickDay}
          classNames={{
            day_range_start: 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground rounded-md',
            day_range_end: 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground rounded-md',
            day_range_middle: 'aria-selected:bg-blue-100 aria-selected:text-blue-900 rounded-none',
          }}
        />
        <p className="mini-crm-range-hint">
          {pending && draft.from
            ? `Início ${format(draft.from, 'dd/MM/yyyy')} — agora clique no dia final.`
            : 'Clique no dia inicial e depois no dia final.'}
        </p>
      </PopoverContent>
    </Popover>
  );
}
