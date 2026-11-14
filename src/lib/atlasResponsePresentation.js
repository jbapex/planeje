import { plainTextToRichHtml } from './richText.js';

const escapeHtml = value => String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

function appHref(value,origin) {
  if (typeof value !== 'string') return null;
  const href = value.trim();
  if (!/^(?:\/(?!\/)|#\/|https?:\/\/)/i.test(href) || /[\u0000-\u0020\u007f]/.test(href)) return null;
  try {
    let url = new URL(href,origin+'/');
    if (!['http:','https:'].includes(url.protocol) || url.origin !== origin || url.username || url.password) return null;
    if (url.hash.startsWith('#/')) {
      if (url.pathname !== '/' || url.search) return null;
      url = new URL(url.hash.slice(1),origin+'/');
      if (url.origin !== origin || url.username || url.password) return null;
    }
    url.searchParams.sort();
    const query = url.searchParams.toString();
    return '#'+url.pathname+(query ? '?'+query : '')+url.hash;
  } catch { return null; }
}

/** Only server-selected official destinations may become clickable Atlas links. */
export function atlasResponseToHtml(content,links,{ origin = globalThis.window?.location?.origin || globalThis.location?.origin || 'https://planeje.invalid' } = {}) {
  let appOrigin;
  try {
    const url = new URL(origin);
    if (['http:','https:'].includes(url.protocol) && !url.username && !url.password) appOrigin = url.origin;
  } catch { /* Invalid configuration grants no link authority. */ }
  const allowed = new Set(appOrigin && Array.isArray(links) ? links.map(link => appHref(link?.href,appOrigin)).filter(Boolean) : []);
  const source = String(content || '');
  let prefix = '\uE000atlas-link-';
  while (source.includes(prefix)) prefix += 'x';
  const replacements = [];
  const marked = source.replace(/\[([^\]\n]+)\]\(([^\s)]+)\)/g,(original,label,destination) => {
    const href = appOrigin ? appHref(destination,appOrigin) : null;
    const labelHtml = plainTextToRichHtml(label).replace(/^<p>([\s\S]*)<\/p>$/,'$1');
    const html = href && allowed.has(href) ? `<a href="${escapeHtml(href)}">${labelHtml}</a>` : escapeHtml(original);
    const token = prefix+replacements.length+'\uE001';
    replacements.push({ token,html });
    return token;
  });
  // Keep the house formatter, but leave link authority exclusively to the list above.
  let html = plainTextToRichHtml(marked).replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi,'$1');
  for (const replacement of replacements) html = html.split(replacement.token).join(replacement.html);
  return html;
}
