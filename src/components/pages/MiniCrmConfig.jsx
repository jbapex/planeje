import { useRef, useState } from 'react';
import { GripVertical, HelpCircle, Lock, Plus, Trash2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  columnKey,
  ensureSystemColumns,
  fixedColumns,
  isSystemColumn,
  MINI_CRM_COLORS,
  systemStatusKeys,
} from '@/lib/miniCrm';

const FIXED_COLUMNS = fixedColumns();

function moveItem(list, from, to) {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function indexFromHeights(clientY, listTop, heights, gap) {
  let acc = listTop;
  for (let i = 0; i < heights.length; i += 1) {
    if (clientY < acc + heights[i] / 2) return i;
    acc += heights[i] + gap;
  }
  return Math.max(0, heights.length - 1);
}

const KINDS = [
  { id: 'text', label: 'Texto' },
  { id: 'simnao', label: 'Sim ou não' },
  { id: 'money', label: 'Dinheiro' },
  { id: 'day', label: 'Data' },
];

const FIXED_KIND = { date: 'Data', text: 'Texto', status: 'Status' };

function ConfigTitle({ title, children }) {
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  return (
    <header className="mini-crm-config-title">
      <h2>{title}</h2>
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (!next) pinned.current = false;
          setOpen(next);
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className="mini-crm-config-help"
            aria-label={`Como funciona ${title}`}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => { if (!pinned.current) setOpen(false); }}
            onClick={(event) => {
              event.preventDefault();
              pinned.current = !pinned.current || !open;
              setOpen(pinned.current);
            }}
          >
            <HelpCircle size={15} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          align="start"
          className="mini-crm-config-help-text"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          {children}
        </PopoverContent>
      </Popover>
    </header>
  );
}

