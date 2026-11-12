import React, { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Loader2, MessageCircle, Search, Settings } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  addDaysYmd,
  appointmentTimeKey,
  isAppointmentDateColumn,
  attemptTitle,
  formatDayBr,
  maskDayBr,
  parseDayBr,
  followCardColumn,
  followColumn,
  noAnswerStatusKey,
  progressLabel,
  statusInk,
  attemptDestinationOptions,
  suggestReturnDay,
} from '@/lib/miniCrm';

const GROUPS = [
  { id: 'open', title: 'Sem programação', hint: 'Falta o dia', tone: 'open', color: '#64748b' },
  { id: 'late', title: 'Atrasados', hint: 'Data vencida', tone: 'late', color: '#e11d48' },
  { id: 'today', title: 'Hoje', hint: 'Retornar agora', tone: 'today', color: '#d97706' },
  { id: 'next', title: 'Próximos dias', hint: 'Já marcados', tone: 'next', color: '#2563eb' },
  { id: 'repescagem', title: 'Repescagem', hint: 'Retomada futura', tone: 'repescagem', color: '#7c3aed' },
];

function formatPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  const local = digits.startsWith('55') && digits.length >= 12 ? digits.slice(2) : digits;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return String(value || '');
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return `${parts[0][0] || ''}${parts[1]?.[0] || ''}`.toUpperCase();
}

export function dateCaption(em, today) {
  if (!em) return 'Sem data';
  const full = formatDayBr(em);
  if (em === today) return `Hoje, ${full}`;
  if (em === addDaysYmd(today, 1)) return `Amanhã, ${full}`;
  if (em === addDaysYmd(today, -1)) return `Ontem, ${full}`;
  return full;
}

