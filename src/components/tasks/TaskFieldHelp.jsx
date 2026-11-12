import React from 'react';
import { HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export default function TaskFieldHelp({ label, children, className }) {
  if (!children) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={className || 'h-5 w-5 shrink-0 text-muted-foreground'}
          aria-label={label || 'Ajuda'}
          onClick={(event) => event.stopPropagation()}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="z-[70] w-72 text-sm leading-5" align="start" onClick={(event) => event.stopPropagation()}>
        {children}
      </PopoverContent>
    </Popover>
  );
}

export function TaskFieldLabel({ htmlFor, children, help, helpLabel, className }) {
  return (
    <div className="flex items-center gap-0.5">
      <Label htmlFor={htmlFor} className={className || 'text-xs'}>{children}</Label>
      <TaskFieldHelp label={helpLabel || `Sobre ${children}`}>{help}</TaskFieldHelp>
    </div>
  );
}
