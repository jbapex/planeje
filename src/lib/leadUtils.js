import { parse, isValid } from 'date-fns';

export const normalizePhoneNumber = (phone) => {
  if (!phone || typeof phone !== 'string') return '';
  let cleaned = phone.replace(/\D/g, '');
  cleaned = cleaned.replace(/^0+/, '');
  if (cleaned.length === 10 || cleaned.length === 11) cleaned = '55' + cleaned;
  if (cleaned.startsWith('550')) cleaned = '55' + cleaned.substring(3);
  return cleaned;
};

export const getPhoneVariations = (phone) => {
  const normalized = normalizePhoneNumber(phone);
  if (!normalized) return [];
  const variations = new Set([normalized]);
  if (normalized.startsWith('55') && normalized.length > 2) {
    variations.add(normalized.substring(2));
  }
  if (normalized.startsWith('55') && normalized.length === 12) {
    const ddd = normalized.substring(2, 4);
    const number = normalized.substring(4);
    variations.add(`55${ddd}9${number}`);
  }
  if (normalized.startsWith('55') && normalized.length === 13 && normalized.charAt(4) === '9') {
    const ddd = normalized.substring(2, 4);
    const number = normalized.substring(5);
    variations.add(`55${ddd}${number}`);
  }
  return Array.from(variations);
};

export const toTitleCase = (str) => {
  if (!str) return '';
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
};

export const parseDate = (dateString) => {
  if (!dateString) return null;
  const formats = [
    "yyyy-MM-dd'T'HH:mm:ss.SSSxxx",
    "yyyy-MM-dd'T'HH:mm:ssxxx",
    "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
    "yyyy-MM-dd'T'HH:mm:ss'Z'",
    'yyyy-MM-dd HH:mm:ss',
    'yyyy-MM-dd',
    'dd/MM/yyyy HH:mm:ss',
    'dd/MM/yyyy HH:mm',
    'dd/MM/yyyy',
  ];
  for (const format of formats) {
    try {
      const parsedDate = parse(dateString, format, new Date());
      if (isValid(parsedDate)) return parsedDate;
    } catch (_) {}
  }
  return null;
};
