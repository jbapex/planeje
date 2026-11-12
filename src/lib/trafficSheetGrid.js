import { CAMPAIGN_NUMBERS, campaignDraft, hasCampaignContent } from './trafficWeeklyReview.js';
import { buildSheetColumns } from './trafficSheetLayout.js';

export const DEFAULT_SHEET_METRICS = ['spend', 'messages', 'appointments', 'conversions', 'daily_budget', 'target_message_cost'];
export const SHEET_COLUMNS = buildSheetColumns(DEFAULT_SHEET_METRICS, 'Lead').map((column) => column.role === 'calc' ? null : column.key);
export const hasSheetContent = hasCampaignContent;
export const filledSheetRows = (rows = []) => rows.filter(hasCampaignContent);

export function sheetCellTarget(row, column, key, shift, rowCount, contextOnly = false, columns = buildSheetColumns(DEFAULT_SHEET_METRICS, 'Lead', contextOnly)) {
  const layout = columns.length && columns[0]?.key ? columns : buildSheetColumns(DEFAULT_SHEET_METRICS, 'Lead', contextOnly);
  const nav = layout.filter((item) => item.role !== 'calc').map((item) => item.index);
  const current = nav.indexOf(column);
  if (current < 0) return null;
  let nextRow = row; let nextColumn = current;
  if (key === 'Tab') {
    nextColumn += shift ? -1 : 1;
    if (nextColumn < 0) { nextRow--; nextColumn = nav.length - 1; }
    if (nextColumn >= nav.length) { nextRow++; nextColumn = 0; }
  } else if (key === 'Enter') nextRow += shift ? -1 : 1;
  else if (key === 'ArrowDown') nextRow++;
  else if (key === 'ArrowUp') nextRow--;
  else if (key === 'ArrowRight') nextColumn++;
  else if (key === 'ArrowLeft') nextColumn--;
  else return null;
  if (nextRow < 0 || nextRow >= rowCount || nextColumn < 0 || nextColumn >= nav.length) return null;
  return { row: nextRow, column: nav[nextColumn] };
}
export function padSheetRows(rows = [], account = {}) {
  const padded = [...rows];
  const desired = Math.min(50, Math.max(6, filledSheetRows(rows).length + 1, rows.length));
  while (padded.length < desired) padded.push(campaignDraft(account));
  if (padded.length < 50 && hasSheetContent(padded.at(-1))) padded.push(campaignDraft(account));
  return padded;
}
export function sheetInitialRows(review, previous, account = {}) {
  const source = review.campaign_metrics?.length ? review.campaign_metrics : !review.revision && previous?.metric_mode === 'campaign' ? previous.campaign_metrics : [];
  const reuse = !review.campaign_metrics?.length;
  return padSheetRows(source.map((row) => campaignDraft(reuse ? { ...row, ...Object.fromEntries(CAMPAIGN_NUMBERS.map((key) => [key, null])) } : row)), account);
}

export function parseSheetClipboard(text) {
  const rows = []; let row = []; let cell = ''; let quoted = false;
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else if (quoted || cell === '') quoted = !quoted;
      else cell += c;
    } else if (!quoted && (c === '\t' || c === '\n')) {
      row.push(cell); cell = '';
      if (c === '\n') { rows.push(row); row = []; }
    } else cell += c;
  }
  row.push(cell); rows.push(row);
  while (rows.length && rows.at(-1).every((cell) => !cell.trim())) rows.pop();
  return rows;
}
const normalize = (text) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
const HEADERS = {
  campanha:'campaign_name', nomedacampanha:'campaign_name', conjunto:'adset_name', adset:'adset_name', conjuntodeanuncios:'adset_name',
  gasto:'spend', gastor:'spend', gastors:'spend', custo:'spend', investimento:'spend', valorusado:'spend', mensagens:'messages',
  agendamentos:'appointments', conversoes:'conversions', conversaocontada:'conversion_label', tipodeconversao:'conversion_label',
  orcdiario:'daily_budget', orcamentodiario:'daily_budget', orcamdia:'daily_budget', custoconversao:null, customensagem:null, custoagendamento:null,
  custoideal:'target_message_cost', metar:'target_message_cost', valorconversao:'conversion_value', valordasconversoes:'conversion_value', cpcmedio:'cpc', ligacao:'calls', ligacoes:'calls',
  simulacoes:'simulacoes', simulacao:'simulacoes', cpfbom:'cpf_bom', compras:'compras', comprasnossite:'compras',
  orcamentos:'orcamentos', orcamento:'orcamentos', leadqualificado:'lead_qualificado', leadsqualificados:'lead_qualificado',
};
export function pasteSheetCells(rows, text, startRow, startColumn, account = {}, columns = buildSheetColumns(DEFAULT_SHEET_METRICS, 'Lead')) {
  const matrix = parseSheetClipboard(text);
  if (!matrix.length) return rows;
  const headers = matrix[0].map((cell) => HEADERS[normalize(cell)]);
  const named = headers.includes('campaign_name');
  const keys = columns.map((column) => column.role === 'calc' ? null : column.key);
  const cells = named ? matrix.slice(1) : matrix;
  if (startRow + cells.length > 50) throw new Error('Cole até 50 linhas por semana.');
  const next = rows.map((row) => ({ ...row }));
  cells.forEach((values, offset) => {
    const index = startRow + offset;
    while (next.length <= index) next.push(campaignDraft(account));
    values.forEach((value, col) => {
      const key = named ? headers[col] : keys[startColumn + col];
      if (!key) return;
      next[index][key] = CAMPAIGN_NUMBERS.includes(key) ? value.trim().replace(/^R\$\s*/, '') : value.trim();
    });
  });
  return padSheetRows(next, account);
}
