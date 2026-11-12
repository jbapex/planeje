import React, { useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TooltipCustom } from '@/components/ui/tooltip-custom';
import { cn } from '@/lib/utils';
import SettingsAlertsPanel from '@/components/settings/SettingsAlertsPanel';

function SidebarNotificationsMenu({ expanded }) {
  const [open, setOpen] = useState(false);

  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size={expanded ? 'sm' : 'icon'}
      className={cn(
        'planeje-sidebar-link border-0 bg-transparent shadow-none hover:shadow-none',
        expanded ? 'w-full justify-start h-11 px-3.5' : 'h-auto w-full max-w-[56px]',
        open && 'bg-white/10'
      )}
      aria-label="Notificações"
    >
      <Bell className="w-5 h-5 shrink-0" />
      {expanded && <span className="planeje-sidebar-label">Notificações</span>}
    </Button>
  );

  const menu = (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        side="right"
        align={expanded ? 'end' : 'center'}
        className="w-80 p-0"
        sideOffset={8}
      >
        <div className="border-b px-4 py-3">
          <p className="text-sm font-semibold text-foreground">Notificações</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Sons no app e avisos com a aba em segundo plano.
          </p>
        </div>
        <div className="p-4">
          <SettingsAlertsPanel idPrefix="sidebar" />
        </div>
      </PopoverContent>
    </Popover>
  );

  if (expanded) return menu;

  return (
    <TooltipCustom content="Notificações" side="right" triggerClassName="w-full flex justify-center">
      {menu}
    </TooltipCustom>
  );
}

export default SidebarNotificationsMenu;
