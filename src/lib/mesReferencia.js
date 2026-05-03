/**
 * Converte mes_referencia para Date no calendário local.
 * Valores só com YYYY-MM-DD (ex.: coluna `date` no Postgres) não passam por
 * `new Date('YYYY-MM-DD')`, que no JS é meia-noite UTC e pode cair no mês anterior
 * em fusos como America/Sao_Paulo.
 */
export function parseMesReferenciaLocal(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const y = Number(s.slice(0, 4));
    const mo = Number(s.slice(5, 7)) - 1;
    const day = Number(s.slice(8, 10));
    const d = new Date(y, mo, day);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
