import React, { useState } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';

const MultiSelect = ({ options, value = [], onChange, placeholder, className, ...props }) => {
  const [open, setOpen] = useState(false);

  const selectedValues = value.map(v => v.value);

  const handleSelect = (currentValue) => {
    const option = options.find(opt => opt.value === currentValue);
    if (!option) return;

    const isSelected = selectedValues.includes(currentValue);
    
    const newSelected = isSelected
      ? value.filter((item) => item.value !== currentValue)
      : [...value, option];
      
    onChange(newSelected);
  };

  const handleUnselect = (itemToRemove) => {
    onChange(value.filter((i) => i.value !== itemToRemove.value));
  };

  return (
    <Popover open={open} onOpenChange={setOpen} {...props}>
      <PopoverTrigger asChild>
        <div className={cn("flex h-auto min-h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background [&:has([data-state=open])]:ring-2 [&:has([data-state=open])]:ring-ring [&:has([data-state=open])]:ring-offset-2", className)}>
          <div className="flex gap-1 flex-wrap">
            {value.length === 0 && <span className="text-muted-foreground">{placeholder}</span>}
            {value.map((item) => (
                <Badge
                  variant="secondary"
                  key={item.value}
                  className="mr-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUnselect(item);
                  }}
                >
                  {item.label}
                  <X className="ml-1 h-3 w-3 cursor-pointer" />
                </Badge>
              )
            )}
          </div>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder="Pesquisar..." />
          <CommandEmpty>Nenhum item encontrado.</CommandEmpty>
          <CommandGroup className="max-h-64 overflow-auto">
            {options.map((option) => (
              <CommandItem
                key={option.value}
                onSelect={() => handleSelect(option.value)}
              >
                <Check
                  className={cn(
                    'mr-2 h-4 w-4',
                    selectedValues.includes(option.value) ? 'opacity-100' : 'opacity-0'
                  )}
                />
                {option.content || option.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export { MultiSelect };