/** Eventos padrão exibidos no nó Pixel Meta. */
export const DEFAULT_PIXEL_EVENTS = [
  { key: 'PageView', label: 'PageView' },
  { key: 'ViewContent', label: 'ViewContent' },
  { key: 'Lead', label: 'Lead' },
  { key: 'Contact', label: 'Contact' },
  { key: 'InitiateCheckout', label: 'InitiateCheckout' },
  { key: 'Purchase', label: 'Purchase' },
  { key: 'CompleteRegistration', label: 'CompleteRegistration' },
];

export function mergePixelEvents(apiEvents = [], logEvents = []) {
  const byKey = new Map();
  for (const def of DEFAULT_PIXEL_EVENTS) {
    byKey.set(def.key, {
      key: def.key,
      label: def.label,
      status: 'unknown',
      lastFiredAt: null,
      source: null,
    });
  }
  for (const ev of apiEvents) {
    const key = ev.key || ev.event_name;
    if (!key) continue;
    const prev = byKey.get(key) || { key, label: key, status: 'unknown', lastFiredAt: null };
    byKey.set(key, {
      ...prev,
      label: ev.label || key,
      status: ev.status || 'active',
      lastFiredAt: ev.lastFiredAt || prev.lastFiredAt,
      source: ev.source || 'meta',
    });
  }
  for (const ev of logEvents) {
    const key = mapLogEventToPixelKey(ev.event_name);
    if (!key || !byKey.has(key)) continue;
    const prev = byKey.get(key);
    byKey.set(key, {
      ...prev,
      status: ev.success ? 'active' : prev.status,
      lastFiredAt: ev.lastFiredAt || prev.lastFiredAt,
      source: 'planeje_capi',
    });
  }
  return Array.from(byKey.values());
}

function mapLogEventToPixelKey(eventName) {
  if (!eventName) return null;
  const n = String(eventName);
  if (n === 'QualifiedLead' || n === 'Lead') return 'Lead';
  if (n === 'Purchase') return 'Purchase';
  if (n === 'Contact') return 'Contact';
  return null;
}

export function formatPixelMetaBadge(pixelMeta) {
  if (!pixelMeta?.pixelId) return null;
  const parts = [];
  const events = pixelMeta.events || [];
  const lead = events.find((e) => e.key === 'Lead' && e.status === 'active');
  if (lead) parts.push('Lead ✓');
  const count = (pixelMeta.customAudiences || []).length;
  if (count > 0) parts.push(`${count} público${count > 1 ? 's' : ''}`);
  if (parts.length === 0 && pixelMeta.pixelName) return pixelMeta.pixelName.slice(0, 18);
  return parts.join(' · ');
}
