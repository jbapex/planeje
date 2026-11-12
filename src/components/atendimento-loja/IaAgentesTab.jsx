import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, Bot, Check, Loader2, Pencil, Plus, Send, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { deleteLojaRow, friendlyDbError, saveLojaRow } from '@/lib/atendimentoLojaData';
import { invokeAtendimentoIa } from '@/lib/atendimentoIa';
import { EditModal } from '@/components/atendimento-loja/ConfigUi';
import {
  destinoFunilLabel,
  defaultFunilNoivas,
  IA_INSTRUCOES_NOIVAS,
  IA_OBJETIVO_NOIVAS,
  normalizeFunil,
  parseIaAction,
  stripFunilInstrucoes,
  withFunilInstrucoes,
} from '../../../supabase/functions/_shared/atendimentoIaPrompt.js';

const TONS = [
  ['cordial', 'Cordial'],
  ['formal', 'Formal'],
  ['descontraido', 'Descontraído'],
];
const MODELOS = [
  ['openai/gpt-4o-mini', 'Rápido (GPT-4o mini)'],
  ['openai/gpt-4o', 'Mais caprichado (GPT-4o)'],
];
const BASE_MAX = 30000;
/** Mesmas 6 etapas do wizard da Umbler (página inteira, não modal). */
const STEPS_AGENTE = [
  ['perfil', 'Perfil'],
  ['comportamento', 'Comportamento'],
  ['conhecimento', 'Conhecimento'],
  ['habilidades', 'Habilidades'],
  ['fluxo', 'Fluxo'],
  ['ativacao', 'Conversa e ativação'],
];

function Choice({ selected, onClick, title, hint, badge }) {
  return (
    <button type="button" className={`atl-choice${selected ? ' is-on' : ''}`} onClick={onClick}>
      <strong>
        {title}
        {badge ? <em className="atl-pill">{badge}</em> : null}
      </strong>
      {hint ? <span>{hint}</span> : null}
    </button>
  );
}

function perguntasEditaveis(funil) {
  return Array.isArray(funil?.perguntas) && funil.perguntas.length ? funil.perguntas : [''];
}

function passosEditaveis(funil) {
  const passos = normalizeFunil(funil).followup.passos;
  return passos.length ? passos : [{ horas: 4, mensagem: '' }];
}

function Checks({ items, value, onChange, empty }) {
  if (!items.length) return <p className="atl-modal__hint">{empty}</p>;
  const set = new Set(value || []);
  return (
    <div className="atl-check-list">
      {items.map((item) => (
        <label key={item.id}>
          <input
            type="checkbox"
            checked={set.has(item.id)}
            onChange={(ev) => {
              const next = new Set(set);
              if (ev.target.checked) next.add(item.id);
              else next.delete(item.id);
              onChange([...next]);
            }}
          />
          {item.nome}
        </label>
      ))}
    </div>
  );
}

