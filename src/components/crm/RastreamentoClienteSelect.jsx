import React, { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

function fold(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export default function RastreamentoClienteSelect({ clientes = [], value, onChange }) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(
    () => (clientes || []).find((cliente) => cliente.id === value) || null,
    [clientes, value],
  );

  return (
    <div className="rastreamento-hub-header__client min-w-[16rem]">
      <Label className="sr-only">Cliente</Label>
      <Popover open={open} onOpenChange={setOpen} modal>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-9 w-full justify-between rounded-lg text-sm font-normal"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className={cn('truncate', !selected && 'text-muted-foreground')}>
                {selected?.empresa || 'Buscar cliente…'}
              </span>
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0 z-[80]" align="end">
          <Command filter={(item, search) => (fold(item).includes(fold(search)) ? 1 : 0)}>
            <CommandInput placeholder="Buscar cliente…" />
            <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
            <CommandGroup className="max-h-72 overflow-auto">
              {(clientes || []).map((cliente) => (
                <CommandItem
                  key={cliente.id}
                  value={`${cliente.empresa || ''} ${cliente.id}`}
                  onSelect={() => {
                    onChange(cliente.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === cliente.id ? 'opacity-100' : 'opacity-0')} />
                  {cliente.empresa || cliente.id}
                </CommandItem>
              ))}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
