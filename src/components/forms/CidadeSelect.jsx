import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getCidadesByUf, matchCidade } from '@/lib/brasilMunicipios';
import { cn } from '@/lib/utils';

function fold(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export default function CidadeSelect({ uf, value, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const cidades = useMemo(() => getCidadesByUf(uf), [uf]);
  const selected = matchCidade(uf, value) || value || '';
  const ready = Boolean(uf) && !disabled;

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={!ready}
          className="w-full justify-between font-normal dark:bg-gray-700 dark:text-white dark:border-gray-600"
        >
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>
            {!uf ? 'Selecione o estado primeiro' : selected || 'Buscar cidade…'}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 z-[80]" align="start">
        <Command filter={(item, search) => (fold(item).includes(fold(search)) ? 1 : 0)}>
          <CommandInput placeholder="Digite para filtrar cidades…" />
          <CommandEmpty>Nenhuma cidade encontrada neste estado.</CommandEmpty>
          <CommandGroup className="max-h-64 overflow-auto">
            {cidades.map((cidade) => (
              <CommandItem
                key={cidade}
                value={cidade}
                onSelect={() => {
                  onChange(cidade);
                  setOpen(false);
                }}
              >
                <Check className={cn('mr-2 h-4 w-4', selected === cidade ? 'opacity-100' : 'opacity-0')} />
                {cidade}
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

