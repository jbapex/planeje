import { useEffect, useMemo, useRef, useState } from 'react';
import { campaignDraft, campaignTotals, costFor, currency } from '@/lib/trafficWeeklyReview';
import { filledSheetRows, padSheetRows, pasteSheetCells, sheetCellTarget } from '@/lib/trafficSheetGrid';
import {
  adsetCatalogForRow,
  applyAdsetPick,
  applyCampaignPick,
  attachCatalogIds,
  catalogAccountKey,
  catalogsChanged,
  campaignForRow,
  matchName,
  rankSuggestions,
} from '@/lib/trafficSheetCatalog';
import { emptyCatalogState, loadCampaignCatalog } from '@/lib/trafficSheetCatalogClient';
import {
  applyConversionLabel,
  buildSheetColumns,
  normalizeSheetMetrics,
  reorderSheetMetrics,
  sheetMetricOptions,
} from '@/lib/trafficSheetLayout';
import {
  applyColumnWidth,
  columnWidth,
  resetColumnWidth,
  sheetTableWidth,
} from '@/lib/trafficSheetColumnWidth';
import {
  applyWeekSpendToRows,
  fetchMetaWeekAdsetSpend,
  spendPullMessage,
  weekSpendRange,
} from '@/lib/trafficSheetMetaSpend';
import { displayDate } from '@/lib/trafficWeeklyReview';
import TrafficSheetNameCell from './TrafficSheetNameCell';

