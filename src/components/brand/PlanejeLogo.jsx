import React from 'react';
import { cn } from '@/lib/utils';

export const PLANEJE_BRAND = {
  simbolo: '/brand/simbolo.png',
  horizontal: '/brand/logo-horizontal.png',
  horizontalBranco: '/brand/logo-horizontal-branco.png',
  favicon: '/brand/icon-256.png',
};

/**
 * @param {'mark' | 'horizontal' | 'horizontal-light'} variant
 * @param {'sm' | 'md' | 'lg' | 'auth'} size
 */
export default function PlanejeLogo({
  variant = 'mark',
  size = 'md',
  className,
  alt = 'Planeje',
}) {
  const src =
    variant === 'horizontal'
      ? PLANEJE_BRAND.horizontal
      : variant === 'horizontal-light'
        ? PLANEJE_BRAND.horizontalBranco
        : PLANEJE_BRAND.simbolo;

  const sizeClass =
    variant === 'mark'
      ? {
          sm: 'h-9 w-9',
          md: 'h-11 w-11',
          lg: 'h-12 w-12',
          auth: 'h-12 w-12',
        }[size]
      : {
          sm: 'h-8',
          md: 'h-10',
          lg: 'h-12',
          auth: 'h-11',
        }[size];

  return (
    <img
      src={src}
      alt={alt}
      className={cn(
        'object-contain select-none',
        variant === 'mark' ? 'aspect-square' : 'w-auto max-w-full',
        sizeClass,
        className
      )}
      draggable={false}
    />
  );
}
