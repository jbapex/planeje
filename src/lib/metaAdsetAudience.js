const GENDER_LABEL = { 1: 'homens', 2: 'mulheres' };

function asTargeting(targeting) {
  if (!targeting) return null;
  if (typeof targeting === 'string') {
    const text = targeting.trim();
    if (!text.startsWith('{')) return null;
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
  return typeof targeting === 'object' ? targeting : null;
}

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function cleanName(value) {
  return String(value || '')
    .replace(/\s*\(state\)\s*$/i, '')
    .trim();
}

function radiusSuffix(item) {
  const radius = finite(item?.radius);
  if (!radius || radius <= 0) return '';
  const unit = String(item.distance_unit || '').toLowerCase().startsWith('mile') ? 'mi' : 'km';
  return ` ${radius} ${unit}`;
}

function placeLabel(item) {
  if (!item) return '';
  if (typeof item === 'string') return cleanName(item);
  const name = cleanName(
    item.name || item.address_string || item.primary_city || item.key || ''
  );
  const radius = radiusSuffix(item);
  if (name) return `${name}${radius}`;
  if (radius) return `raio${radius}`;
  return '';
}

function labelsOf(list) {
  if (!Array.isArray(list)) return [];
  return list.map(placeLabel).map((s) => String(s).trim()).filter(Boolean);
}

function joinParts(items, max) {
  const unique = [...new Set(items)];
  if (!unique.length) return '';
  if (!max || unique.length <= max) return unique.join(', ');
  return `${unique.slice(0, max).join(', ')} +${unique.length - max}`;
}

function agePart(targeting, full) {
  const range = Array.isArray(targeting.age_range) ? targeting.age_range : null;
  const rangeMin = range && range.length >= 2 ? finite(range[0]) : null;
  const rangeMax = range && range.length >= 2 ? finite(range[1]) : null;
  const hardMin = finite(targeting.age_min);
  const hardMax = finite(targeting.age_max);
  const min = rangeMin ?? hardMin;
  const max = rangeMax ?? hardMax;
  if (min == null && max == null) return '';
  const shownMin = min ?? 18;
  const shownMax = max ?? '65+';
  let label = `${shownMin}–${shownMax} anos`;
  const opensYounger = rangeMin != null && hardMin != null && hardMin < rangeMin;
  const opensOlder = rangeMax != null && hardMax != null && hardMax > rangeMax;
  if (full && (opensYounger || opensOlder)) {
    label += ` (Advantage+ entrega de ${hardMin ?? shownMin} a ${hardMax ?? shownMax})`;
  }
  return label;
}

function genderPart(targeting) {
  const genders = Array.isArray(targeting.genders) ? targeting.genders : [];
  const labels = genders.map((g) => GENDER_LABEL[Number(g)]).filter(Boolean);
  if (!labels.length || labels.length >= 3) return '';
  return [...new Set(labels)].join(', ');
}

function interestNames(targeting) {
  const names = [];
  for (const spec of targeting.flexible_spec || []) {
    if (!spec || typeof spec !== 'object') continue;
    names.push(
      ...labelsOf(spec.interests),
      ...labelsOf(spec.behaviors),
      ...labelsOf(spec.life_events),
      ...labelsOf(spec.family_statuses)
    );
  }
  return names;
}

function placeNames(targeting) {
  const geo = targeting.geo_locations || {};
  return [
    ...labelsOf(geo.regions),
    ...labelsOf(geo.neighborhoods),
    ...labelsOf(geo.cities),
    ...labelsOf(geo.custom_locations),
    ...labelsOf(geo.countries),
    ...labelsOf(geo.zips),
  ];
}

function exclusionPart(targeting) {
  const geo = targeting.excluded_geo_locations || {};
  const names = [
    ...labelsOf(geo.regions),
    ...labelsOf(geo.neighborhoods),
    ...labelsOf(geo.cities),
    ...labelsOf(geo.custom_locations),
    ...labelsOf(geo.countries),
    ...labelsOf(targeting.excluded_custom_audiences),
  ];
  const line = joinParts(names, 0);
  return line ? `exceto ${line}` : '';
}

function describe(targeting, { full }) {
  const spec = asTargeting(targeting);
  if (!spec) return '';
  const parts = [
    agePart(spec, full),
    genderPart(spec),
    joinParts(labelsOf(spec.custom_audiences), full ? 0 : 2),
    joinParts(interestNames(spec), full ? 0 : 2),
    joinParts(placeNames(spec), full ? 0 : 4),
  ];
  if (full) parts.push(exclusionPart(spec));
  return parts.filter(Boolean).join(' · ');
}

export function formatAdsetAudience(targeting) {
  return describe(targeting, { full: false });
}

export function formatAdsetAudienceFull(targeting) {
  return describe(targeting, { full: true }) || 'Aberto / não informado';
}
