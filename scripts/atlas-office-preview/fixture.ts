import type { OfficeSnapshot, AgentInfo } from './vendor/habblaud/shared/types';

export const departments = [
  { id: 'traffic', name: 'Tráfego', mark: '↗', color: '#c94a2e', brief: 'Campanhas e resultados', agent: 'Nilo', note: 'Uma campanha depende do material de Design.' },
  { id: 'design', name: 'Design', mark: '✦', color: '#9333ea', brief: 'Criativos e identidade', agent: 'Íris', note: 'Uma aprovação está segurando a próxima entrega.' },
  { id: 'editing', name: 'Edição', mark: '▶', color: '#7c3aed', brief: 'Vídeos e finalização', agent: 'Cora', note: 'Revisões organizadas antes das novas edições.' },
];
export const people = [
  { id: 'ana', name: 'Ana', role: 'Gestora de tráfego', department: 'traffic', agent: 'Nilo / Ana', seed: 13, initials: 'AN', focus: 'Campanhas da Aurora', look: 'f' as const },
  { id: 'leo', name: 'Leo', role: 'Gestor de tráfego', department: 'traffic', agent: 'Nilo / Leo', seed: 51, initials: 'LE', focus: 'Revisão da semana', look: 'm' as const },
  { id: 'bia', name: 'Bia', role: 'Designer', department: 'design', agent: 'Íris / Bia', seed: 29, initials: 'BI', focus: 'Criativos da Aurora', look: 'f' as const },
  { id: 'rui', name: 'Rui', role: 'Designer', department: 'design', agent: 'Íris / Rui', seed: 109, initials: 'RU', focus: 'Peças da Oliva', look: 'm' as const },
  { id: 'caio', name: 'Caio', role: 'Editor de vídeo', department: 'editing', agent: 'Cora / Caio', seed: 74, initials: 'CA', focus: 'Reels da Oliva', look: 'm' as const },
  { id: 'luna', name: 'Luna', role: 'Editora de vídeo', department: 'editing', agent: 'Cora / Luna', seed: 23, initials: 'LU', focus: 'Cortes da Aurora', look: 'f' as const },
];
export type DemoTask = { id: string; owner: string; client: string; title: string; due: string; status: 'doing' | 'blocked' | 'todo' | 'done'; note: string; dependsOn?: string };
export const initialTasks: DemoTask[] = [
  { id: 'EX-01', owner: 'ana', client: 'Aurora', title: 'Publicar campanha de lançamento', due: 'Hoje, 16h', status: 'blocked', note: 'Aguarda o criativo aprovado da Bia.', dependsOn: 'EX-03' },
  { id: 'EX-02', owner: 'ana', client: 'Oliva', title: 'Revisar distribuição da verba', due: 'Hoje, 11h', status: 'doing', note: 'Conferir os resultados antes de propor ajustes.' },
  { id: 'EX-03', owner: 'bia', client: 'Aurora', title: 'Aprovar criativo de lançamento', due: 'Hoje, 14h', status: 'blocked', note: 'Falta o retorno sobre a versão 02.' },
  { id: 'EX-04', owner: 'bia', client: 'Oliva', title: 'Preparar carrossel da semana', due: 'Amanhã', status: 'todo', note: 'Começar depois de resolver o criativo da Aurora.' },
  { id: 'EX-05', owner: 'caio', client: 'Oliva', title: 'Finalizar reel de apresentação', due: 'Hoje, 15h', status: 'doing', note: 'Revisão de legendas antes da exportação.' },
  { id: 'EX-06', owner: 'leo', client: 'Oliva', title: 'Preparar revisão semanal', due: 'Amanhã', status: 'doing', note: 'Reunir aprendizados da última semana.' },
  { id: 'EX-07', owner: 'rui', client: 'Oliva', title: 'Adaptar peças para stories', due: 'Amanhã', status: 'doing', note: 'Usar a identidade da campanha atual.' },
  { id: 'EX-08', owner: 'luna', client: 'Aurora', title: 'Revisar cortes do depoimento', due: 'Hoje, 17h', status: 'doing', note: 'Separar os trechos enviados para aprovação.' },
  { id: 'EX-09', owner: 'caio', client: 'Aurora', title: 'Organizar arquivos da captação', due: 'Amanhã', status: 'todo', note: 'Pastas por data e por formato.' },
];
export const statusLabels = { doing: 'Em andamento', blocked: 'Bloqueada', todo: 'A fazer', done: 'Concluída' };

export function createSnapshot(tasks: DemoTask[], rev = 1): OfficeSnapshot {
  const now = Date.now();
  const agents: AgentInfo[] = people.map((p) => {
    const own = tasks.filter(t => t.owner === p.id);
    const blocked = own.find(t => t.status === 'blocked');
    const current = blocked ?? own.find(t => t.status === 'doing') ?? own[0];
    const activity = { id: `activity-${p.id}-${rev}`, kind: blocked ? 'wait' as const : 'plan' as const, icon: blocked ? '⏳' : '📋', text: blocked ? 'Dependência identificada' : 'Organizando prioridades', at: now };
    return {
      id: p.id, kind: 'main', roomId: p.department, name: p.agent, look: p.look,
      role: `Agente que acompanha ${p.name}`, title: p.focus, sessionId: `fictional-${p.id}`, account: 'demo',
      status: blocked ? 'waiting' : 'working', waitingFor: blocked ? blocked.note : undefined,
      activity, recent: [activity], tasks: own.map(t => ({ id: t.id, title: t.title, status: t.status === 'done' ? 'completed' : t.status === 'doing' ? 'in_progress' : 'pending' })),
      startedAt: now - 600000, lastEventAt: now, statusSince: now - 120000,
      stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 }, seed: p.seed,
    };
  });
  return {
    rev, serverTime: now, agents,
    rooms: departments.map((d, i) => ({ id: d.id, name: d.name, path: `exemplo/${d.id}`, slot: i, seed: 31 + i * 47, createdAt: now - 600000 })),
    accounts: [{ id: 'demo', short: 'IA', name: 'Agentes simulados', color: '#9333ea', configDir: '', sessions: 0, usageStatus: 'disabled' }],
    meta: { demo: true, sources: [], startedAt: now, version: 'atlas-office-preview-1', terminal: false, messages: false, updates: { state: 'off', available: false } },
  };
}
