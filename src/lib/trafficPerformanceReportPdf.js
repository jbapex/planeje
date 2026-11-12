export function reportPdfFileName(clientName, period) {
  const who = String(clientName || 'cliente')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'cliente';
  const raw = String(period || '').trim();
  let when = 'periodo';
  if (/^\d{4}-\d{2}$/.test(raw)) when = raw;
  else if (/^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/.test(raw)) when = raw;
  else if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) when = raw;
  return `Relatorio-${who}-${when}.pdf`;
}

export function slidePdfFormat(width, height) {
  const pageWidth = Math.max(1, Math.round(Number(width) || 0));
  const pageHeight = Math.max(1, Math.round(Number(height) || 0));
  return {
    format: [pageWidth, pageHeight],
    orientation: pageWidth >= pageHeight ? 'landscape' : 'portrait',
  };
}

const TEXT_TAGS = new Set(['SPAN', 'STRONG', 'B', 'I', 'EM', 'SMALL', 'P', 'H1', 'H2', 'H3', 'H4']);
const MODERN_COLOR = /(?:color-mix|oklch|oklab|hwb|lch|lab|color)\(/i;

/** Troca color(), oklch(), color-mix() e afins por um rgb que o html2canvas entende. */
export function rewriteModernColorValue(value, convert) {
  if (typeof value !== 'string' || !MODERN_COLOR.test(value)) return value;
  return value.replace(
    /(?:color-mix|oklch|oklab|hwb|lch|lab|color)\((?:[^()]|\([^()]*\))*\)/gi,
    (fn) => {
      try {
        const next = convert(fn);
        return next || fn;
      } catch {
        return fn;
      }
    }
  );
}

function modernColorToRgb(value) {
  const canvas = modernColorToRgb.canvas || (modernColorToRgb.canvas = document.createElement('canvas'));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  canvas.width = 1;
  canvas.height = 1;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = '#000000';
  ctx.fillStyle = value;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  if (a >= 255) return `rgb(${r}, ${g}, ${b})`;
  const alpha = Math.round((a / 255) * 1000) / 1000;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const COLOR_PROPS = [
  'color',
  'background-color',
  'background-image',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'box-shadow',
  'text-decoration-color',
  'text-shadow',
  '-webkit-text-stroke-color',
];

const sanitizedCss = new Map();

function sanitizeCssText(text) {
  if (!text || !MODERN_COLOR.test(text)) return text;
  const hit = sanitizedCss.get(text);
  if (hit) return hit;
  const next = rewriteModernColorValue(text, modernColorToRgb);
  sanitizedCss.set(text, next);
  return next;
}

function sanitizeStyleSheets(doc) {
  const pending = [];
  for (const sheet of [...doc.styleSheets]) {
    let text = '';
    try {
      text = [...sheet.cssRules].map((rule) => rule.cssText).join('\n');
    } catch {
      continue;
    }
    const next = sanitizeCssText(text);
    if (next === text) continue;
    pending.push({ owner: sheet.ownerNode, text: next });
  }
  for (const item of pending) {
    if (item.owner) item.owner.disabled = true;
    const style = doc.createElement('style');
    style.textContent = item.text;
    (doc.head || doc.documentElement).appendChild(style);
  }
}

export function normalizeCloneColors(root) {
  const doc = root?.nodeType === 9 ? root : root?.ownerDocument;
  if (!doc) return;
  sanitizeStyleSheets(doc);
  const scope = root?.nodeType === 9 ? doc.body : root;
  const view = doc.defaultView;
  if (!scope?.querySelectorAll || !view) return;
  [scope, ...scope.querySelectorAll('*')].forEach((node) => {
    if (!node.style) return;
    const computed = view.getComputedStyle(node);
    for (const prop of COLOR_PROPS) {
      const value = computed.getPropertyValue(prop);
      if (!value || !MODERN_COLOR.test(value)) continue;
      node.style.setProperty(prop, rewriteModernColorValue(value, modernColorToRgb));
    }
  });
}

function waitForImages(root) {
  const images = [...root.querySelectorAll('img')];
  return Promise.all(images.map((img) => {
    if (img.complete && img.naturalWidth > 0) return null;
    return new Promise((resolve) => {
      const done = () => resolve();
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    });
  }));
}

function pinBoxes(root) {
  const nodes = [root, ...root.querySelectorAll('*')].filter((node) => !TEXT_TAGS.has(node.tagName));
  const saved = nodes.map((node) => node.getAttribute('style'));
  const boxes = nodes.map((node) => node.getBoundingClientRect());
  nodes.forEach((node, index) => {
    const box = boxes[index];
    if (box.width < 1 && box.height < 1) return;
    node.style.boxSizing = 'border-box';
    node.style.width = `${box.width}px`;
    node.style.height = `${box.height}px`;
    node.style.maxWidth = 'none';
    node.style.minWidth = '0px';
    node.style.maxHeight = 'none';
    node.style.minHeight = '0px';
    node.style.flex = 'none';
    node.style.aspectRatio = 'auto';
  });
  return () => {
    nodes.forEach((node, index) => {
      if (saved[index] == null) node.removeAttribute('style');
      else node.setAttribute('style', saved[index]);
    });
  };
}

function coverDataUrl(img) {
  const box = img.getBoundingClientRect();
  const width = Math.max(1, Math.round(box.width));
  const height = Math.max(1, Math.round(box.height));
  const naturalWidth = img.naturalWidth;
  const naturalHeight = img.naturalHeight;
  if (!naturalWidth || !naturalHeight) return '';
  const canvas = document.createElement('canvas');
  canvas.width = width * 2;
  canvas.height = height * 2;
  const context = canvas.getContext('2d');
  const scale = Math.max(width / naturalWidth, height / naturalHeight);
  const drawWidth = naturalWidth * scale;
  const drawHeight = naturalHeight * scale;
  context.setTransform(2, 0, 0, 2, 0, 0);
  try {
    context.drawImage(img, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
    return canvas.toDataURL('image/jpeg', 0.95);
  } catch {
    return '';
  }
}

function bakeCoverImages(root) {
  const images = [...root.querySelectorAll('img')].filter((img) => getComputedStyle(img).objectFit === 'cover');
  const saved = images.map((img) => img.getAttribute('src'));
  images.forEach((img) => {
    const data = coverDataUrl(img);
    if (data) img.setAttribute('src', data);
  });
  return () => {
    images.forEach((img, index) => {
      if (saved[index] == null) img.removeAttribute('src');
      else img.setAttribute('src', saved[index]);
    });
  };
}

async function snapshotSlide(slide, html2canvas) {
  const rect = slide.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const restoreBoxes = pinBoxes(slide);
  const restoreImages = bakeCoverImages(slide);
  try {
    const dark = slide.classList.contains('tr-slide-dark') || slide.classList.contains('tr-slide-end');
    const canvas = await html2canvas(slide, {
      scale: 2,
      useCORS: true,
      backgroundColor: dark ? '#111111' : '#ffffff',
      width,
      height,
      windowWidth: document.documentElement.clientWidth,
      windowHeight: document.documentElement.clientHeight,
      logging: false,
      onclone: (doc) => normalizeCloneColors(doc),
    });
    return { canvas, width, height };
  } finally {
    restoreImages();
    restoreBoxes();
  }
}

async function renderReportPdf(deck) {
  const slides = [...deck.querySelectorAll('.tr-slide:not([data-pdf-skip])')];
  if (!slides.length) throw new Error('Monte o relatório antes de baixar o PDF.');

  const [canvasModule, pdfModule] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);
  const html2canvas = canvasModule.default;
  const jsPDF = pdfModule.jsPDF || pdfModule.default;

  let pdf = null;
  for (let index = 0; index < slides.length; index += 1) {
    const slide = slides[index];
    slide.scrollIntoView({ block: 'center', inline: 'nearest' });
    await waitForImages(slide);
    await new Promise((resolve) => setTimeout(resolve, 40));
    let shot;
    try {
      shot = await snapshotSlide(slide, html2canvas);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`Não foi possível gerar a página ${index + 1} do PDF. ${detail}`);
    }
    const page = slidePdfFormat(shot.width, shot.height);
    if (!pdf) {
      pdf = new jsPDF({ unit: 'px', format: page.format, orientation: page.orientation, hotfixes: ['px_scaling'] });
    } else {
      pdf.addPage(page.format, page.orientation);
    }
    pdf.addImage(shot.canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, page.format[0], page.format[1]);
  }

  return pdf;
}

export async function downloadReportPdf(deck, { clientName, month } = {}) {
  (await renderReportPdf(deck)).save(reportPdfFileName(clientName, month));
}

export async function buildReportPdfBlob(deck) {
  return (await renderReportPdf(deck)).output('blob');
}
