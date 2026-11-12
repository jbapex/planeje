import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { deliveryLabel } from '@/lib/trafficSheetCatalog';

export default function TrafficSheetNameCell({
  value,
  label,
  rowIndex,
  column,
  suggestions = [],
  matchStatus = 'empty',
  readonly,
  onChange,
  onPick,
  onPaste,
  onNavigate,
}) {
  const inputRef = useRef(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [box, setBox] = useState(null);

  const place = () => {
    const el = inputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setBox({
      top: Math.round(rect.bottom + 2),
      left: Math.round(rect.left),
      width: Math.round(Math.max(rect.width, 280)),
    });
  };

  useEffect(() => {
    if (!open) return undefined;
    place();
    const onReposition = () => place();
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
    return () => {
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    };
  }, [open, suggestions.length, value]);

  useEffect(() => { setHighlight(0); }, [value, open]);
  useEffect(() => {
    if (suggestions.length && inputRef.current === document.activeElement) setOpen(true);
  }, [suggestions.length]);

  if (readonly) return <span>{value === '' || value == null ? '—' : value}</span>;

  const showList = open && suggestions.length > 0;
  const active = suggestions[highlight] || suggestions[0];

  const pick = (item) => {
    if (!item) return;
    onPick(item);
    setOpen(false);
  };

  const onKeyDown = (event) => {
    if (showList) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setHighlight((index) => Math.min(index + 1, suggestions.length - 1));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setHighlight((index) => Math.max(index - 1, 0));
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key === 'Enter' && active && matchStatus !== 'exact') {
        event.preventDefault();
        pick(active);
        return;
      }
    }
    onNavigate?.(event);
  };

  return (
    <>
      <input
        ref={inputRef}
        aria-label={`${label}, linha ${rowIndex + 1}`}
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        aria-activedescendant={showList && active ? `${listId}-${active.id}` : undefined}
        data-sheet-row={rowIndex}
        data-sheet-column={column}
        value={value ?? ''}
        maxLength={200}
        autoComplete="off"
        spellCheck={false}
        placeholder={suggestions.length ? 'Digite ou escolha o nome' : undefined}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => { setOpen(true); place(); }}
        onBlur={() => { window.setTimeout(() => setOpen(false), 120); }}
        onPaste={(event) => onPaste?.(event)}
        onKeyDown={onKeyDown}
      />
      {showList && box && createPortal(
        <ul
          id={listId}
          role="listbox"
          className="tw-sheet-suggest-list"
          style={{ top: box.top, left: box.left, width: box.width }}
        >
          {suggestions.map((item, index) => (
            <li key={`${item.id}-${item.campaign_id || ''}`} role="presentation">
              <button
                type="button"
                id={`${listId}-${item.id}`}
                role="option"
                aria-selected={item === active}
                className={index === highlight ? 'is-active' : undefined}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(item)}
              >
                <span>{item.name}</span>
                <small>
                  {[deliveryLabel(item.status), item.campaign_name && item.campaign_name !== item.name ? item.campaign_name : '']
                    .filter(Boolean)
                    .join(' · ')}
                </small>
              </button>
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </>
  );
}
