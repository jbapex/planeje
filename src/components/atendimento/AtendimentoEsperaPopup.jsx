import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, X } from 'lucide-react';
import { buildConversasUrl } from '@/lib/conversasRoutes';
import { useAvisosGrupoEspera } from '@/hooks/useAvisosGrupoEspera';
import './AtendimentoEsperaPopup.css';

const FECHADO_PREFIX = 'planeje-aviso-espera-fechado';

function chavePainel(clienteId) {
  return `${FECHADO_PREFIX}:painel:${clienteId}`;
}

function painelAdiado(clienteId, nowMs) {
  try {
    const until = Number(sessionStorage.getItem(chavePainel(clienteId)));
    return Number.isFinite(until) && nowMs < until;
  } catch {
    return false;
  }
}

function adiarPainel(clienteId, repetirMinutos) {
  const minutos = Math.max(1, Number(repetirMinutos) || 10);
  try {
    sessionStorage.setItem(chavePainel(clienteId), String(Date.now() + minutos * 60000));
  } catch {
    /* sessão privada */
  }
}

export default function AtendimentoEsperaPopup() {
  const navigate = useNavigate();
  const { avisos, config, total, clienteId, nowMs } = useAvisosGrupoEspera();
  const [fechados, setFechados] = useState(0);

  const visiveis = avisos.slice(0, 8);
  const restantes = Math.max(0, Math.max(avisos.length, total) - visiveis.length);
  const adiado = painelAdiado(clienteId, nowMs) || fechados < 0;

  if (adiado || !visiveis.length) return null;

  const fechar = () => {
    adiarPainel(clienteId, config.repetirMinutos);
    setFechados((n) => n + 1);
  };

  const abrir = (aviso) => {
    navigate(buildConversasUrl({
      statusTab: aviso.status,
      chatJid: aviso.chatJid,
      clienteId: aviso.clienteId,
    }));
  };

  return (
    <div
      className="atendimento-espera-popup pointer-events-none fixed bottom-4 right-4 z-40 flex w-[min(100vw-2rem,22rem)] justify-end"
      role="status"
    >
      <div className="pointer-events-auto w-full rounded-2xl border border-amber-300 bg-white shadow-xl">
        <div className="flex items-start gap-2 border-b border-amber-100 px-4 py-3">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-950">Grupo sem resposta</p>
            <p className="text-xs text-amber-800">
              {restantes > 0
                ? `As mais atrasadas. Há mais ${restantes} na fila. A cobrança volta até alguém responder.`
                : 'A cobrança volta até alguém da equipe responder.'}
            </p>
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-amber-900 hover:bg-amber-50"
            aria-label="Fechar aviso"
            onClick={fechar}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <ul className="max-h-80 overflow-y-auto p-2">
          {visiveis.map((aviso) => (
            <li key={aviso.id}>
              <button
                type="button"
                className="w-full rounded-xl px-3 py-2 text-left hover:bg-amber-50"
                onClick={() => abrir(aviso)}
              >
                <p className="truncate text-sm font-medium text-slate-900">{aviso.nome}</p>
                <p className="text-sm text-amber-900">Há {aviso.tempo} sem resposta</p>
                <p className="text-xs text-slate-500">{aviso.responsavel}</p>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
