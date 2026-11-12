import React, { useState } from 'react';
import { rewritePublicStorageUrl } from '@/lib/publicStorageUrl';

export default function GestorIaClientAvatar({ client }) {
  const [failedUrl, setFailedUrl] = useState(null);
  const source = Array.isArray(client?.logo_urls) && client.logo_urls
    .find((value) => typeof value === 'string' && /^(https?:\/\/|\/(?![/\\]))/i.test(value.trim()));
  const url = source && rewritePublicStorageUrl(source);
  const initials = client?.empresa?.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toLocaleUpperCase('pt-BR');
  return url && url !== failedUrl
    ? <img className="gia-client-avatar" src={url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailedUrl(url)} />
    : <span className="gia-initials" aria-hidden="true">{initials || '—'}</span>;
}
