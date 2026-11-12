import React from 'react';
import { cn } from '@/lib/utils';

const CHANNEL_STYLE = {
  Instagram: { background: 'linear-gradient(135deg, #f58529, #dd2a7b, #8134af)' },
  Facebook: { background: '#1877F2' },
  LinkedIn: { background: '#0A66C2' },
  TikTok: { background: '#000000' },
  YouTube: { background: '#FF0000' },
  Site: { background: '#0F766E' },
  'Google Meu Negócio': { background: '#ffffff' },
  Outro: { background: '#6B7280' },
};

const STATUS_RING = {
  pending: 'ring-violet-400',
  scheduled: 'ring-blue-400',
  published: 'ring-green-500',
  client_posts: 'ring-teal-500',
  failed: 'ring-red-500',
  cancelled: 'ring-gray-400 opacity-60',
};

function Glyph({ d, className }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn('h-[64%] w-[64%]', className)}>
      <path fill="currentColor" d={d} />
    </svg>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[70%] w-[70%]">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

const CHANNEL_GLYPH = {
  Instagram: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z',
  Facebook: 'M14 13.5h2.7l.4-3H14V8.4c0-.8.3-1.4 1.5-1.4H17V4.2A21 21 0 0 0 14.4 4C11.8 4 10 5.6 10 8.3V10.5H7.5v3H10V22h4v-8.5z',
  LinkedIn: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452z',
  TikTok: 'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z',
  YouTube: 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z',
  Site: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z',
  Outro: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
};

export function ChannelLogo({ channel, status, size = 'md', className }) {
  const style = CHANNEL_STYLE[channel] || CHANNEL_STYLE.Outro;
  const google = channel === 'Google Meu Negócio';
  const path = CHANNEL_GLYPH[channel] || CHANNEL_GLYPH.Outro;
  return (
    <span
      title={channel}
      aria-label={channel}
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md text-white ring-2 ring-offset-1 ring-offset-background',
        size === 'sm' ? 'h-5 w-5' : 'h-7 w-7',
        google && 'border border-black/10 text-transparent',
        STATUS_RING[status] || 'ring-transparent',
        className,
      )}
      style={{ background: style.background }}
    >
      {google ? <GoogleGlyph /> : <Glyph d={path} />}
    </span>
  );
}

export default function TaskChannelBadges({ publications = [], compact = false }) {
  if (!publications.length) return null;
  const active = publications.filter((publication) => publication.status !== 'cancelled');
  const published = active.filter((publication) => publication.status === 'published').length;
  const visible = publications.slice(0, compact ? 4 : 6);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label={`${publications.length} publicações por canal`}>
      <div className="flex items-center gap-1">
        {visible.map((publication) => (
          <ChannelLogo key={publication.id} channel={publication.channel} status={publication.status} size="sm" />
        ))}
        {publications.length > visible.length && (
          <span className="text-[10px] font-medium text-muted-foreground">+{publications.length - visible.length}</span>
        )}
      </div>
      <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
        {active.length ? `${published}/${active.length} canais` : 'canais cancelados'}
      </span>
    </div>
  );
}