function AreaDeTeste({ clienteId, agentes, setores = [], compact = false }) {
  const [agenteId, setAgenteId] = useState('');
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const listRef = useRef(null);
  const agenteTeste = agentes.find((a) => a.id === agenteId) || agentes[0];
  const funilTeste = normalizeFunil(agenteTeste?.funil);

  useEffect(() => {
    if (!agentes.some((a) => a.id === agenteId)) setAgenteId(agentes[0]?.id || '');
  }, [agentes, agenteId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [mensagens, enviando]);

  const enviar = async () => {
    const t = texto.trim();
    if (!t || !agenteId || enviando) return;
    const next = [...mensagens, { role: 'user', content: t }];
    setMensagens(next);
    setTexto('');
    setEnviando(true);
    setErro('');
    try {
      const r = await invokeAtendimentoIa({ acao: 'testar', cliente_id: clienteId, agente_id: agenteId, mensagens: next });
      const parsed = parseIaAction(r.resposta);
      const extra =
        parsed.action === 'transfer'
          ? [
              {
                role: 'system',
                content: `Passaria para ${destinoFunilLabel(funilTeste, setores)}. Nada foi gravado no lead e CAPI não disparou (área de teste).`,
              },
            ]
          : [];
      setMensagens([...next, { role: 'assistant', content: parsed.texto || r.resposta }, ...extra]);
    } catch (err) {
      setErro(err?.message || 'A IA não respondeu.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className={compact ? 'atl-test-embed' : 'atl-card'}>
      {compact ? (
        <div className="atl-test-embed__head">
          <div>
            <strong>{agenteTeste?.nome || 'Agente'}</strong>
            <span>Modo de teste</span>
          </div>
          <button type="button" className="atl-btn is-ghost is-sm" onClick={() => setMensagens([])} disabled={!mensagens.length}>
            Reiniciar conversa
          </button>
        </div>
      ) : (
        <div className="atl-card__head">
          <div>
            <h2>Área de teste</h2>
            <p>
              Você escreve como dono de loja ou interessado no serviço da agência e vê o que o agente responderia. Nada vai
              para o WhatsApp, o lead real não muda e não dispara CAPI.
            </p>
          </div>
          <div className="atl-row">
            <select
              className="atl-select"
              aria-label="Agente para testar"
              value={agenteId}
              onChange={(e) => {
                setAgenteId(e.target.value);
                setMensagens([]);
              }}
            >
              {agentes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </select>
            <button type="button" className="atl-btn is-ghost is-sm" onClick={() => setMensagens([])} disabled={!mensagens.length}>
              Limpar
            </button>
          </div>
        </div>
      )}
      {agentes.length === 0 ? (
        <p className="atl-empty">Crie um agente para testar.</p>
      ) : (
        <div className="atl-test-chat">
          <ol ref={listRef}>
            {mensagens.length === 0 ? (
              <li className="is-sys">Mande uma mensagem como loja, ex.: “Oi, sou da loja Recife Noivas, em Recife, nicho noivas”</li>
            ) : null}
            {mensagens.map((m, i) => (
              <li key={i} className={m.role === 'assistant' ? 'is-agent' : m.role === 'system' ? 'is-sys' : undefined}>
                {m.content}
              </li>
            ))}
            {enviando ? (
              <li className="is-agent">
                <Loader2 className="h-4 w-4 animate-spin" />
              </li>
            ) : null}
            {erro ? <li className="is-sys">{erro}</li> : null}
          </ol>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              enviar();
            }}
          >
            <input
              value={texto}
              maxLength={2000}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Mensagem do cliente (teste)"
              aria-label="Mensagem de teste"
            />
            <button type="submit" className="atl-btn" disabled={!texto.trim() || enviando}>
              <Send className="h-4 w-4" /> Testar
            </button>
          </form>
        </div>
      )}
    </section>
  );
}

/** Aba IA: agentes, bases de conhecimento e área de teste (só o administrador da loja). */
export default function IaAgentesTab({ clienteId, base, onChanged, userId }) {
  const [agentes, setAgentes] = useState([]);
  const [bases, setBases] = useState([]);
  const [uso, setUso] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [agente, setAgente] = useState(null);
  const [agenteAba, setAgenteAba] = useState('perfil');
  const [baseEdit, setBaseEdit] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const desde = new Date(Date.now() - 30 * 86400000).toISOString();
    const [a, b, l] = await Promise.all([
      supabase
        .from('cliente_atend_ia_agentes')
        .select('id, nome, objetivo, instrucoes, tom, modelo, base_ids, setor_ids, ativo, auto_responder, funil, updated_at')
        .eq('cliente_id', clienteId)
        .is('funil->crm_ia', null)
        .order('created_at'),
      supabase.from('cliente_atend_ia_bases').select('id, nome, conteudo, updated_at').eq('cliente_id', clienteId).order('nome'),
      supabase
        .from('cliente_atend_ia_log')
        .select('id', { count: 'exact', head: true })
        .eq('cliente_id', clienteId)
        .gte('created_at', desde),
    ]);
    let agentesRows = a;
    if (a.error) {
      agentesRows = await supabase
        .from('cliente_atend_ia_agentes')
        .select('id, nome, objetivo, instrucoes, tom, modelo, base_ids, setor_ids, ativo, auto_responder, updated_at')
        .eq('cliente_id', clienteId)
        .is('funil->crm_ia', null)
        .order('created_at');
    }
    if (agentesRows.error || b.error) {
      setLoadError(friendlyDbError(agentesRows.error || b.error, 'Não foi possível carregar os agentes.'));
    } else {
      setAgentes(agentesRows.data || []);
      setBases(b.data || []);
      setUso(l.error ? null : l.count || 0);
      setLoadError('');
    }
    setLoading(false);
  }, [clienteId]);

  useEffect(() => {
    load();
  }, [load]);

  const fechar = () => {
    setAgente(null);
    setAgenteAba('perfil');
    setBaseEdit(null);
    setError('');
  };

  const abrirAgente = (row) => {
    setAgenteAba('perfil');
    setAgente(row);
  };

  const salvarAgente = () => {
    if (!agente) return;
    const nome = String(agente.nome || '').trim();
    if (!nome) {
      setAgenteAba('perfil');
      return setError('Informe o nome do agente.');
    }
    const funil = normalizeFunil(agente.funil);
    const destSetor = (base.setores || []).find((s) => s.id === funil.destino_setor_id);
    const row = {
      id: agente.id,
      nome,
      objetivo: String(agente.objetivo || '').trim(),
      instrucoes: withFunilInstrucoes(agente.instrucoes, funil, { setorNome: destSetor?.nome }),
      tom: agente.tom,
      modelo: agente.modelo,
      base_ids: agente.base_ids || [],
      setor_ids: agente.setor_ids || [],
      ativo: agente.ativo !== false,
      auto_responder: agente.auto_responder === true,
      funil,
    };
    if (!agente.id) row.created_by = userId;
    salvar('cliente_atend_ia_agentes', row);
  };

  const salvar = async (table, row) => {
    setSaving(true);
    setError('');
    try {
      await saveLojaRow(table, clienteId, row);
      fechar();
      await load();
      await onChanged();
    } catch (err) {
      setError(friendlyDbError(err));
    } finally {
      setSaving(false);
    }
  };

  const apagar = async (table, row, pergunta) => {
    if (!window.confirm(pergunta)) return;
    try {
      await deleteLojaRow(table, clienteId, row.id);
      await load();
      await onChanged();
    } catch (err) {
      window.alert(friendlyDbError(err, 'Não foi possível apagar.'));
    }
  };

  const alternarAtivo = async (a) => {
    try {
      await saveLojaRow('cliente_atend_ia_agentes', clienteId, { id: a.id, ativo: !a.ativo });
      await load();
      await onChanged();
    } catch (err) {
      window.alert(friendlyDbError(err));
    }
  };

  const alternarAutoResponder = async (a) => {
    try {
      await saveLojaRow('cliente_atend_ia_agentes', clienteId, { id: a.id, auto_responder: !a.auto_responder });
      await load();
      await onChanged();
    } catch (err) {
      window.alert(friendlyDbError(err));
    }
  };

  const baseNome = Object.fromEntries(bases.map((b) => [b.id, b.nome]));

  if (loading) {
    return (
      <p className="atl-center">
        <Loader2 className="h-5 w-5 animate-spin" />
      </p>
    );
  }

  return (
    <>
      {loadError ? <p className="atl-warn">{loadError}</p> : null}
      <section className="atl-card">
        <div className="atl-card__head">
          <div>
            <h2>Agentes de IA</h2>
            <p>
              O agente lê a conversa e as bases marcadas. Com <strong>Sugerir</strong>, a equipe revisa e envia.
              Com <strong>Responder sozinho</strong> ligado, ele manda no WhatsApp de cada mensagem nova do contato
              até a equipe assumir. Novos agentes nascem desligados.
              {uso !== null ? ` ${uso} ${uso === 1 ? 'uso' : 'usos'} nos últimos 30 dias.` : ''}
            </p>
          </div>
          <button
            type="button"
            className="atl-btn"
            onClick={() =>
              abrirAgente({
                nome: '',
                objetivo: IA_OBJETIVO_NOIVAS,
                instrucoes: IA_INSTRUCOES_NOIVAS,
                tom: 'cordial',
                modelo: MODELOS[0][0],
                base_ids: bases.map((b) => b.id),
                setor_ids: [],
                ativo: true,
                auto_responder: false,
                funil: defaultFunilNoivas(),
              })
            }
          >
            <Plus className="h-4 w-4" /> Novo agente
          </button>
        </div>
        {agentes.length === 0 ? (
          <p className="atl-empty">Nenhum agente. Crie o primeiro e teste na área de teste abaixo.</p>
        ) : (
          <table className="atl-table">
            <thead>
              <tr>
                <th>Agente</th>
                <th>Bases</th>
                <th>Setores</th>
                <th>Ligado</th>
                <th>Responder sozinho</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {agentes.map((a) => (
                <tr key={a.id}>
                  <td>
                    <span className="atl-row">
                      <Bot className="h-4 w-4" /> <strong>{a.nome}</strong>
                    </span>
                    {a.objetivo ? <span className="atl-modal__hint">{a.objetivo}</span> : null}
                    {normalizeFunil(a.funil).perguntas.length ? (
                      <span className="atl-modal__hint">Qualificar → {destinoFunilLabel(a.funil, base.setores)}</span>
                    ) : null}
                    {normalizeFunil(a.funil).followup.ativo ? (
                      <span className="atl-modal__hint">Follow-up se o contato não responder</span>
                    ) : null}
                  </td>
                  <td className="is-clip">{(a.base_ids || []).map((id) => baseNome[id]).filter(Boolean).join(', ') || 'Nenhuma'}</td>
                  <td className="is-clip">
                    {(a.setor_ids || []).length
                      ? a.setor_ids.map((id) => base.setores.find((s) => s.id === id)?.nome).filter(Boolean).join(', ')
                      : 'Todos'}
                  </td>
                  <td>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={a.ativo}
                      aria-label={`Ligar ${a.nome}`}
                      className={`atl-switch${a.ativo ? ' is-on' : ''}`}
                      onClick={() => alternarAtivo(a)}
                    />
                  </td>
                  <td>
                    <span className="atl-row">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={Boolean(a.auto_responder)}
                        aria-label={`Responder sozinho ${a.nome}`}
                        className={`atl-switch${a.auto_responder ? ' is-on' : ''}`}
                        onClick={() => alternarAutoResponder(a)}
                      />
                      <span className={`atl-badge${a.auto_responder ? ' is-on' : ' is-off'}`}>
                        {a.auto_responder ? 'Ligado' : 'Desligado'}
                      </span>
                    </span>
                  </td>
                  <td className="is-actions">
                    <button type="button" onClick={() => abrirAgente({ ...a, instrucoes: stripFunilInstrucoes(a.instrucoes), funil: normalizeFunil(a.funil) })} aria-label={`Editar ${a.nome}`}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => apagar('cliente_atend_ia_agentes', a, `Apagar o agente "${a.nome}"?`)}
                      aria-label={`Apagar ${a.nome}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="atl-card">
        <div className="atl-card__head">
          <div>
            <h2>Bases de conhecimento</h2>
            <p>
              Texto que o agente consulta: horários, endereço, serviços, preços que podem ser ditos, perguntas frequentes.
              Só a equipe da loja vê.
            </p>
          </div>
          <button type="button" className="atl-btn" onClick={() => setBaseEdit({ nome: '', conteudo: '' })}>
            <Plus className="h-4 w-4" /> Nova base
          </button>
        </div>
        {bases.length === 0 ? (
          <p className="atl-empty">Nenhuma base. Sem base o agente só usa a conversa e as instruções.</p>
        ) : (
          <table className="atl-table">
            <thead>
              <tr>
                <th>Base</th>
                <th>Conteúdo</th>
                <th>Tamanho</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {bases.map((b) => (
                <tr key={b.id}>
                  <td>
                    <span className="atl-row">
                      <BookOpen className="h-4 w-4" /> {b.nome}
                    </span>
                  </td>
                  <td className="is-clip" title={b.conteudo}>
                    {b.conteudo || '—'}
                  </td>
                  <td>{(b.conteudo || '').length.toLocaleString('pt-BR')} caracteres</td>
                  <td className="is-actions">
                    <button type="button" onClick={() => setBaseEdit({ ...b })} aria-label={`Editar ${b.nome}`}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => apagar('cliente_atend_ia_bases', b, `Apagar a base "${b.nome}"? Os agentes deixam de consultá-la.`)}
                      aria-label={`Apagar ${b.nome}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <AreaDeTeste clienteId={clienteId} agentes={agentes.filter((a) => a.ativo)} setores={base.setores} />

      {agente ? (
        <div className="atl-designer" role="dialog" aria-modal="true" aria-label={agente.id ? agente.nome || 'Agente' : 'Novo agente de IA'}>
          <div className="atl-designer__card">
            <header className="atl-designer__head">
              <h3>
                {agente.id ? agente.nome || 'Agente' : 'Novo agente de IA'}
                <em className="atl-pill">Ápice</em>
              </h3>
              <button type="button" onClick={fechar} aria-label="Fechar">
                <X className="h-4 w-4" />
              </button>
            </header>
            <nav className="atl-designer__steps" aria-label="Etapas do agente">
              {STEPS_AGENTE.map(([id, label], i) => {
                const idx = STEPS_AGENTE.findIndex((s) => s[0] === agenteAba);
                return (
                  <button
                    key={id}
                    type="button"
                    className={`atl-designer__step${i === idx ? ' is-on' : i < idx ? ' is-done' : ''}`}
                    onClick={() => setAgenteAba(id)}
                  >
                    <span className="atl-designer__step-n">{i < idx ? <Check className="h-3.5 w-3.5" /> : i + 1}</span>
                    <span className="atl-designer__step-l">{label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="atl-designer__body">

              {agenteAba === 'perfil' ? (
                <>
                  <h4>Comece com um modelo</h4>
                  <p className="atl-modal__hint">Função do agente</p>
                  <div className="atl-choice-row">
                    <Choice
                      selected
                      title="Qualificar a loja"
                      badge="Ápice"
                      hint="Apresenta a agência, pergunta nome da loja, cidade e nicho e passa para o atendente."
                    />
                  </div>
                  <h4>Identidade do agente</h4>
                  <div className="atl-grid-2">
                    <label>
                      <span>Nome do agente *</span>
                      <input autoFocus maxLength={60} value={agente.nome} placeholder="Máximo 60 caracteres" onChange={(e) => setAgente({ ...agente, nome: e.target.value })} />
                    </label>
                    <label>
                      <span>Objetivo</span>
                      <input
                        maxLength={500}
                        value={agente.objetivo}
                        placeholder="Ex.: Qualificar a loja ou o interessado e passar para o atendente da Ápice"
                        onChange={(e) => setAgente({ ...agente, objetivo: e.target.value })}
                      />
                    </label>
                  </div>
                  <details className="atl-mais" open={!agente.id}>
                    <summary>Outras opções</summary>
                    <label>
                      <span>Instruções personalizadas</span>
                      <textarea
                        rows={5}
                        maxLength={8000}
                        value={agente.instrucoes}
                        placeholder="Ex.: Temos muitos clientes idosos, seja muito paciente e empático com eles."
                        onChange={(e) => setAgente({ ...agente, instrucoes: e.target.value })}
                      />
                    </label>
                    <p className="atl-modal__hint">Tipo de agente</p>
                    <div className="atl-choice-row">
                      {MODELOS.map(([v, l]) => (
                        <Choice
                          key={v}
                          selected={agente.modelo === v}
                          onClick={() => setAgente({ ...agente, modelo: v })}
                          title={l}
                          hint={v === MODELOS[0][0] ? 'Respostas boas para a maioria dos atendimentos.' : 'Respostas mais precisas e aprofundadas.'}
                          badge={v === MODELOS[1][0] ? 'Recomendado' : null}
                        />
                      ))}
                    </div>
                  </details>
                </>
              ) : null}

              {agenteAba === 'comportamento' ? (
                <>
                  <h4>Estilo de escrita</h4>
                  <p className="atl-modal__hint">Tom de comunicação</p>
                  <div className="atl-choice-row is-4">
                    {TONS.map(([v, l]) => (
                      <Choice
                        key={v}
                        selected={agente.tom === v}
                        onClick={() => setAgente({ ...agente, tom: v })}
                        title={l}
                        hint={
                          v === 'formal'
                            ? 'Direto e focado em negócios, mantendo educação.'
                            : v === 'cordial'
                              ? 'Acolhedor, frases curtas, sem gírias.'
                              : 'Leve e próximo; pode usar um emoji quando couber.'
                        }
                      />
                    ))}
                  </div>
                </>
              ) : null}

              {agenteAba === 'conhecimento' ? (
                <>
                  <h4>Conteúdo para treinamento do seu agente</h4>
                  {bases.length === 0 ? (
                    <div className="atl-empty-dash">
                      <BookOpen className="h-8 w-8" />
                      <strong>O que seu agente sabe sobre o seu negócio</strong>
                      <p>
                        A base de conhecimento é onde o agente busca as respostas certas. Crie uma base na lista abaixo,
                        depois volte aqui e marque. Ele usa esse texto para responder sem inventar.
                      </p>
                    </div>
                  ) : (
                    <label>
                      <span>Bases que ele consulta</span>
                      <Checks items={bases} value={agente.base_ids} onChange={(base_ids) => setAgente({ ...agente, base_ids })} empty="" />
                    </label>
                  )}
                </>
              ) : null}

              {agenteAba === 'habilidades' ? (
                <>
                  <h4>Automações</h4>
                  <p className="atl-modal__hint">
                    Defina gatilhos para executar ações automaticamente quando o agente identificar determinadas intenções
                    do cliente.
                  </p>
                  <div className="atl-skill">
                    <div className="atl-skill__head">
                      <strong>Quando for necessário transferir pra um humano</strong>
                      <em className="atl-pill">Obrigatória</em>
                    </div>
                    <div className="atl-grid-2">
                      <label>
                        <span>Destino ao transferir</span>
                        <select
                          value={normalizeFunil(agente.funil).destino_tipo}
                          onChange={(e) =>
                            setAgente({
                              ...agente,
                              funil: {
                                ...normalizeFunil(agente.funil),
                                destino_tipo: e.target.value,
                                destino_setor_id:
                                  e.target.value === 'setor' ? agente.funil?.destino_setor_id || base.setores[0]?.id || null : null,
                              },
                            })
                          }
                        >
                          <option value="proximo">Próximo atendente</option>
                          <option value="setor">Setor da Ápice</option>
                        </select>
                      </label>
                      {normalizeFunil(agente.funil).destino_tipo === 'setor' ? (
                        <label>
                          <span>Setor</span>
                          <select
                            value={normalizeFunil(agente.funil).destino_setor_id || ''}
                            onChange={(e) =>
                              setAgente({ ...agente, funil: { ...normalizeFunil(agente.funil), destino_setor_id: e.target.value || null } })
                            }
                          >
                            <option value="">Escolha o setor</option>
                            {(base.setores || []).map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.nome}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <p className="atl-modal__hint">A conversa vai para Esperando e a IA para. O atendente da Ápice assume.</p>
                      )}
                    </div>
                    <label>
                      <span>Mensagem de transição</span>
                      <textarea
                        rows={2}
                        maxLength={500}
                        value={normalizeFunil(agente.funil).mensagem_transicao}
                        placeholder="Ex.: Vou te passar para o atendente da Ápice agora."
                        onChange={(e) =>
                          setAgente({ ...agente, funil: { ...normalizeFunil(agente.funil), mensagem_transicao: e.target.value } })
                        }
                      />
                    </label>
                  </div>
                  <div className="atl-skill">
                    <div className="atl-skill__head">
                      <strong>Se o contato não responder</strong>
                    </div>
                    <p className="atl-modal__hint">
                      Depois que a IA fala, se o contato ficar quieto, envia estas mensagens. Cancela se ele responder, se a
                      equipe assumir ou se a conversa for finalizada. Só roda com Responder sozinho ligado. Nasce desligado.
                    </p>
                    <label className="atl-row">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={Boolean(agente.funil?.followup?.ativo)}
                        aria-label="Ligar follow-up"
                        className={`atl-switch${agente.funil?.followup?.ativo ? ' is-on' : ''}`}
                        onClick={() => {
                          const funil = normalizeFunil(agente.funil);
                          const passos = passosEditaveis(agente.funil).map((p) => ({ horas: p.horas, mensagem: p.mensagem }));
                          setAgente({
                            ...agente,
                            funil: { ...funil, followup: { ...funil.followup, ativo: !agente.funil?.followup?.ativo, passos } },
                          });
                        }}
                      />
                      <span>{agente.funil?.followup?.ativo ? 'Ligado' : 'Desligado'}</span>
                    </label>
                    {passosEditaveis(agente.funil).map((p, i) => (
                      <div key={i} className="atl-followup-step">
                        <div className="atl-funil__row">
                          <label>
                            <span>Esperar (horas)</span>
                            <input
                              type="number"
                              min={0.25}
                              max={168}
                              step={0.25}
                              value={p.horas}
                              onChange={(e) => {
                                const funil = normalizeFunil(agente.funil);
                                const passos = [...passosEditaveis(agente.funil)];
                                passos[i] = { ...passos[i], horas: e.target.value };
                                setAgente({ ...agente, funil: { ...funil, followup: { ...funil.followup, passos } } });
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            className="atl-btn is-ghost is-sm"
                            aria-label="Remover passo"
                            disabled={passosEditaveis(agente.funil).length <= 1}
                            onClick={() => {
                              const funil = normalizeFunil(agente.funil);
                              const passos = passosEditaveis(agente.funil).filter((_, idx) => idx !== i);
                              setAgente({ ...agente, funil: { ...funil, followup: { ...funil.followup, passos } } });
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <label>
                          <span>Mensagem {i + 1}</span>
                          <textarea
                            rows={3}
                            maxLength={500}
                            value={p.mensagem}
                            placeholder="Ex.: Oi! Vi que você ficou na conversa. Ainda quer falar sobre a loja?"
                            onChange={(e) => {
                              const funil = normalizeFunil(agente.funil);
                              const passos = [...passosEditaveis(agente.funil)];
                              passos[i] = { ...passos[i], mensagem: e.target.value };
                              setAgente({ ...agente, funil: { ...funil, followup: { ...funil.followup, passos } } });
                            }}
                          />
                        </label>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="atl-btn is-ghost is-sm"
                      disabled={passosEditaveis(agente.funil).length >= 3}
                      onClick={() => {
                        const funil = normalizeFunil(agente.funil);
                        const passos = [...passosEditaveis(agente.funil), { horas: 24, mensagem: '' }];
                        setAgente({ ...agente, funil: { ...funil, followup: { ...funil.followup, passos } } });
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" /> Adicionar mensagem
                    </button>
                  </div>
                </>
              ) : null}

              {agenteAba === 'fluxo' ? (
                <>
                  <h4>Etapas da conversa</h4>
                  <p className="atl-modal__hint">O agente vai seguir essas etapas ao conversar com o cliente, uma pergunta de cada vez.</p>
                  {perguntasEditaveis(agente.funil).length === 0 ? (
                    <div className="atl-empty-dash">
                      <strong>O caminho que a conversa vai seguir</strong>
                      <p>
                        As etapas organizam o atendimento na ordem que faz sentido: dar boas-vindas, entender a necessidade e
                        encaminhar. O agente segue esse roteiro em cada conversa.
                      </p>
                    </div>
                  ) : (
                    perguntasEditaveis(agente.funil).map((p, i) => (
                      <div key={i} className="atl-etapa">
                        <div className="atl-etapa__head">
                          <span>Etapa {i + 1}</span>
                          <button
                            type="button"
                            className="atl-btn is-ghost is-sm"
                            aria-label="Remover etapa"
                            disabled={perguntasEditaveis(agente.funil).length <= 1}
                            onClick={() => {
                              const perguntas = perguntasEditaveis(agente.funil).filter((_, idx) => idx !== i);
                              setAgente({
                                ...agente,
                                funil: { ...normalizeFunil(agente.funil), perguntas: perguntas.length ? perguntas : [''] },
                              });
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <label>
                          <span>Objetivo dessa etapa</span>
                          <input
                            maxLength={240}
                            value={p}
                            placeholder={i === 0 ? 'Ex.: Qual é o nome da loja?' : 'Exemplo: Inicie a conversa se apresentando'}
                            onChange={(e) => {
                              const perguntas = [...perguntasEditaveis(agente.funil)];
                              perguntas[i] = e.target.value;
                              setAgente({ ...agente, funil: { ...normalizeFunil(agente.funil), perguntas } });
                            }}
                          />
                        </label>
                      </div>
                    ))
                  )}
                  <button
                    type="button"
                    className="atl-btn is-ghost is-sm"
                    disabled={perguntasEditaveis(agente.funil).length >= 12}
                    onClick={() => {
                      const perguntas = [...perguntasEditaveis(agente.funil), ''];
                      setAgente({ ...agente, funil: { ...normalizeFunil(agente.funil), perguntas } });
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" /> Nova etapa
                  </button>
                  <label>
                    <span>Está qualificado quando</span>
                    <input
                      maxLength={500}
                      value={normalizeFunil(agente.funil).criterio}
                      placeholder="Ex.: informou nome da loja, cidade e nicho (noivas, festas ou os dois)"
                      onChange={(e) => setAgente({ ...agente, funil: { ...normalizeFunil(agente.funil), criterio: e.target.value } })}
                    />
                  </label>
                </>
              ) : null}

              {agenteAba === 'ativacao' ? (
                <div className="atl-designer-split">
                  <div>
                    <h4>Quando o agente deve responder?</h4>
                    <p className="atl-modal__hint">Escolha em quais situações o agente entra em ação. As mudanças entram ao salvar.</p>
                    <button
                      type="button"
                      className={`atl-choice is-block${agente.auto_responder ? ' is-on' : ''}`}
                      onClick={() => setAgente({ ...agente, auto_responder: !agente.auto_responder })}
                    >
                      <strong>
                        Receber uma nova mensagem
                        <em className="atl-pill">Recomendado</em>
                      </strong>
                      <span>O agente responde automaticamente a cada nova mensagem do WhatsApp da loja.</span>
                    </button>
                    <label>
                      <span>Setores (vazio = todos)</span>
                      <Checks items={base.setores} value={agente.setor_ids} onChange={(setor_ids) => setAgente({ ...agente, setor_ids })} empty="A loja não tem setores." />
                    </label>
                    <p className="atl-info">
                      Nasce desligado. Ligado, responde cada mensagem nova até a equipe assumir, clicar em Passar para
                      atendente ou finalizar. Follow-up só dispara com este interruptor ligado. Nada vai sozinho para o
                      WhatsApp enquanto estiver desligado.
                    </p>
                  </div>
                  <div>
                    <h4>Converse com seu agente</h4>
                    {agente.id ? (
                      <AreaDeTeste
                        compact
                        clienteId={clienteId}
                        agentes={agentes.filter((a) => a.id === agente.id)}
                        setores={base.setores}
                      />
                    ) : (
                      <div className="atl-empty-dash">
                        <strong>Salve o agente para conversar e testar aqui.</strong>
                        <p>Nada vai para o WhatsApp, o lead real não muda e não dispara CAPI.</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
            {error ? <p className="atl-warn">{error}</p> : null}
            <footer className="atl-designer__foot">
              <button
                type="button"
                className="atl-btn is-ghost"
                disabled={STEPS_AGENTE.findIndex((s) => s[0] === agenteAba) <= 0}
                onClick={() => {
                  const idx = STEPS_AGENTE.findIndex((s) => s[0] === agenteAba);
                  if (idx > 0) setAgenteAba(STEPS_AGENTE[idx - 1][0]);
                }}
              >
                Voltar
              </button>
              <div className="atl-row">
                {STEPS_AGENTE.findIndex((s) => s[0] === agenteAba) < STEPS_AGENTE.length - 1 ? (
                  <>
                    <button type="button" className="atl-btn is-ghost" disabled={saving} onClick={salvarAgente}>
                      {saving ? 'Salvando…' : 'Salvar'}
                    </button>
                    <button
                      type="button"
                      className="atl-btn"
                      onClick={() => {
                        if (agenteAba === 'perfil' && !String(agente.nome || '').trim()) {
                          return setError('Informe o nome do agente.');
                        }
                        setError('');
                        const idx = STEPS_AGENTE.findIndex((s) => s[0] === agenteAba);
                        setAgenteAba(STEPS_AGENTE[idx + 1][0]);
                      }}
                    >
                      Avançar
                    </button>
                  </>
                ) : (
                  <button type="button" className="atl-btn" disabled={saving} onClick={salvarAgente}>
                    {saving ? 'Salvando…' : 'Salvar agente'}
                  </button>
                )}
              </div>
            </footer>
          </div>
        </div>
      ) : null}

      {baseEdit ? (
        <EditModal
          title={baseEdit.id ? `Editar ${baseEdit.nome || 'base'}` : 'Nova base de conhecimento'}
          saving={saving}
          wide
          onCancel={fechar}
          onSave={() => {
            const nome = String(baseEdit.nome || '').trim();
            if (!nome) return setError('Informe o nome da base.');
            const row = { id: baseEdit.id, nome, conteudo: String(baseEdit.conteudo || '') };
            if (!baseEdit.id) row.created_by = userId;
            salvar('cliente_atend_ia_bases', row);
          }}
        >
          <label>
            <span>Nome</span>
            <input autoFocus maxLength={80} value={baseEdit.nome} placeholder="Ex.: Horários e endereço" onChange={(e) => setBaseEdit({ ...baseEdit, nome: e.target.value })} />
          </label>
          <label>
            <span>Conteúdo</span>
            <textarea
              rows={12}
              maxLength={BASE_MAX}
              value={baseEdit.conteudo}
              placeholder="Cole aqui o texto que o agente pode usar."
              onChange={(e) => setBaseEdit({ ...baseEdit, conteudo: e.target.value })}
            />
          </label>
          <p className="atl-modal__hint">
            {(baseEdit.conteudo || '').length.toLocaleString('pt-BR')} de {BASE_MAX.toLocaleString('pt-BR')} caracteres.
          </p>
          {error ? <p className="atl-warn">{error}</p> : null}
        </EditModal>
      ) : null}
    </>
  );
}
