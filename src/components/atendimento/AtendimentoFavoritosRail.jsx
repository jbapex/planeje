import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { favoritoDisplayName, favoritoShortcutBadge } from '@/lib/atendimentoFavoritos';
import { TooltipCustom } from '@/components/ui/tooltip-custom';

export default function AtendimentoFavoritosRail({
  favorites = [],
  selectedId,
  onSelect,
  variant = 'inline',
}) {
  if (!favorites.length) return null;

  const isGlobal = variant === 'global';

  return (
    <aside
      className={cn(
        'planeje-fav-rail hidden xl:flex flex-col shrink-0 self-stretch',
        isGlobal && 'planeje-fav-rail--global',
      )}
      aria-label="Conversas favoritas"
    >
      <div className="planeje-fav-rail-inner">
        {favorites.map((conv) => {
          const label = favoritoDisplayName(conv);
          const badge = favoritoShortcutBadge(conv);
          const active = selectedId === conv.id;

          const item = (
            <button
              type="button"
              className={cn('planeje-fav-shortcut', active && 'is-active')}
              onClick={() => onSelect(conv)}
              aria-label={label}
              aria-current={active ? 'true' : undefined}
            >
              <span className="planeje-fav-shortcut-avatar-wrap">
                <Avatar className="h-7 w-7">
                  <AvatarImage src={conv.profile_pic_url || undefined} alt="" />
                  <AvatarFallback className="bg-[#dfe5e7] text-[#54656f] text-[10px]">
                    {conv.is_group ? <Users className="h-3 w-3" /> : label.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {badge > 0 && (
                  <span className="planeje-fav-shortcut-badge">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </span>
            </button>
          );

          return (
            <TooltipCustom key={conv.id} content={label} side="left" triggerClassName="w-full flex justify-center">
              {item}
            </TooltipCustom>
          );
        })}
      </div>
    </aside>
  );
}