const WIDTH_STORAGE = 'planeje.trafficSheet.columnWidths';
function readStoredWidths() {
  try {
    const raw = JSON.parse(localStorage.getItem(WIDTH_STORAGE) || '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Number(value)]).filter(([, value]) => Number.isFinite(value)));
  } catch { return {}; }
}
function writeStoredWidths(widths) {
  try { localStorage.setItem(WIDTH_STORAGE, JSON.stringify(widths)); } catch { /* ignore quota */ }
}

export default function TrafficCampaignMetrics({
  rows,
  accounts = [],
  readonly,
  onChange,
  contextOnly = false,
  resultLabel = '',
  sheetMetrics,
  onSheetMetricsChange,
  canConfigure = false,
  weekStart = '',
  source,
  onInspectLeads,
}) {
  const metrics = useMemo(() => normalizeSheetMetrics(sheetMetrics, resultLabel), [sheetMetrics, resultLabel]);
  const columns = useMemo(() => buildSheetColumns(metrics, resultLabel, contextOnly), [metrics, resultLabel, contextOnly]);
  const [defaultAccount, setDefaultAccount] = useState(() => {
    const r = rows.find((row) => row.account_id);
    const a = accounts.length === 1 ? accounts[0] : null;
    return r ? { platform:r.platform, account_link_id:r.account_link_id, account_id:r.account_id, account_name:r.account_name } : a ? { platform:a.platform, account_link_id:a.id, account_id:a.account_id, account_name:a.account_name || a.account_id } : { platform:'meta', account_link_id:'', account_id:'', account_name:'' };
  });
  const [pasteError, setPasteError] = useState('');
  const [catalogs, setCatalogs] = useState({});
  const [showColumns, setShowColumns] = useState(false);
  const [widths, setWidths] = useState(readStoredWidths);
  const [spendBusy, setSpendBusy] = useState(false);
  const [spendNote, setSpendNote] = useState('');
  const [spendIndex, setSpendIndex] = useState(null);
  const [selected, setSelected] = useState([]);
  const weekRange = useMemo(() => weekSpendRange(weekStart), [weekStart]);
  const drag = useRef(null);
  const orderDrag = useRef(null);
  const accountDefaults = { ...defaultAccount, conversion_label: resultLabel };
  const widthOf = (key) => columnWidth(widths, key);
  const persistWidths = (next) => { writeStoredWidths(next); return next; };
  const startResize = (event, key) => {
    if (event.button != null && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    drag.current = { key, startX: event.clientX, startWidth: widthOf(key) };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    document.body.classList.add('tw-sheet-resizing');
  };
  const moveResize = (event) => {
    if (!drag.current) return;
    const { key, startX, startWidth } = drag.current;
    setWidths((current) => applyColumnWidth(current, key, startWidth + event.clientX - startX));
  };
  const endResize = () => {
    if (!drag.current) return;
    drag.current = null;
    document.body.classList.remove('tw-sheet-resizing');
    setWidths((current) => persistWidths(current));
  };
  const canReorder = canConfigure && !readonly && !contextOnly && typeof onSheetMetricsChange === 'function';
  const metricIdOf = (column) => (column?.role === 'calc' ? column.of : column?.role === 'input' ? column.key : '');
  const clearOrderMark = () => document.querySelectorAll('.tw-sheet-order-target').forEach((node) => node.classList.remove('tw-sheet-order-target'));
  const startOrder = (event, column) => {
    const id = metricIdOf(column);
    if (!canReorder || !id || (event.button != null && event.button !== 0)) return;
    orderDrag.current = { id, x: event.clientX, moved: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const moveOrder = (event) => {
    const current = orderDrag.current;
    if (!current) return;
    if (!current.moved && Math.abs(event.clientX - current.x) < 6) return;
    current.moved = true;
    document.body.classList.add('tw-sheet-reordering');
    const table = event.currentTarget.closest('table');
    let target = '';
    table?.querySelectorAll('[data-sheet-metric]').forEach((node) => {
      const rect = node.getBoundingClientRect();
      if (event.clientX >= rect.left && event.clientX <= rect.right) target = node.getAttribute('data-sheet-metric') || '';
    });
    current.target = target && target !== current.id ? target : '';
    clearOrderMark();
    if (current.target) table?.querySelectorAll(`[data-sheet-metric="${current.target}"]`).forEach((node) => node.classList.add('tw-sheet-order-target'));
  };
  const endOrder = (event) => {
    const current = orderDrag.current;
    orderDrag.current = null;
    clearOrderMark();
    document.body.classList.remove('tw-sheet-reordering');
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!current?.moved || !current.target) return;
    onSheetMetricsChange(reorderSheetMetrics(metrics, resultLabel, current.id, current.target));
  };
  const nudgeOrder = (event, column) => {
    const id = metricIdOf(column);
    if (!canReorder || !id || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    event.preventDefault();
    const index = metrics.indexOf(id);
    const next = metrics[index + (event.key === 'ArrowRight' ? 1 : -1)];
    if (next) onSheetMetricsChange(reorderSheetMetrics(metrics, resultLabel, id, next));
  };
  const stepResize = (event, key) => {
    if (event.key === 'Home') { event.preventDefault(); setWidths((current) => persistWidths(resetColumnWidth(current, key))); return; }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const delta = event.key === 'ArrowRight' ? 16 : -16;
    setWidths((current) => persistWidths(applyColumnWidth(current, key, columnWidth(current, key) + delta)));
  };

  const catalogKeys = useMemo(() => {
    const keys = [];
    const seen = new Set();
    const add = (platform, accountId) => {
      const source = platform === 'google' ? 'google' : (platform && platform !== 'meta' ? '' : 'meta');
      if (!source) return;
      const key = catalogAccountKey(accountId, source);
      if (!key || seen.has(key)) return;
      seen.add(key);
      keys.push({ key, accountId, platform: source });
    };
    add(defaultAccount.platform, defaultAccount.account_id);
    rows.forEach((row) => add(row.platform, row.account_id));
    return keys;
  }, [defaultAccount.account_id, defaultAccount.platform, rows]);

  useEffect(() => () => document.body.classList.remove('tw-sheet-resizing'), []);
  useEffect(() => {
    if (readonly) return undefined;
    let cancelled = false;
    catalogKeys.forEach(({ key, accountId, platform }) => {
      setCatalogs((current) => current[key] ? current : { ...current, [key]: emptyCatalogState('loading') });
      (source?.loadCatalog || loadCampaignCatalog)(accountId, platform).then((value) => {
        if (!cancelled) setCatalogs((current) => ({ ...current, [key]: value }));
      }).catch(() => {
        if (!cancelled) setCatalogs((current) => ({ ...current, [key]: emptyCatalogState('error', 'Não foi possível consultar as campanhas.') }));
      });
    });
    return () => { cancelled = true; };
  }, [catalogKeys.map((item) => item.key).join('|'), readonly, source]);

  const catalogFor = (row = defaultAccount) => catalogs[catalogAccountKey(row.account_id, row.platform === 'google' ? 'google' : 'meta')] || emptyCatalogState();

  useEffect(() => {
    if (readonly || source?.linkOnRead === false) return;
    const labeled = applyConversionLabel(rows, resultLabel);
    const next = labeled.map((row) => {
      const catalog = catalogFor(row).campaigns;
      return catalog.length ? attachCatalogIds([row], catalog)[0] : row;
    });
    if (catalogsChanged(rows, next) || labeled.some((row, i) => row.conversion_label !== rows[i].conversion_label)) onChange(next);
  }, [catalogs, readonly, resultLabel, source]);

  const commit = (nextRows) => onChange(padSheetRows(applyConversionLabel(nextRows, resultLabel), accountDefaults));
  const update = (index, patch) => {
    const current = rows[index];
    const merged = { ...current, ...(!current.account_id ? defaultAccount : {}), ...(!current.conversion_label ? { conversion_label: resultLabel } : {}), ...patch };
    const catalog = catalogFor(merged).campaigns;
    const resolve = source?.linkOnRead !== false || Object.hasOwn(patch, 'campaign_name') || Object.hasOwn(patch, 'adset_name');
    commit(rows.map((row, i) => i === index ? (catalog.length && resolve ? attachCatalogIds([merged], catalog)[0] : merged) : row));
  };
  const applyAccount = (patch) => {
    const next = { ...defaultAccount, ...patch }; setDefaultAccount(next);
    onChange(rows.map((row) => !row.account_id || (row.account_id === defaultAccount.account_id && row.platform === defaultAccount.platform) ? { ...row, ...next } : row));
  };
  const fromAccount = (id) => {
    const a = accounts.find((account) => account.id === id);
    return a ? { platform:a.platform, account_link_id:a.id, account_id:a.account_id, account_name:a.account_name || a.account_id } : { platform:'meta', account_link_id:'', account_id:'', account_name:'' };
  };
  const paste = (event, index, column) => {
    if (!event.currentTarget.closest('table')) return;
    const content = event.clipboardData.getData('text/plain');
    if (!/[\t\n\r]/.test(content)) return;
    event.preventDefault();
    try {
      const pasted = pasteSheetCells(rows, content, index, column, accountDefaults, columns);
      const next = applyConversionLabel(pasted, resultLabel).map((row, rowIndex) => {
        const catalog = catalogFor(row).campaigns;
        if (source?.linkOnRead === false && rows[rowIndex]?.campaign_name === row.campaign_name && rows[rowIndex]?.adset_name === row.adset_name) return row;
        return catalog.length ? attachCatalogIds([row], catalog)[0] : row;
      });
      onChange(next);
      setPasteError('');
    }
    catch (error) { setPasteError(error.message); }
  };
  const navigate = (event, row, column) => {
    const input = event.currentTarget; const table = input.closest('table');
    if (!table || event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      if (event.shiftKey || input.selectionStart !== input.selectionEnd) return;
      if (event.key === 'ArrowLeft' && input.selectionStart !== 0) return;
      if (event.key === 'ArrowRight' && input.selectionEnd !== input.value.length) return;
    }
    const target = sheetCellTarget(row, column, event.key, event.shiftKey, rows.length, contextOnly, columns);
    if (!target) { if (event.key === 'Enter') event.preventDefault(); return; }
    const next = table.querySelector(`[data-sheet-row="${target.row}"][data-sheet-column="${target.column}"]`);
    if (!next) return;
    event.preventDefault(); next.focus(); next.select();
  };
  const text = (r, i, key, label, column, numeric = false) => readonly ? <span>{r[key] === '' || r[key] == null ? '—' : r[key]}</span> : <input aria-label={`${label}, linha ${i + 1}`} className={numeric ? 'tw-sheet-number' : undefined} data-sheet-row={i} data-sheet-column={column} value={r[key] ?? ''} maxLength={numeric ? 30 : 200} inputMode={numeric ? 'decimal' : undefined} autoComplete="off" spellCheck={false} onChange={(e) => update(i, { [key]:e.target.value })} onPaste={(e) => paste(e, i, column)} onKeyDown={(e) => navigate(e,i,column)} />;
  const pickCampaign = (index, campaign) => update(index, applyCampaignPick(rows[index], campaign));
  const pickAdset = (index, adset) => {
    const catalog = catalogFor(rows[index]).campaigns;
    const campaign = catalog.find((item) => item.id === adset.campaign_id) || campaignForRow(rows[index], catalog);
    update(index, applyAdsetPick(rows[index], adset, campaign));
  };
  const nameCell = (row, index, key, column) => {
    const catalog = catalogFor(row).campaigns;
    const campaignItems = key === 'campaign_name' ? catalog : adsetCatalogForRow(row, catalog);
    const match = matchName(row[key], campaignItems);
    const suggestions = rankSuggestions(row[key], campaignItems);
    return <TrafficSheetNameCell
      value={row[key]}
      label={key === 'campaign_name' ? 'Campanha' : 'Conjunto'}
      rowIndex={index}
      column={column}
      suggestions={suggestions}
      matchStatus={match.status}
      readonly={readonly}
      onChange={(value) => update(index, { [key]: value })}
      onPick={(item) => key === 'campaign_name' ? pickCampaign(index, item) : pickAdset(index, item)}
      onPaste={(event) => paste(event, index, column)}
      onNavigate={(event) => navigate(event, index, column)}
    />;
  };
  const toggleMetric = (id) => {
    if (id === 'spend' || !onSheetMetricsChange) return;
    const next = metrics.includes(id) ? metrics.filter((item) => item !== id) : [...metrics, id];
    onSheetMetricsChange(normalizeSheetMetrics(next.length ? next : ['spend'], resultLabel));
  };
  const canPullSpend = !readonly && !contextOnly && weekRange && (defaultAccount.platform || 'meta') === 'meta' && defaultAccount.account_id && source?.canPullSpend !== false;
  const pullMetaSpend = async ({ overwrite = false, reuse = false } = {}) => {
    if (!canPullSpend || spendBusy) return;
    setSpendBusy(true);
    setSpendNote('');
    try {
      const catalog = catalogFor(defaultAccount).campaigns;
      const resolved = catalog.length && source?.linkOnRead !== false ? attachCatalogIds(rows, catalog) : rows;
      const withAccount = resolved.map((row) => (!row.account_id ? { ...row, ...defaultAccount } : row));
      const targets = withAccount.filter((row) => String(row.campaign_name || row.campaign_id || row.adset_name || row.adset_id || '').trim());
      if (!targets.length) {
        setSpendNote('Informe a campanha e o conjunto (ou só a campanha para puxar os conjuntos dela).');
        return;
      }
      if (!targets.some((row) => String(row.campaign_id || '').trim())) {
        setSpendNote('Escolha a campanha na lista (nome igual ao da Meta) para achar os conjuntos e o gasto.');
        return;
      }
      const index = reuse && spendIndex
        ? spendIndex
        : await (source?.loadSpend || fetchMetaWeekAdsetSpend)(withAccount, { since: weekRange.since, until: weekRange.until });
      if (!reuse) setSpendIndex(index);
      const result = applyWeekSpendToRows(withAccount, index, { overwrite, matchById: source?.linkOnRead === false });
      commit(result.rows);
      const period = `${displayDate(weekRange.since)} a ${displayDate(weekRange.until)}`;
      setSpendNote(spendPullMessage(result, period));
    } catch (error) {
      setSpendNote(error.message || 'Não foi possível puxar o gasto da Meta.');
    } finally {
      setSpendBusy(false);
    }
  };
  const calculated = (row, column) => (column.of ? costFor(row.spend, row[column.of]) : null);
  const filled = filledSheetRows(rows); const totals = campaignTotals(filled);
  const selectedRows = filled.filter((row) => selected.includes(row.id));
  const allSelected = filled.length > 0 && selectedRows.length === filled.length;
  const money = (value) => value == null ? '—' : currency(value);
  const totalFor = (column) => {
    if (column.key === 'spend') return money(totals.spend);
    if (column.key === 'conversion_value') return money(totals.conversion_value);
    if (column.of) return money(costFor(totals.spend, totals[column.of]));
    if (column.key && totals[column.key] != null) {
      return column.numeric && ['spend', 'conversion_value', 'daily_budget', 'target_message_cost', 'cpc'].includes(column.key)
        ? money(totals[column.key])
        : totals[column.key];
    }
    return '';
  };
  const primaryCatalog = catalogFor(defaultAccount);
  const catalogSource = defaultAccount.platform === 'google' ? 'google' : (defaultAccount.platform && defaultAccount.platform !== 'meta' ? '' : 'meta');
  const catalogHint = (() => {
    if (!catalogSource) return 'Cole da planilha · Tab ou Enter para avançar';
    if (catalogSource === 'google') {
      if (primaryCatalog.status === 'loading') return 'Buscando campanhas desta conta no Google Ads…';
      if (primaryCatalog.status === 'error') return primaryCatalog.error || 'Não foi possível listar as campanhas do Google Ads.';
      if (primaryCatalog.status === 'ok') return `${primaryCatalog.campaigns.length} campanha(s) do Google Ads · digite ou escolha o nome`;
      return 'Cole da planilha · Tab ou Enter para avançar';
    }
    if (primaryCatalog.status === 'loading') return 'Buscando campanhas desta conta na Meta…';
    if (primaryCatalog.status === 'no-token') return null;
    if (primaryCatalog.status === 'error') return primaryCatalog.error || 'Não foi possível listar as campanhas da Meta.';
    if (primaryCatalog.status === 'ok') return `${primaryCatalog.campaigns.length} campanha(s) da Meta · digite ou escolha o nome`;
    return 'Cole da planilha · Tab ou Enter para avançar';
  })();
  const cellClass = (column) => {
    if (column.key === 'campaign_name') return 'tw-sheet-campaign';
    if (column.key === 'adset_name') return 'tw-sheet-adset';
    return undefined;
  };
  return <div className="tw-sheet">
    {!readonly && <div className="tw-sheet-tools"><label>Conta<select aria-label="Conta de anúncios da tabela" value={defaultAccount.account_link_id || ''} onChange={(e) => applyAccount(fromAccount(e.target.value))}><option value="">Informar conta</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.platform === 'google' ? 'Google' : 'Meta'} · {a.account_name || a.account_id}</option>)}{defaultAccount.account_link_id && !accounts.some((a) => a.id === defaultAccount.account_link_id) && <option value={defaultAccount.account_link_id}>{defaultAccount.account_name}</option>}</select></label>{resultLabel && <span className="tw-hint">Resultado desta conta: <strong>{resultLabel}</strong></span>}{source && <button type="button" className="tw-sheet-columns-toggle" disabled={rows.length >= 50} onClick={() => commit([...rows, campaignDraft(accountDefaults)])}>Adicionar linha</button>}{canPullSpend && <button type="button" className="tw-sheet-columns-toggle" disabled={spendBusy} onClick={() => pullMetaSpend({ overwrite: false })} title="Campanha + conjunto: preenche o gasto do conjunto. Só campanha: lista os conjuntos com gasto na semana.">{spendBusy ? 'Buscando conjuntos…' : source?.spendLabel || 'Puxar gasto dos conjuntos'}</button>}{canConfigure && !contextOnly && <button type="button" className="tw-sheet-columns-toggle" aria-expanded={showColumns} onClick={() => setShowColumns((open) => !open)}>Colunas desta conta</button>}<span className="tw-hint">{source?.caption || <>{catalogHint || 'Cole da planilha · Tab ou Enter para avançar'} · {canReorder ? 'arraste o título da coluna para mudar a ordem · ' : ''}arraste a borda do cabeçalho para alargar</>}</span></div>}
    {spendNote && <p className="tw-hint tw-sheet-status" role="status">{spendNote}{spendIndex && /já tinham valor/.test(spendNote) ? <>{' '}<button type="button" className="tw-sheet-columns-toggle" disabled={spendBusy} onClick={() => pullMetaSpend({ overwrite: true, reuse: true })}>{source ? 'Substituir pelo gasto salvo' : 'Substituir com a Meta'}</button></> : null}</p>}
    {showColumns && canConfigure && !readonly && !contextOnly && <div className="tw-sheet-columns" role="group" aria-label="Colunas da planilha deste cliente">{sheetMetricOptions(resultLabel).map((option) => <label key={option.id}><input type="checkbox" checked={metrics.includes(option.id)} disabled={option.always} onChange={() => toggleMetric(option.id)} />{option.label}</label>)}</div>}
    {!readonly && primaryCatalog.status === 'no-token' && <p className="tw-hint tw-sheet-status">Para validar ou copiar nomes da Meta, salve o token em <a href="#/settings/meta">Configurações → Meta da agência</a>.</p>}
    {!readonly && !defaultAccount.account_link_id && <div className="tw-sheet-tools"><select aria-label="Plataforma da tabela" value={defaultAccount.platform} onChange={(e) => applyAccount({platform:e.target.value})}><option value="meta">Meta Ads</option><option value="google">Google Ads</option><option value="other">Outra</option></select><input aria-label="Nome da conta da tabela" placeholder="Nome da conta" value={defaultAccount.account_name} onChange={(e) => applyAccount({account_name:e.target.value})} /><input aria-label="ID da conta da tabela" placeholder="ID da conta" value={defaultAccount.account_id} onChange={(e) => applyAccount({account_id:e.target.value})} /></div>}
    {pasteError && <p role="alert" className="tw-error">{pasteError}</p>}
    <div className="tw-table-wrap tw-sheet-scroll"><table aria-label={contextOnly ? 'Campanhas da otimização' : 'Resultados semanais por campanha'} className={`tw-sheet-table ${contextOnly ? 'tw-sheet-table--context' : ''}`} style={{ minWidth: contextOnly ? undefined : sheetTableWidth(columns, widths), width: contextOnly ? undefined : source ? '100%' : sheetTableWidth(columns, widths) }}>
      <colgroup>
        <col className="tw-sheet-row-index" style={{ width: 36 }} />
        {columns.map((column) => <col key={column.key} className={cellClass(column)} style={{ width: widthOf(column.key) }} />)}
        <col className="tw-sheet-remove" style={{ width: 26 }} />
      </colgroup>
      <thead><tr><th className="tw-sheet-row-index" scope="col" aria-label="Linha">{onInspectLeads ? <input type="checkbox" aria-label="Selecionar todas as linhas" checked={allSelected} disabled={!filled.length} onChange={() => setSelected(allSelected ? [] : filled.map((row) => row.id))} /> : '#'}</th>{columns.map((column) => {
        const metricId = metricIdOf(column);
        return <th key={column.key} className={cellClass(column)} scope="col" style={{ width: widthOf(column.key) }} data-sheet-metric={metricId || undefined}><span className={`tw-sheet-col-label${canReorder && metricId ? ' is-draggable' : ''}`} tabIndex={canReorder && column.role === 'input' ? 0 : undefined} role={canReorder && column.role === 'input' ? 'button' : undefined} aria-label={canReorder && column.role === 'input' ? `Mover coluna ${column.label}` : undefined} onPointerDown={(event) => startOrder(event, column)} onPointerMove={moveOrder} onPointerUp={endOrder} onPointerCancel={endOrder} onKeyDown={(event) => nudgeOrder(event, column)}>{column.label}</span><span role="separator" aria-orientation="vertical" aria-label={`Redimensionar coluna ${column.label}`} tabIndex={0} className="tw-sheet-resize" onPointerDown={(event) => startResize(event, column.key)} onPointerMove={moveResize} onPointerUp={endResize} onPointerCancel={endResize} onLostPointerCapture={endResize} onDoubleClick={() => setWidths((current) => persistWidths(resetColumnWidth(current, column.key)))} onKeyDown={(event) => stepResize(event, column.key)} /></th>;
      })}<th className="tw-sheet-remove" scope="col" aria-label="Remover linha"></th></tr></thead><tbody>
      {rows.map((r, i) => {
        const campaignMatch = matchName(r.campaign_name, catalogFor(r).campaigns);
        const adsetMatch = matchName(r.adset_name, adsetCatalogForRow(r, catalogFor(r).campaigns));
        return <tr key={r.id} className={onInspectLeads && selected.includes(r.id) ? 'is-selected' : undefined}><th className="tw-sheet-row-index" scope="row">{onInspectLeads && filled.includes(r) ? <input type="checkbox" aria-label={`Selecionar linha ${i + 1}`} checked={selected.includes(r.id)} onChange={() => setSelected((current) => current.includes(r.id) ? current.filter((value) => value !== r.id) : [...current, r.id])} /> : i + 1}</th>{columns.map((column) => {
          const unknown = column.key === 'campaign_name' ? campaignMatch.status === 'unknown' : column.key === 'adset_name' && r.adset_name ? adsetMatch.status === 'unknown' : false;
          const title = unknown ? (column.key === 'campaign_name' ? 'Nome não encontrado nesta conta da Meta. Pode manter ou escolher da lista.' : 'Conjunto não encontrado nesta campanha/conta. Pode manter ou escolher da lista.') : undefined;
          return <td key={column.key} className={`${cellClass(column) || ''}${unknown ? ' tw-sheet-unknown' : ''}`.trim()} title={title}>
            {column.role === 'name' ? nameCell(r, i, column.key, column.index) : column.role === 'calc' ? <span className="tw-calculated">{money(calculated(r, column))}</span> : text(r, i, column.key, column.label, column.index, column.numeric)}
          </td>;
        })}<td>{!readonly && filled.includes(r) && <button type="button" className="tw-remove-row" aria-label={`Remover linha ${i + 1}`} onClick={() => onChange(padSheetRows(rows.filter((_,n) => n !== i),defaultAccount))}>×</button>}</td></tr>;
      })}
    </tbody>{!contextOnly && <tfoot><tr><th colSpan={1 + (columns[1] ? 2 : 1)}>Total</th>{columns.slice(2).map((column) => <td key={column.key} className={column.role === 'calc' ? 'tw-calculated' : undefined}>{totalFor(column)}</td>)}<td></td></tr></tfoot>}</table></div>
    {onInspectLeads && <div className="tw-sheet-leads"><span role="status">{selectedRows.length ? `${selectedRows.length} linha(s) selecionada(s)` : 'Selecione as linhas para consultar os leads'}</span><button type="button" disabled={!selectedRows.length} onClick={() => onInspectLeads(selectedRows, false)}>Ver leads</button><button type="button" disabled={!selectedRows.length} onClick={() => onInspectLeads(selectedRows, true)}>Ver agendamentos</button></div>}
  </div>;
}
