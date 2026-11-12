import './style.css';
import './brand.css';
import { createWorld } from './vendor/habblaud/client/src/world';
import { setLocale } from './vendor/habblaud/shared/i18n';
import { createSnapshot, departments, people, initialTasks, statusLabels, type DemoTask } from './fixture';

setLocale('pt-BR');
const app = document.querySelector<HTMLDivElement>('#app')!;
const canvas = document.querySelector<HTMLCanvasElement>('#world')!;
let tasks: DemoTask[] = structuredClone(initialTasks);
let department: string | null = null;
let person: string | null = null;
let panelTab = 'summary';
let proposalOpen = false;
let materialReady = false;
let mobilePanel = false;
let rev = 1;
const subscribers = new Set<() => void>();
// Presentation-only adapter. It never connects to Habblaud sessions or Planeje APIs.
const store = {
  snapshot: createSnapshot(tasks),
  on: (_event: string, callback: () => void) => { subscribers.add(callback); return () => subscribers.delete(callback); },
};
// The renderer's runtime contract is only snapshot + on('snapshot').
const world = createWorld(canvas, store as Parameters<typeof createWorld>[1]);
world.setOptions({ theme: 'none', daylight: 'day', dayNight: false, liveliness: 'calm', showNames: true, bubbles: 'important', followSelected: false });

