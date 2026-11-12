import React from 'react';
import { X } from 'lucide-react';

export const CORES = ['#3b6ef5', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#db2777', '#0891b2', '#64748b'];

export function ColorPicker({ value, onChange }) {
  return (
    <div className="atl-row" role="radiogroup" aria-label="Cor">
      {CORES.map((cor) => (
        <button
          key={cor}
          type="button"
          role="radio"
          aria-checked={value === cor}
          onClick={() => onChange(cor)}
          style={{
            width: '1.5rem',
            height: '1.5rem',
            borderRadius: '999px',
            border: value === cor ? '2px solid #0f172a' : '2px solid #fff',
            boxShadow: '0 0 0 1px #e2e8f0',
            background: cor,
            cursor: 'pointer',
          }}
          aria-label={cor}
        />
      ))}
    </div>
  );
}

export function EditModal({ title, children, onCancel, onSave, saving, wide, saveLabel = 'Salvar' }) {
  return (
    <div className="atl-modal" role="dialog" aria-modal="true" aria-label={title}>
      <form
        className={`atl-modal__card${wide ? ' is-wide' : ''}`}
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
      >
        <header>
          <h3>{title}</h3>
          <button type="button" onClick={onCancel} aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </header>
        {children}
        <footer>
          <button type="button" className="atl-btn is-ghost" onClick={onCancel}>
            Cancelar
          </button>
          <button type="submit" className="atl-btn" disabled={saving}>
            {saving ? 'Salvando…' : saveLabel}
          </button>
        </footer>
      </form>
    </div>
  );
}
