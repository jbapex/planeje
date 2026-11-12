import React from 'react';

const STATUS = {
  saved:   { color: '#16A34A', dot: '●', text: 'Salvo' },
  unsaved: { color: '#D97706', dot: '●', text: 'Alterações não salvas' },
  saving:  { color: '#3B82F6', dot: '◌', text: 'Salvando…' },
  error:   { color: '#DC2626', dot: '●', text: 'Erro ao salvar' },
};

export default function Toolbar({
  diagramName,
  clienteName,
  onNameChange,
  onSave,
  onExportPng,
  onExportSvg,
  onNew,
  onLoadTemplate,
  onLoadJornada,
  onLoadCampanhas,
  saveStatus,
  isPublished,
  onTogglePublished,
}) {
  const s = STATUS[saveStatus] || STATUS.unsaved;

  return (
    <header className="toolbar">
      <div className="toolbar-left">
        <div className="logo">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <polygon points="14,2 26,8 26,20 14,26 2,20 2,8" fill="#3B82F6" opacity="0.15" stroke="#3B82F6" strokeWidth="1.5"/>
            <polygon points="14,7 21,11 21,17 14,21 7,17 7,11" fill="#3B82F6" opacity="0.3"/>
            <circle cx="14" cy="14" r="3" fill="#3B82F6"/>
          </svg>
          <span className="logo-text">Funil</span>
          {clienteName ? (
            <span className="toolbar-cliente" title="Funis desta conta">{clienteName}</span>
          ) : null}
        </div>
      </div>

      <div className="toolbar-center">
        <input
          className="name-input"
          value={diagramName}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Nome do diagrama…"
          spellCheck={false}
        />
        <span className="save-status" style={{ color: s.color }}>
          {s.dot} {s.text}
        </span>
        {onTogglePublished && (
          <button
            type="button"
            className={`toolbar-published ${isPublished ? 'toolbar-published--on' : ''}`}
            onClick={onTogglePublished}
            title="Diagrama usado para métricas no hub"
          >
            {isPublished ? '● Publicado' : '○ Rascunho'}
          </button>
        )}
      </div>

      <div className="toolbar-right">
        <button className="btn btn-ghost" onClick={onLoadTemplate} title="Restaurar template padrão desta conta (backup Dinamac)">
          Padrão
        </button>
        <button className="btn btn-ghost" onClick={onLoadJornada} title="Jornada Completa do Lead (3 jornadas A/B/C)">
          Jornada
        </button>
        <button className="btn btn-ghost" onClick={onLoadCampanhas} title="Funil de Mídia Paga — 10 campanhas Google + Meta">
          Mídia
        </button>
        <button className="btn btn-ghost" onClick={onNew}>
          Novo
        </button>
        <div className="divider" />
        <button className="btn btn-ghost" onClick={onExportSvg} title="Exportar como SVG">
          ↓ SVG
        </button>
        <button className="btn btn-ghost" onClick={onExportPng} title="Exportar como PNG">
          ↓ PNG
        </button>
        <div className="divider" />
        <button className="btn btn-primary" onClick={onSave}>
          Salvar
        </button>
      </div>
    </header>
  );
}
