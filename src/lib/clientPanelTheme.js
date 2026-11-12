export const CLIENT_PANEL_COLOR_EVENT = 'planeje:cliente-painel-cor';

export const CLIENT_PANEL_PRESETS = [
  { label: 'Azul (padrão)', value: null, swatch: '#1d4ed8' },
  { label: 'Verde', value: '#047857' },
  { label: 'Roxo', value: '#6d28d9' },
  { label: 'Rosa', value: '#be185d' },
  { label: 'Vermelho', value: '#b91c1c' },
  { label: 'Laranja', value: '#c2410c' },
  { label: 'Grafite', value: '#334155' },
  { label: 'Preto', value: '#111827' },
];

export const normalizeHex = (value) => {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null;
};

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const rgbToHex = (rgb) =>
  `#${rgb.map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('')}`;

const mix = (hex, target, amount) => {
  const a = hexToRgb(hex);
  const b = hexToRgb(target);
  return rgbToHex(a.map((c, i) => c + (b[i] - c) * amount));
};

const toHslTriplet = (hex) => {
  const [r, g, b] = hexToRgb(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
};

export const buildClientPanelGradient = (hex) => {
  const base = normalizeHex(hex);
  if (!base) return null;
  return `linear-gradient(145deg, ${mix(base, '#000000', 0.45)} 0%, ${base} 38%, ${mix(base, '#ffffff', 0.18)} 72%, ${mix(base, '#ffffff', 0.4)} 100%)`;
};

/** Variáveis CSS para sobrescrever o azul de `.planeje-cliente-app`; null mantém o padrão. */
export const buildClientPanelVars = (hex) => {
  const base = normalizeHex(hex);
  if (!base) return null;
  const [r, g, b] = hexToRgb(base);
  return {
    '--jb-client-tabs-bg': `rgba(${r}, ${g}, ${b}, 0.18)`,
    '--jb-client-tabs-ink': 'rgba(30, 41, 59, 0.86)',
    '--jb-client-tabs-hover': 'rgba(255, 255, 255, 0.6)',
    '--jb-client-tabs-active-ink': '#ffffff',
    '--jb-orange': base,
    '--jb-orange-light': mix(base, '#ffffff', 0.12),
    '--jb-pink': mix(base, '#ffffff', 0.45),
    '--jb-purple': mix(base, '#ffffff', 0.18),
    '--jb-purple-mid': mix(base, '#ffffff', 0.08),
    '--jb-purple-dark': mix(base, '#000000', 0.15),
    '--jb-purple-deeper': mix(base, '#000000', 0.3),
    '--jb-gradient': buildClientPanelGradient(base),
    '--jb-client-accent': base,
    '--jb-client-accent-light': mix(base, '#ffffff', 0.18),
    '--primary': toHslTriplet(mix(base, '#ffffff', 0.1)),
    '--ring': toHslTriplet(mix(base, '#ffffff', 0.1)),
  };
};

export const emitClientPanelColor = (hex) => {
  window.dispatchEvent(new CustomEvent(CLIENT_PANEL_COLOR_EVENT, { detail: { color: normalizeHex(hex) } }));
};

export const CLIENT_PANEL_LOGO_EVENT = 'planeje:cliente-painel-logo';

export const emitClientPanelLogo = (logoUrls) => {
  window.dispatchEvent(
    new CustomEvent(CLIENT_PANEL_LOGO_EVENT, { detail: { logoUrls: Array.isArray(logoUrls) ? logoUrls : [] } })
  );
};