/** Formulário de resultado da tentativa (dialog do card ou painel lateral). */
export function AttemptForm({
  retorno,
  today,
  statuses,
  cadence,
  observacao,
  onObservacao,
  onAttempt,
  showCancel,
  onCancel,
}) {
  const [step, setStep] = useState('escolher');
  const [destino, setDestino] = useState('');
  const nextPasso = Math.min(retorno.total, retorno.passo + 1);
  const [nextEm, setNextEm] = useState(() => suggestReturnDay(retorno.cadencia, nextPasso, today, cadence));
  const [rescueEm, setRescueEm] = useState(() => suggestReturnDay('repescagem', 1, today, cadence));
  const last = retorno.passo >= retorno.total;
  const destinations = attemptDestinationOptions(statuses);
  const hasNote = typeof onObservacao === 'function';

  useEffect(() => {
    setStep('escolher');
    setDestino('');
    setNextEm(suggestReturnDay(retorno.cadencia, Math.min(retorno.total, retorno.passo + 1), today, cadence));
    setRescueEm(suggestReturnDay('repescagem', 1, today, cadence));
  }, [retorno.cadencia, retorno.passo, retorno.total, today, cadence]);

  return (
    <div className="mini-crm-attempt">
      {hasNote ? (
        <label className="mini-crm-attempt-note">
          Observação
          <textarea
            rows={3}
            value={observacao || ''}
            onChange={(event) => onObservacao(event.target.value)}
            placeholder="Anota o que aconteceu"
          />
        </label>
      ) : null}
      {step === 'escolher' ? (
        <div className="mini-crm-modal-actions is-stack">
          {!last ? (
            <button type="button" className="is-primary" onClick={() => setStep('seguir')}>Não respondeu</button>
          ) : null}
          {retorno.cadencia === 'repescagem' && last ? (
            <button type="button" className="is-primary" onClick={() => onAttempt({ resultado: 'sem_resposta' })}>
              Não respondeu — encerrar
            </button>
          ) : null}
          <button type="button" onClick={() => setStep('destino')}>Respondeu</button>
          {retorno.cadencia === 'inicial' ? (
            <button type="button" onClick={() => setStep('repescagem')}>Encerrar e programar repescagem</button>
          ) : null}
          {showCancel ? <button type="button" onClick={onCancel}>Cancelar</button> : null}
        </div>
      ) : null}
      {step === 'seguir' ? (
        <>
          <p>A próxima tentativa fica para {dateCaption(nextEm, today)}. Dá para mudar o dia.</p>
          <label>
            Data da próxima
            <DayField ariaLabel="Data da próxima" value={nextEm} onChange={setNextEm} />
          </label>
          <div className="mini-crm-modal-actions">
            <button type="button" onClick={() => setStep('escolher')}>Voltar</button>
            <button type="button" className="is-primary" onClick={() => onAttempt({ resultado: 'sem_resposta', em: nextEm })}>
              Criar {nextPasso}º contato
            </button>
          </div>
        </>
      ) : null}
      {step === 'destino' ? (
        <>
          <p>Para onde este lead segue.</p>
          <div className="mini-crm-modal-actions is-stack">
            {destinations.map((item) => (
              <button
                key={item.key}
                type="button"
                className={destino === item.key ? 'is-primary' : ''}
                onClick={() => setDestino(item.key)}
              >
                {item.name}
              </button>
            ))}
          </div>
          <div className="mini-crm-modal-actions">
            <button type="button" onClick={() => setStep('escolher')}>Voltar</button>
            <button
              type="button"
              className="is-primary"
              disabled={!destino}
              onClick={() => onAttempt({ resultado: 'respondeu', destino })}
            >
              Concluir retorno
            </button>
          </div>
        </>
      ) : null}
      {step === 'repescagem' ? (
        <>
          <p>O status vai para Venda perdida, motivo Sem retorno. A repescagem nasce nesta data.</p>
          <label>
            Data da repescagem
            <DayField ariaLabel="Data da repescagem" value={rescueEm} onChange={setRescueEm} />
          </label>
          <div className="mini-crm-modal-actions">
            <button type="button" onClick={() => setStep('escolher')}>Voltar</button>
            <button
              type="button"
              className="is-primary"
              onClick={() => onAttempt({ resultado: 'repescagem', em: rescueEm })}
            >
              Programar repescagem
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

const ymdToDate = (ymd) => (ymd ? new Date(`${ymd}T12:00:00`) : undefined);

/** Um dia: o clique no campo abre o calendário; digitar dd/mm/aaaa continua valendo. */
export function DayField({ value, onChange, ariaLabel, className }) {
  const [text, setText] = useState(formatDayBr(value));
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setText(formatDayBr(value));
  }, [value]);
  const selected = ymdToDate(value);
  const pick = (day) => {
    if (!day) return;
    const iso = format(day, 'yyyy-MM-dd');
    setText(formatDayBr(iso));
    onChange(iso);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <input
          type="text"
          className={className}
          inputMode="numeric"
          placeholder="dd/mm/aaaa"
          aria-label={ariaLabel}
          autoComplete="off"
          value={text}
          onChange={(event) => {
            const next = maskDayBr(event.target.value);
            setText(next);
            if (!next) onChange('');
            const iso = parseDayBr(next);
            if (iso) onChange(iso);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && open) {
              event.stopPropagation();
              setOpen(false);
            }
          }}
        />
      </PopoverTrigger>
      <PopoverContent
        className="z-[90] w-auto p-0"
        align="start"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <Calendar
          locale={ptBR}
          mode="single"
          selected={selected}
          defaultMonth={selected || new Date()}
          onDayClick={pick}
        />
        <div className="mini-crm-day-foot">
          <button type="button" onClick={() => pick(new Date())}>Hoje</button>
          {value ? (
            <button
              type="button"
              onClick={() => {
                setText('');
                onChange('');
                setOpen(false);
              }}
            >
              Limpar
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function MiniCrmFollowUp({
  groups,
  counts,
  loading,
  today,
  statuses,
  columns,
  sellers,
  seller,
  onSeller,
  search,
  onSearch,
  onOpen,
  onChat,
  onSchedule,
  onAttempt,
  onStart,
  programRequest,
  cadence,
  onSaveCadence,
  savingCadence,
}) {
  const [dialog, setDialog] = useState(null);
  const [gear, setGear] = useState(false);
  const openedToken = useRef('');
  useEffect(() => {
    if (!programRequest?.token || openedToken.current === programRequest.token) return undefined;
    const row = ['open', 'late', 'today', 'next', 'repescagem']
      .flatMap((key) => groups[key] || [])
      .find((item) => item.id === programRequest.id);
    if (!row) return undefined;
    openedToken.current = programRequest.token;
    setDialog({ mode: 'programar', row });
    return undefined;
  }, [groups, programRequest]);
  const total = counts.open + counts.late + counts.today + counts.next + counts.repescagem;
  const cardColumn = followCardColumn(columns);

  return (
    <div className="mini-crm-follow">
      <div className="mini-crm-toolbar">
        <label className="mini-crm-search">
          <Search size={16} />
          <input
            value={search}
            placeholder="Buscar nome ou telefone"
            onChange={(event) => onSearch(event.target.value)}
          />
        </label>
        <label className="mini-crm-field">
          <select aria-label="Vendedor" value={seller} onChange={(event) => onSeller(event.target.value)}>
            <option value="">Todos os vendedores</option>
            {sellers.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <span className="mini-crm-count">{total} no follow-up</span>
        <button type="button" className="mini-crm-gear" aria-label="Configurar cadência" onClick={() => setGear(true)}>
          <Settings size={16} />
        </button>
      </div>
      {loading ? (
        <div className="mini-crm-loading">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando follow-up
        </div>
      ) : (
        <div className="mini-crm-follow-board">
          {GROUPS.map((group) => {
            const rows = groups[group.id] || [];
            return (
              <section key={group.id} className={`mini-crm-follow-col is-${group.tone}`}>
                <header style={{ background: group.color, color: statusInk(group.color) }}>
                  <div>
                    <strong>{group.title}</strong>
                    <small>{group.hint}</small>
                  </div>
                  <span>{rows.length}</span>
                </header>
                <div className="mini-crm-follow-list">
                  {rows.length === 0 ? <p className="mini-crm-follow-empty">Nenhum lead</p> : rows.map((row) => (
                    <FollowCard
                      key={row.id}
                      row={row}
                      today={today}
                      statuses={statuses}
                      cardColumn={cardColumn}
                      onOpen={onOpen}
                      onChat={onChat}
                      onSchedule={() => setDialog({ mode: 'programar', row })}
                      onAttempt={() => setDialog({ mode: 'registrar', row })}
                      onStart={() => onStart(row)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {gear ? (
        <CadenceDialog
          cadence={cadence}
          statuses={statuses}
          saving={savingCadence}
          onClose={() => setGear(false)}
          onSave={async (next) => {
            const saved = await onSaveCadence(next);
            if (saved) setGear(false);
          }}
        />
      ) : null}
      {dialog ? (
        <ReturnDialog
          dialog={dialog}
          today={today}
          statuses={statuses}
          cadence={cadence}
          onClose={() => setDialog(null)}
          onSchedule={(payload) => {
            onSchedule(dialog.row, payload);
            setDialog(null);
          }}
          onAttempt={(payload) => {
            onAttempt(dialog.row, payload);
            setDialog(null);
          }}
        />
      ) : null}
    </div>
  );
}

function FollowCard({ row, today, statuses, cardColumn, onOpen, onChat, onSchedule, onAttempt, onStart }) {
  const retorno = row.retorno;
  const column = followColumn(retorno, today);
  const dueRescue = column === 'repescagem' && retorno.em && retorno.em <= today;
  const status = (statuses || []).find((item) => item.key === row.status);
  const rawDetail = cardColumn ? String(row[cardColumn.key] || '').trim() : '';
  const detailDay = cardColumn?.kind === 'day' ? (formatDayBr(rawDetail) || rawDetail) : rawDetail;
  const detailTime = isAppointmentDateColumn(cardColumn) ? row.mini?.[appointmentTimeKey(cardColumn)] : '';
  const detail = detailDay && detailTime ? `${detailDay} às ${detailTime}` : detailDay;
  const action = retorno.acao || attemptTitle(retorno);
  let button = 'Registrar tentativa';
  let click = onAttempt;
  if (column === 'open') {
    button = 'Programar retorno';
    click = onSchedule;
  } else if (dueRescue) {
    button = 'Iniciar repescagem';
    click = onStart;
  } else if (column === 'repescagem') {
    button = 'Ver retorno';
    click = onSchedule;
  }
  return (
    <article className={`mini-crm-follow-card${dueRescue ? ' is-due' : ''}`}>
      <div className="mini-crm-follow-person">
        <span className="mini-crm-avatar" aria-hidden="true">{initials(row.nome)}</span>
        <div>
          <button type="button" onClick={() => onOpen(row)}>{row.nome || 'Sem nome'}</button>
          <small>{formatPhone(row.telefone)}</small>
        </div>
        <button type="button" className="mini-crm-follow-chat" aria-label={`Ver conversa de ${row.nome || 'lead'}`} title="Ver conversa" onClick={() => onChat(row)}>
          <MessageCircle size={15} />
        </button>
      </div>
      {detail ? <p>{cardColumn.label}: {detail}</p> : null}
      <p>{row.vendedor ? `Responsável: ${row.vendedor}` : 'Sem vendedor'}</p>
      {status ? (
        <span className="mini-crm-follow-status" style={status.color ? { background: status.color, color: statusInk(status.color) } : undefined}>
          {status.label}
        </span>
      ) : null}
      <span className="mini-crm-follow-progress">{progressLabel(retorno)}</span>
      <strong>{dueRescue ? 'Repescagem para hoje' : action}</strong>
      <time>{dateCaption(retorno.em, today)}{retorno.em && !['Hoje', 'Amanhã', 'Ontem', 'Sem data'].includes(dateCaption(retorno.em, today)) ? '' : ''}</time>
      <button type="button" className="mini-crm-follow-done" onClick={click}>{button}</button>
    </article>
  );
}

function CadenceDialog({ cadence, statuses, saving, onClose, onSave }) {
  const [inicial, setInicial] = useState(cadence?.inicial || []);
  const [repescagem, setRepescagem] = useState(cadence?.repescagem || []);
  const [semResposta, setSemResposta] = useState(() => noAnswerStatusKey(statuses, cadence));
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="mini-crm-modal is-cadence">
      <button type="button" className="mini-crm-modal-backdrop" aria-label="Fechar" onClick={onClose} />
      <form
        className="mini-crm-modal-card is-cadence"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({ inicial, repescagem, sem_resposta: semResposta });
        }}
      >
        <header>
          <strong>Cadência</strong>
          <small>O lead que já está no meio usa a lista nova na próxima tentativa.</small>
        </header>
        <StepList
          title="Follow-up"
          hint="O 1º contato conta do dia em que o status vira Follow-up."
          steps={inicial}
          onChange={setInicial}
        />
        <StepList
          title="Repescagem"
          hint="A 1ª conta do dia em que o follow-up é encerrado."
          steps={repescagem}
          onChange={setRepescagem}
        />
        <label className="mini-crm-step-status">
          <span>Se não responder a repescagem, vai para</span>
          <select value={semResposta} onChange={(event) => setSemResposta(event.target.value)}>
            {(statuses || []).map((status) => (
              <option key={status.key} value={status.key}>{status.label}</option>
            ))}
          </select>
        </label>
        <div className="mini-crm-modal-actions">
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="submit" className="is-primary" disabled={saving}>Salvar</button>
        </div>
      </form>
    </div>
  );
}

function StepList({ title, hint, steps, onChange }) {
  const setDay = (index, value) => {
    const next = steps.slice();
    const days = Math.max(0, Math.min(365, Math.round(Number(value) || 0)));
    next[index] = days;
    onChange(next);
  };
  return (
    <section className="mini-crm-steps">
      <strong>{title}</strong>
      <p>{hint}</p>
      {steps.map((days, index) => (
        <div className="mini-crm-step" key={`${title}-${index}`}>
          <span>{index + 1}º</span>
          <input
            type="number"
            min="0"
            max="365"
            aria-label={`Dias do ${index + 1}º contato de ${title}`}
            value={days}
            onChange={(event) => setDay(index, event.target.value)}
          />
          <small>dias</small>
          {steps.length > 1 ? (
            <button type="button" aria-label={`Tirar ${index + 1}º contato de ${title}`} onClick={() => onChange(steps.filter((_, at) => at !== index))}>Tirar</button>
          ) : <span />}
        </div>
      ))}
      {steps.length < 12 ? (
        <button type="button" className="mini-crm-step-add" onClick={() => onChange([...steps, 1])}>Nova etapa</button>
      ) : null}
    </section>
  );
}

function ReturnDialog({ dialog, today, statuses, cadence, onClose, onSchedule, onAttempt }) {
  const retorno = dialog.row.retorno;
  const [em, setEm] = useState(retorno.em || suggestReturnDay(retorno.cadencia, retorno.passo, today, cadence));
  const [acao, setAcao] = useState(retorno.acao || attemptTitle(retorno));

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="mini-crm-modal">
      <button type="button" className="mini-crm-modal-backdrop" aria-label="Fechar" onClick={onClose} />
      <form
        className="mini-crm-modal-card"
        onSubmit={(event) => {
          event.preventDefault();
          if (dialog.mode === 'programar') onSchedule({ em, acao });
        }}
      >
        <header>
          <strong>{dialog.row.nome || 'Lead'}</strong>
          <small>{progressLabel(retorno)}</small>
        </header>
        {dialog.mode === 'programar' ? (
          <>
            <label>
              Data
              <DayField ariaLabel="Data" value={em} onChange={setEm} />
            </label>
            <label>
              Ação
              <input value={acao} onChange={(event) => setAcao(event.target.value)} placeholder="O que fazer" />
            </label>
            <div className="mini-crm-modal-actions">
              <button type="button" onClick={onClose}>Cancelar</button>
              <button type="submit" className="is-primary">Salvar retorno</button>
            </div>
          </>
        ) : (
          <AttemptForm
            retorno={retorno}
            today={today}
            statuses={statuses}
            cadence={cadence}
            onAttempt={(payload) => onAttempt(payload)}
            showCancel
            onCancel={onClose}
          />
        )}
      </form>
    </div>
  );
}