export default function MiniCrmConfig({ statuses, columns, sellers, saving, onSave }) {
  const [statusList, setStatusList] = useState(statuses);
  const [columnList, setColumnList] = useState(() => ensureSystemColumns(columns));
  const [lockedStatuses] = useState(() => systemStatusKeys(statuses));
  const [sellerList, setSellerList] = useState(() => sellers.map((name, index) => ({ id: `s${index}`, name, origin: name })));
  const [statusName, setStatusName] = useState('');
  const [columnName, setColumnName] = useState('');
  const [columnKind, setColumnKind] = useState('text');
  const [sellerName, setSellerName] = useState('');
  const [colorOpen, setColorOpen] = useState('');
  const [drag, setDrag] = useState(null);
  const nextId = useRef(sellers.length);
  const dragLive = useRef(null);

  const addStatus = () => {
    const label = statusName.trim();
    if (!label || statusList.some((item) => item.label.toLowerCase() === label.toLowerCase())) return;
    const key = columnKey(label, statusList.map((item) => item.key));
    const used = new Set(statusList.map((item) => item.color));
    const color = MINI_CRM_COLORS.find((item) => !used.has(item)) || MINI_CRM_COLORS[0];
    setStatusList((current) => [...current, { key, label, color }]);
    setStatusName('');
  };

  const addColumn = () => {
    const label = columnName.trim();
    if (!label) return;
    const key = columnKey(label, columnList.map((item) => item.key));
    setColumnList((current) => [...current, { key, label, kind: columnKind }]);
    setColumnName('');
    setColumnKind('text');
  };

  const addSeller = () => {
    const label = sellerName.trim();
    if (!label || sellerList.some((item) => item.name.toLowerCase() === label.toLowerCase())) return;
    nextId.current += 1;
    setSellerList((current) => [...current, { id: `s${nextId.current}`, name: label, origin: '' }]);
    setSellerName('');
  };

  const startDrag = (event, { listKey, itemKey, index, setList }) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const row = handle.closest('li');
    const listEl = handle.closest('[data-config-list]');
    if (!row || !listEl) return;

    const startY = event.clientY;
    const box = row.getBoundingClientRect();
    const rows = [...listEl.querySelectorAll(':scope > li')];
    const heights = rows.map((item) => item.getBoundingClientRect().height);
    const gap = rows.length > 1
      ? Math.max(0, rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().bottom)
      : 0;
    const listTop = rows[0].getBoundingClientRect().top;

    dragLive.current = {
      listKey,
      itemKey,
      setList,
      listEl,
      startY,
      offsetY: startY - box.top,
      width: box.width,
      height: box.height,
      left: box.left,
      active: false,
      from: index,
      heights,
      gap,
      listTop,
      scrollStart: listEl.scrollTop,
    };

    const move = (ev) => {
      const live = dragLive.current;
      if (!live) return;
      const dy = ev.clientY - live.startY;
      if (!live.active) {
        if (Math.abs(dy) < 5) return;
        live.active = true;
        document.body.classList.add('mini-crm-config-dragging');
      }
      if (ev.cancelable) ev.preventDefault();

      const listBox = live.listEl.getBoundingClientRect();
      if (ev.clientY > listBox.bottom - 36) live.listEl.scrollTop += 14;
      if (ev.clientY < listBox.top + 36) live.listEl.scrollTop -= 14;

      const scrollDelta = live.listEl.scrollTop - live.scrollStart;
      const to = indexFromHeights(ev.clientY, live.listTop - scrollDelta, live.heights, live.gap);
      if (to !== live.from) {
        const from = live.from;
        live.heights = moveItem(live.heights, from, to);
        live.from = to;
        live.setList((current) => moveItem(current, from, to));
      }

      setDrag({
        listKey: live.listKey,
        itemKey: live.itemKey,
        from: live.from,
        clientY: ev.clientY,
        left: live.left,
        width: live.width,
        height: live.height,
        offsetY: live.offsetY,
      });
    };

    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      document.body.classList.remove('mini-crm-config-dragging');
      dragLive.current = null;
      setDrag(null);
    };

    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const ghostLabel = (() => {
    if (!drag) return '';
    if (drag.listKey === 'status') return statusList.find((item) => item.key === drag.itemKey)?.label || '';
    if (drag.listKey === 'column') return columnList.find((item) => item.key === drag.itemKey)?.label || '';
    return sellerList.find((item) => item.id === drag.itemKey)?.name || '';
  })();

  return (
    <form
      className="mini-crm-config"
      onSubmit={(event) => {
        event.preventDefault();
        if (saving) return;
        const pendingSeller = sellerName.trim();
        const nextSellers = sellerList.map((item) => item.name.trim()).filter(Boolean);
        if (pendingSeller && !nextSellers.some((name) => name.toLocaleLowerCase('pt-BR') === pendingSeller.toLocaleLowerCase('pt-BR'))) {
          nextSellers.push(pendingSeller);
        }
        onSave({
          statuses: statusList
            .map((item) => ({ key: item.key, label: item.label.trim(), color: item.color }))
            .filter((item) => item.label),
          columns: columnList
            .map((item) => ({
              key: item.key,
              label: item.label.trim() || (isSystemColumn(item.key) ? 'Data da venda' : ''),
              kind: item.kind,
              ...(item.onCard ? { onCard: true } : {}),
            }))
            .filter((item) => item.label),
          sellers: nextSellers,
          renames: sellerList
            .filter((item) => item.origin && item.name.trim() && item.origin !== item.name.trim())
            .map((item) => ({ origin: item.origin, name: item.name.trim() })),
        });
      }}
    >
      <section>
        <ConfigTitle title="Status">
          Cada status vira uma coluna do Kanban. Arraste pela alça para mudar a ordem e toque na cor para trocar. Renomear só muda o nome na tela. Venda Realizada continua entrando na conta de vendas.
        </ConfigTitle>
        <ul data-config-list="status">
          {statusList.map((status, index) => (
            <li
              key={status.key}
              data-drag-key={status.key}
              data-order={index}
              className={drag?.itemKey === status.key && drag.listKey === 'status' ? 'is-dragging' : ''}
            >
              <button
                type="button"
                className="mini-crm-grip"
                aria-label={`Arrastar ${status.label}`}
                onPointerDown={(event) => startDrag(event, {
                  listKey: 'status',
                  itemKey: status.key,
                  index,
                  setList: setStatusList,
                })}
              >
                <GripVertical size={16} />
              </button>
              <input
                value={status.label}
                aria-label="Nome do status"
                onChange={(event) => setStatusList((current) => current.map((item) => (
                  item.key === status.key ? { ...item, label: event.target.value } : item
                )))}
              />
              <span className="mini-crm-color">
                <button
                  type="button"
                  className="mini-crm-swatch"
                  style={{ background: status.color || '#64748b' }}
                  aria-label={`Cor de ${status.label}`}
                  onClick={() => setColorOpen((current) => (current === status.key ? '' : status.key))}
                />
                {colorOpen === status.key && (
                  <span className="mini-crm-palette">
                    {MINI_CRM_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={status.color === color ? 'is-on' : ''}
                        style={{ background: color }}
                        aria-label={color}
                        onClick={() => {
                          setStatusList((current) => current.map((item) => (
                            item.key === status.key ? { ...item, color } : item
                          )));
                          setColorOpen('');
                        }}
                      />
                    ))}
                  </span>
                )}
              </span>
              {lockedStatuses.has(status.key) ? (
                <span className="mini-crm-fixed-tag" title="Status do sistema: o fluxo de venda e follow-up usa este status">
                  <Lock size={12} /> Fixo
                </span>
              ) : (
                <button type="button" aria-label={`Tirar ${status.label}`} onClick={() => setStatusList((current) => current.filter((item) => item.key !== status.key))}>
                  <Trash2 size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="mini-crm-config-add">
          <input value={statusName} placeholder="Novo status" onChange={(event) => setStatusName(event.target.value)} />
          <button type="button" onClick={addStatus}><Plus size={15} /> Adicionar</button>
        </div>
      </section>

      <section>
        <ConfigTitle title="Colunas">
          As fixas vêm do sistema e sempre aparecem. As da loja vêm depois: arraste pela alça para mudar a ordem na grade e no painel. Tirar a coluna esconde o campo; o que já foi digitado fica guardado.
        </ConfigTitle>
        <ul className="mini-crm-config-fixed" aria-label="Colunas fixas">
          {FIXED_COLUMNS.map((column) => (
            <li key={column.key}>
              <span className="mini-crm-fixed-icon"><Lock size={13} /></span>
              <span className="mini-crm-fixed-name">{column.label}</span>
              <em>{FIXED_KIND[column.kind] || 'Texto'}</em>
              <span className="mini-crm-fixed-tag">Fixa</span>
            </li>
          ))}
        </ul>
        <ul data-config-list="column">
          {columnList.map((column, index) => (
            <li
              key={column.key}
              data-drag-key={column.key}
              data-order={index}
              className={drag?.itemKey === column.key && drag.listKey === 'column' ? 'is-dragging' : ''}
            >
              <button
                type="button"
                className="mini-crm-grip"
                aria-label={`Arrastar ${column.label}`}
                onPointerDown={(event) => startDrag(event, {
                  listKey: 'column',
                  itemKey: column.key,
                  index,
                  setList: setColumnList,
                })}
              >
                <GripVertical size={16} />
              </button>
              <input
                value={column.label}
                aria-label="Nome da coluna"
                onChange={(event) => setColumnList((current) => current.map((item) => (
                  item.key === column.key ? { ...item, label: event.target.value } : item
                )))}
              />
              <em>{KINDS.find((kind) => kind.id === column.kind)?.label || 'Texto'}</em>
              <button
                type="button"
                className={column.onCard ? 'is-on' : ''}
                aria-pressed={Boolean(column.onCard)}
                onClick={() => setColumnList((current) => current.map((item) => ({ ...item, onCard: item.key === column.key })))}
              >
                Cartão
              </button>
              {isSystemColumn(column.key) ? (
                <span className="mini-crm-fixed-tag" title="Coluna do sistema: o popup de venda grava esta data">
                  <Lock size={12} /> Fixa
                </span>
              ) : (
                <button type="button" aria-label={`Tirar ${column.label}`} onClick={() => setColumnList((current) => current.filter((item) => item.key !== column.key))}>
                  <Trash2 size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="mini-crm-config-add">
          <input value={columnName} placeholder="Nova coluna" onChange={(event) => setColumnName(event.target.value)} />
          <select aria-label="Tipo da coluna" value={columnKind} onChange={(event) => setColumnKind(event.target.value)}>
            {KINDS.map((kind) => <option key={kind.id} value={kind.id}>{kind.label}</option>)}
          </select>
          <button type="button" onClick={addColumn}><Plus size={15} /> Adicionar</button>
        </div>
      </section>

      <section>
        <ConfigTitle title="Vendedores">
          A lista do campo vendedor, na ordem em que aparece. Arraste pela alça para mudar a ordem. Renomear atualiza os leads que já estão com esse nome.
        </ConfigTitle>
        <ul data-config-list="seller">
          {sellerList.map((seller, index) => (
            <li
              key={seller.id}
              data-drag-key={seller.id}
              data-order={index}
              className={drag?.itemKey === seller.id && drag.listKey === 'seller' ? 'is-dragging' : ''}
            >
              <button
                type="button"
                className="mini-crm-grip"
                aria-label={`Arrastar ${seller.name}`}
                onPointerDown={(event) => startDrag(event, {
                  listKey: 'seller',
                  itemKey: seller.id,
                  index,
                  setList: setSellerList,
                })}
              >
                <GripVertical size={16} />
              </button>
              <input
                value={seller.name}
                aria-label="Nome do vendedor"
                onChange={(event) => setSellerList((current) => current.map((item) => (
                  item.id === seller.id ? { ...item, name: event.target.value } : item
                )))}
              />
              <button type="button" aria-label={`Tirar ${seller.name}`} onClick={() => setSellerList((current) => current.filter((item) => item.id !== seller.id))}>
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
        <div className="mini-crm-config-add">
          <input
            value={sellerName}
            placeholder="Novo vendedor"
            aria-label="Novo vendedor"
            disabled={saving}
            onChange={(event) => setSellerName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
              event.preventDefault();
              if (!saving) addSeller();
            }}
          />
          <button type="button" aria-label="Adicionar vendedor" disabled={saving || !sellerName.trim()} onClick={addSeller}><Plus size={15} /> Adicionar</button>
        </div>
        <p>Use Adicionar ou Enter e depois clique em Salvar configuração para concluir.</p>
      </section>

      <button className="mini-crm-config-save" type="submit" disabled={saving}>
        {saving ? 'Salvando…' : 'Salvar configuração'}
      </button>

      {drag && (
        <div
          className="mini-crm-config-ghost"
          style={{
            top: drag.clientY - drag.offsetY,
            left: drag.left,
            width: drag.width,
            height: drag.height,
          }}
          aria-hidden="true"
        >
          <GripVertical size={16} />
          <span>{ghostLabel}</span>
        </div>
      )}
    </form>
  );
}
