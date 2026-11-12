import React from 'react';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function AtendimentoFavoritoButton({
  active = false,
  loading = false,
  disabled = false,
  onClick,
  className,
  size = 'icon',
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      className={cn(
        'wa-fav-btn shrink-0',
        active && 'is-active',
        className,
      )}
      disabled={disabled || loading}
      onClick={onClick}
      title={active ? 'Remover dos favoritos' : 'Favoritar contato'}
      aria-label={active ? 'Remover dos favoritos' : 'Favoritar contato'}
      aria-pressed={active}
    >
      <Star
        className={cn('h-4 w-4', active && 'fill-amber-400 text-amber-500')}
        strokeWidth={active ? 0 : 2}
      />
    </Button>
  );
}
