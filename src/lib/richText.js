const BLOCK_TAGS = /<\/(?:p|div|h[1-6]|li|blockquote)>|<br\s*\/?>/gi;
const HTML_TAG = /<\/?(?:a|b|blockquote|br|code|div|em|font|h[1-6]|hr|i|img|li|ol|p|pre|s|span|strike|strong|table|tbody|td|tfoot|th|thead|tr|u|ul)\b[^>]*>/i;

const decodeEntities = (value) => String(value || '')
  .replace(/&nbsp;|&#160;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;|&#34;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'");

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const formatInlinePlainText = (value) => {
  let html = escapeHtml(value);
  html = html.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
  html = html.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  html = html.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  html = html.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');
  return html;
};

export function plainTextToRichHtml(value) {
  const source = String(value || '').replace(/\r\n?/g, '\n');
  if (!source) return '';

  const output = [];
  let listType = null;
  const closeList = () => {
    if (!listType) return;
    output.push(`</${listType}>`);
    listType = null;
  };

  for (const line of source.split('\n')) {
    const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*$/);
    const unordered = line.match(/^\s*[-+*•]\s+(.+?)\s*$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+?)\s*$/);
    const quote = line.match(/^\s*>\s?(.*?)\s*$/);

    if (unordered || ordered) {
      const nextList = unordered ? 'ul' : 'ol';
      if (listType !== nextList) {
        closeList();
        output.push(`<${nextList}>`);
        listType = nextList;
      }
      output.push(`<li>${formatInlinePlainText((unordered || ordered)[1])}</li>`);
      continue;
    }

    closeList();
    if (heading) {
      const level = Math.min(6, heading[1].length);
      output.push(`<h${level}>${formatInlinePlainText(heading[2])}</h${level}>`);
    } else if (quote) {
      output.push(`<blockquote>${formatInlinePlainText(quote[1]) || '<br>'}</blockquote>`);
    } else {
      output.push(`<p>${line ? formatInlinePlainText(line) : '<br>'}</p>`);
    }
  }
  closeList();
  return output.join('');
}

const removeUnsafeMarkup = (value) => String(value || '')
  .replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select|svg|math)[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
  .replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select|svg|math)\b[^>]*\/?\s*>/gi, '')
  .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  .replace(/\s+(?:href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, '');

export function richTextToPlainText(value) {
  if (!value) return '';
  const withBreaks = String(value)
    .replace(/<li\b[^>]*>/gi, '• ')
    .replace(/<\/(?:td|th)>/gi, '\t')
    .replace(/<\/tr>/gi, '\n')
    .replace(BLOCK_TAGS, '\n');
  return decodeEntities(withBreaks.replace(/<[^>]*>/g, ''))
    .replace(/\u200B/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function richTextHasContent(value) {
  return richTextToPlainText(value).length > 0 || /<img\b/i.test(String(value || ''));
}

export function richTextValueToHtml(value) {
  const source = String(value || '');
  if (!source.trim()) return '';
  if (HTML_TAG.test(source)) return sanitizeRichTextHtml(source);
  return plainTextToRichHtml(source);
}

const allowedTags = new Set(['A', 'B', 'BLOCKQUOTE', 'BR', 'CODE', 'DIV', 'EM', 'FONT', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR', 'I', 'IMG', 'LI', 'OL', 'P', 'PRE', 'S', 'SPAN', 'STRIKE', 'STRONG', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'U', 'UL']);
const allowedStyles = new Set([
  'background-color',
  'color',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'letter-spacing',
  'line-height',
  'list-style-type',
  'margin-left',
  'text-align',
  'text-decoration',
  'text-decoration-line',
  'vertical-align',
  'white-space',
]);
const safeUrl = (value, image = false) => {
  const url = String(value || '').trim();
  if (!url) return '';
  if (image) return /^https?:\/\//i.test(url) ? url : '';
  return /^(https?:\/\/|mailto:|tel:|#)/i.test(url) ? url : '';
};

export function sanitizeRichTextHtml(value) {
  const source = removeUnsafeMarkup(value);
  if (typeof DOMParser === 'undefined') return source;

  const parsed = new DOMParser().parseFromString(`<body>${source}</body>`, 'text/html');
  const elements = [...parsed.body.querySelectorAll('*')];
  for (const element of elements) {
    if (!allowedTags.has(element.tagName)) {
      element.replaceWith(...element.childNodes);
      continue;
    }

    const originalStyle = element.getAttribute('style') || '';
    const originalHref = element.getAttribute('href') || '';
    const originalSrc = element.getAttribute('src') || '';
    const originalAlt = element.getAttribute('alt') || '';
    const originalAlign = element.getAttribute('align') || '';
    const originalColor = element.getAttribute('color') || '';
    const originalFace = element.getAttribute('face') || '';
    const originalSize = element.getAttribute('size') || '';
    const originalStart = element.getAttribute('start') || '';
    const originalColspan = element.getAttribute('colspan') || '';
    const originalRowspan = element.getAttribute('rowspan') || '';
    for (const attribute of [...element.attributes]) element.removeAttribute(attribute.name);

    if (originalStyle) {
      const declarations = originalStyle.split(';').map((item) => item.split(':')).filter((item) => item.length >= 2);
      for (const [property, ...parts] of declarations) {
        const name = property.trim().toLowerCase();
        const cssValue = parts.join(':').trim();
        if (allowedStyles.has(name) && !/url\s*\(|expression\s*\(|behavior\s*:|-moz-binding/i.test(cssValue)) element.style.setProperty(name, cssValue);
      }
    }

    if (/^(left|center|right|justify)$/i.test(originalAlign)) element.setAttribute('align', originalAlign.toLowerCase());
    if (element.tagName === 'FONT') {
      if (/^#[0-9a-f]{3,8}$/i.test(originalColor)) element.setAttribute('color', originalColor);
      if (/^[1-7]$/.test(originalSize)) element.setAttribute('size', originalSize);
      if (/^[a-z0-9 ,'-]{1,80}$/i.test(originalFace)) element.setAttribute('face', originalFace);
    }
    if (element.tagName === 'OL' && /^\d{1,6}$/.test(originalStart)) element.setAttribute('start', originalStart);
    if (['TD', 'TH'].includes(element.tagName)) {
      if (/^\d{1,3}$/.test(originalColspan)) element.setAttribute('colspan', originalColspan);
      if (/^\d{1,3}$/.test(originalRowspan)) element.setAttribute('rowspan', originalRowspan);
    }

    if (element.tagName === 'A') {
      const href = safeUrl(originalHref);
      if (href) element.setAttribute('href', href);
      element.setAttribute('target', '_blank');
      element.setAttribute('rel', 'noopener noreferrer');
    }
    if (element.tagName === 'IMG') {
      const src = safeUrl(originalSrc, true);
      if (!src) { element.remove(); continue; }
      element.setAttribute('src', src);
      element.setAttribute('alt', originalAlt || 'Imagem do plano');
      element.setAttribute('loading', 'lazy');
    }
  }
  return parsed.body.innerHTML;
}
