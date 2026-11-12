export function escapeContatosCsvValue(value) {
  const text = String(value ?? '');
  // Keep external text literal when spreadsheets interpret CSV cells as formulas.
  return (/^\s*[=+@-]/.test(text) ? `'${text}` : text).replace(/"/g, '""');
}