const icon = (name: string, size = 18) => {
  const paths: Record<string, string> = {
    office: '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 10h.01M15 10h.01M9 14h.01M15 14h.01M10 21v-4h4v4"/>',
    team: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-3-5"/>',
    task: '<rect x="4" y="4" width="16" height="17" rx="3"/><path d="M9 3h6v4H9zM8 12l2 2 5-4M8 18h8"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    focus: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><circle cx="12" cy="12" r="3"/>',
    spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.spark}</svg>`;
};
const selectedTasks = () => tasks.filter(t => person ? t.owner === person : department ? people.find(p => p.id === t.owner)?.department === department : true);
const personById = (id: string) => people.find(p => p.id === id)!;
const deptById = (id: string) => departments.find(d => d.id === id)!;

function taskCard(t: DemoTask) {
  const p = personById(t.owner);
  return `<article class="task-card ${t.status}"><div class="task-meta"><span>${t.client} <span class="task-id">· ${t.id}</span></span><span class="task-due">${t.due}</span></div><h4>${t.title}</h4><p>${t.note}</p><div class="task-bottom"><button class="task-owner" data-person="${p.id}" aria-label="Ver agente de ${p.name}"><span class="mini-avatar" style="--accent:${deptById(p.department).color}">${p.initials}</span>${p.name}</button><span class="status ${t.status}"><i></i>${statusLabels[t.status]}</span></div></article>`;
}

function proposal() {
  if (person === 'leo') return { heading: 'Preparar a revisão semanal com os aprendizados', text: 'O agente do Leo acompanha a revisão da Oliva e reúne o que precisa estar pronto para a conversa da semana.', steps: ['Conferir os resultados disponíveis da Oliva.', 'Registrar os aprendizados na revisão semanal.', 'Propor os próximos testes sem alterar a campanha automaticamente.'] };
  if (person === 'rui') return { heading: 'Adaptar as peças mantendo a campanha consistente', text: 'O agente do Rui organiza as adaptações para stories da Oliva e confere o que depende da identidade já definida.', steps: ['Conferir a versão aprovada da identidade.', 'Organizar os formatos de stories na tarefa existente.', 'Apresentar o material para revisão antes da entrega.'] };
  if (materialReady && (person === 'bia' || department === 'design')) return { heading: 'O criativo foi aprovado. A próxima peça pode avançar.', text: 'No exemplo, a Bia concluiu o criativo da Aurora. O agente da Ana reconheceu a liberação e o agente da Bia pode reorganizar a fila.', steps: ['Registrar a aprovação no criativo existente.', 'Mostrar a liberação para o agente da Ana.', 'Propor o carrossel da Oliva como próximo trabalho da Bia.'] };
  if (person === 'bia' || department === 'design') return { heading: 'Destravar a aprovação antes de abrir outra frente', text: 'O criativo da Aurora segura a campanha da Ana. O agente da Bia daria prioridade a esse retorno e mostraria o impacto ao agente da Ana.', steps: ['Destacar a aprovação da versão 02 na fila da Bia.', 'Manter a campanha da Ana vinculada à mesma dependência.', 'Quando o material for aprovado, atualizar a prioridade da campanha.'] };
  if (person === 'caio' || person === 'luna' || department === 'editing') return { heading: 'Fechar as revisões que vencem hoje', text: 'O agente de Edição identifica o que já está próximo de terminar e organiza a fila de cada editor pelos prazos e dependências.', steps: ['Revisar as legendas do reel da Oliva.', 'Concluir os cortes da Aurora antes de iniciar novas edições.', 'Mostrar os próximos trabalhos de cada pessoa.'] };
  return { heading: materialReady ? 'O material chegou. A campanha pode avançar.' : 'Resolver uma dependência destrava duas pessoas', text: materialReady ? 'No exemplo, a aprovação do criativo libera a campanha da Ana. A tarefa continua com a mesma responsável.' : 'O agente da Ana percebe que falta o criativo. O agente da Bia sabe qual aprovação está pendente. O Atlas junta as duas informações para você decidir.', steps: ['Relacionar a campanha ao criativo da Aurora.', 'Sinalizar o bloqueio para os dois agentes.', 'Propor o próximo passo conforme as regras que você definir.'] };
}

function render() {
  const current = person ? personById(person) : null;
  const d = department ? deptById(department) : null;
  const list = selectedTasks();
  const blocked = list.filter(t => t.status === 'blocked').length;
  const visiblePeople = people.filter(p => !department || p.department === department);
  const suggestion = proposal();
  app.innerHTML = `
    <header class="topbar">
      <button class="brand" data-action="overview" aria-label="Atlas, visão geral"><picture class="planeje-logo"><source media="(max-width: 1000px)" srcset="/assets/brand/simbolo.png"><img src="/assets/brand/logo-horizontal.png" alt="Planeje" draggable="false"></picture><span class="brand-module">Atlas<small>ESCRITÓRIO DA AGÊNCIA</small></span></button>
      <nav class="main-nav" aria-label="Visualização"><button class="nav-item ${panelTab === 'summary' ? 'active' : ''}" data-tab="summary">${icon('office')} Escritório</button><button class="nav-item ${panelTab === 'tasks' ? 'active' : ''}" data-action="all-tasks">${icon('task')} Todas as tarefas <b>${tasks.length}</b></button></nav>
      <div class="preview-label"><span></span>Prévia local</div><div class="owner-avatar" title="Visão do gestor">JB</div>
    </header>
    <div class="demo-ribbon">Dados fictícios · agentes simulados <span>Uma proposta de funcionamento para o Atlas</span></div>
    <aside class="sidebar">
      <div class="section-label">SEU ESCRITÓRIO <span>03</span></div>
      <button class="department all ${!department ? 'selected' : ''}" data-action="overview">${icon('office')}<span>Visão geral<small>Todas as áreas</small></span></button>
      ${departments.map(area => `<button class="department ${department === area.id ? 'selected' : ''}" data-department="${area.id}" style="--accent:${area.color}"><span class="area-icon">${area.mark}</span><span>${area.name}<small>${area.brief}</small></span><span class="count">${people.filter(p => p.department === area.id).length}</span></button>`).join('')}
      <div class="sidebar-divider"></div><div class="section-label">QUEM OS AGENTES ACOMPANHAM <span>${visiblePeople.length.toString().padStart(2, '0')}</span></div>
      <div class="people-list">${visiblePeople.map(p => {
        const area = deptById(p.department);
        const hasBlock = tasks.some(t => t.owner === p.id && t.status === 'blocked');
        return `<button class="person ${person === p.id ? 'selected' : ''}" data-person="${p.id}"><span class="avatar" style="--accent:${area.color}">${p.initials}<i class="${hasBlock ? 'attention' : ''}"></i></span><span>${p.name}<small>${p.role}</small></span><span class="person-chevron">›</span></button>`;
      }).join('')}</div>
      <div class="sidebar-note">${icon('spark')}<p>Um agente por pessoa.<br><strong>O Atlas conecta as áreas.</strong></p></div>
      <div class="source-credit">Visual adaptado de <a href="https://github.com/marmottajr/habblaud" target="_blank" rel="noopener noreferrer">Habblaud ↗</a><br>Código MIT · <a href="/LICENSE.txt" target="_blank">licença</a></div>
    </aside>
    <main class="map-label"><div class="eyebrow">${d ? 'SALA DE ' + d.name.toLocaleUpperCase('pt-BR') : 'VISÃO DO GESTOR'}</div><h1>${current ? `O agente de ${current.name}` : d ? d.name : 'Sua agência, num só lugar.'}</h1><p>${current ? `${current.agent} acompanha tarefas e prioridades de ${current.name}.` : d ? d.note : 'Pessoas, tarefas e dependências conectadas.'}</p></main>
    <div class="map-tools" aria-label="Controles do escritório"><button data-action="zoom-in" aria-label="Aproximar">+</button><button data-action="zoom-out" aria-label="Afastar">−</button><button data-action="frame" aria-label="Enquadrar escritório">${icon('focus')}</button></div>
    <div class="map-hint">Arraste para explorar <span>·</span> Clique nas salas e nos agentes</div>
    <button class="mobile-open" data-action="toggle-panel">${icon('task')} ${current ? `Ver agente de ${current.name}` : 'Ver acompanhamento'} ${icon('arrow', 16)}</button>
    <aside class="detail-panel ${mobilePanel ? 'mobile-expanded' : ''}" aria-label="Acompanhamento do Atlas">
      <button class="mobile-close" data-action="toggle-panel" aria-label="Fechar acompanhamento">${icon('close')}</button>
      <div class="panel-heading"><span class="atlas-symbol"><img src="/assets/brand/simbolo.png" alt="" draggable="false"></span><div><h2>${current ? current.agent : d ? `Atlas · ${d.name}` : 'Atlas · Operação'}</h2><p>${current ? `Acompanhando ${current.name}` : d ? 'Conectando os agentes da sala' : 'Conectando as três áreas'}</p></div><span class="simulation-tag">EXEMPLO</span></div>
      <div class="metrics"><div><strong>${list.length.toString().padStart(2, '0')}</strong><span>Tarefas</span></div><div><strong>${blocked.toString().padStart(2, '0')}</strong><span>Bloqueadas</span></div><div><strong>${(current ? 1 : visiblePeople.length).toString().padStart(2, '0')}</strong><span>${current ? 'Pessoa' : 'Pessoas'}</span></div></div>
      <div class="panel-tabs" role="tablist" aria-label="Acompanhamento"><button role="tab" aria-selected="${panelTab === 'summary'}" data-tab="summary">Acompanhamento</button><button role="tab" aria-selected="${panelTab === 'tasks'}" data-tab="tasks">Tarefas <span>${list.length}</span></button></div>
      <div class="panel-content" tabindex="0" aria-label="Conteúdo do acompanhamento">
      ${panelTab === 'tasks' ? `<div class="content-title">${current ? `Fila de ${current.name}` : d ? `Tarefas de ${d.name}` : 'Todas as tarefas do exemplo'}</div><div class="task-list">${list.map(taskCard).join('')}</div>` : `
        ${!current ? `<div class="panel-roster"><div class="section-label">${d ? 'PESSOAS DESTA SALA' : 'ESCOLHA QUEM ACOMPANHAR'}</div><div>${visiblePeople.map(p => `<button data-person="${p.id}"><span class="mini-avatar" style="--accent:${deptById(p.department).color}">${p.initials}</span>${p.name}</button>`).join('')}</div></div>` : ''}
        <div class="section-label">${materialReady ? 'CENÁRIO ATUALIZADO' : 'O QUE PEDE ATENÇÃO'}</div>
        <article class="insight ${materialReady ? 'resolved' : ''}"><div class="insight-kicker"><span>${materialReady ? icon('check', 15) : '!'}</span>${materialReady ? 'Dependência resolvida no exemplo' : 'Próximo passo sugerido'}</div><h3>${suggestion.heading}</h3><p>${suggestion.text}</p><button class="text-button" data-action="proposal">${proposalOpen ? 'Recolher proposta' : 'Ver proposta do agente'} ${icon('arrow', 16)}</button>${proposalOpen ? `<ol class="proposal-steps">${suggestion.steps.map(step => `<li>${step}</li>`).join('')}</ol><p class="rule-note">Exemplo de proposta. As suas regras de criação e organização ainda serão definidas.</p>` : ''}</article>
        <div class="content-title">${current ? 'Tarefas em foco' : 'Conexão entre as áreas'}<button class="subtle-button" data-tab="tasks">Ver ${list.length} tarefas ${icon('arrow', 14)}</button></div>
        ${!current && !d ? `<div class="dependency"><span class="dependency-icon design">✦</span><div><strong>Design → Tráfego</strong><small>Bia ${materialReady ? 'liberou' : 'prepara'} o material da Ana</small></div><span class="dependency-state ${materialReady ? 'ready' : ''}">${materialReady ? 'Liberado' : 'Pendente'}</span></div>` : ''}
        <div class="task-list">${list.slice(0, current ? 3 : 2).map(taskCard).join('')}</div>
        <div class="simulation-card"><span>EXPERIMENTE O FLUXO</span><h4>${materialReady ? 'As duas filas foram atualizadas.' : 'E quando a Bia aprovar o criativo?'}</h4><p>${materialReady ? 'No exemplo, o criativo foi concluído e a campanha ficou pronta para começar.' : 'Veja o agente da Ana reconhecer que a campanha pode avançar.'}</p><button class="primary-button" data-action="simulate">${materialReady ? 'Recomeçar exemplo' : 'Simular material aprovado'} ${icon(materialReady ? 'arrow' : 'check', 16)}</button><small>Simulação nesta página · sem ação real</small></div>
      `}
      </div><div class="panel-footer"><span></span>Cenário fictício · Visual <a href="https://github.com/marmottajr/habblaud" target="_blank" rel="noopener noreferrer">Habblaud</a> · <a href="/LICENSE.txt" target="_blank">MIT</a></div>
    </aside>
    <div class="event-toast" role="status" aria-live="polite">${icon(materialReady ? 'check' : 'spark', 17)}<span>${materialReady ? '<strong>Design → Tráfego</strong> Criativo aprovado. Ana pode avançar.' : '<strong>Um exemplo conectado:</strong> o trabalho da Bia impacta a fila da Ana.'}</span></div>
  `;
  updateInsets();
}

function updateInsets() {
  const narrow = innerWidth <= 1000;
  const sidebarWidth = app.querySelector('.sidebar')?.getBoundingClientRect().width ?? 244;
  const panelWidth = app.querySelector('.detail-panel')?.getBoundingClientRect().width ?? 350;
  world.setViewInsets?.(narrow ? { top: 235, bottom: 175, left: 10, right: 10 } : { top: 225, bottom: 95, left: sidebarWidth + 20, right: panelWidth + 40 });
}
function selectPerson(id: string, move = true) {
  const p = personById(id);
  person = id; department = p.department; panelTab = 'summary'; proposalOpen = false;
  render();
  if (move) world.select({ type: 'agent', id }, { focus: true });
}
function selectDepartment(id: string, move = true) {
  department = id; person = null; panelTab = 'summary'; proposalOpen = false;
  render();
  if (move) world.select({ type: 'room', id }, { focus: true });
}
app.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!button) return;
  if (button.dataset.person) { selectPerson(button.dataset.person); return; }
  if (button.dataset.department) { selectDepartment(button.dataset.department); return; }
  if (button.dataset.tab) { panelTab = button.dataset.tab; render(); return; }
  switch (button.dataset.action) {
    case 'overview': person = null; department = null; panelTab = 'summary'; proposalOpen = false; mobilePanel = false; render(); world.select(null); world.overview(); break;
    case 'all-tasks': person = null; department = null; panelTab = 'tasks'; mobilePanel = innerWidth <= 1000; render(); world.select(null); world.overview(); break;
    case 'zoom-in': world.zoomBy(1.25); break;
    case 'zoom-out': world.zoomBy(0.8); break;
    case 'frame': world.overview(); break;
    case 'toggle-panel': mobilePanel = !mobilePanel; render(); break;
    case 'proposal': proposalOpen = !proposalOpen; render(); break;
    case 'simulate':
      materialReady = !materialReady;
      tasks = structuredClone(initialTasks);
      if (materialReady) {
        Object.assign(tasks.find(t => t.id === 'EX-03')!, { status: 'done', note: 'Versão 02 aprovada no cenário fictício.' });
        Object.assign(tasks.find(t => t.id === 'EX-01')!, { status: 'todo', note: 'Material aprovado. A campanha pode ser preparada pela Ana.' });
      }
      store.snapshot = createSnapshot(tasks, ++rev);
      subscribers.forEach(callback => callback());
      render();
      break;
  }
});
world.onSelect(selection => {
  if (!selection) return;
  if (selection.type === 'agent' && people.some(p => p.id === selection.id) && person !== selection.id) selectPerson(selection.id, false);
  if (selection.type === 'room' && departments.some(d => d.id === selection.id) && (department !== selection.id || person)) selectDepartment(selection.id, false);
});
addEventListener('resize', updateInsets);
addEventListener('pagehide', () => world.destroy(), { once: true });
render();
world.overview();
