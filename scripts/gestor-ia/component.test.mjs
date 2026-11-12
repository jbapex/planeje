import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';
const qa='/tmp/planeje-crm-ui-qa',require=createRequire(path.join(qa,'package.json'));
const React=require('react'),{act,create}=require('react-test-renderer');
const scratch=await mkdtemp(path.join(qa,'gestor-'));
const entry=path.resolve('src/components/gestor-ia/GestorIaWorkspace.jsx');
assert.ok(existsSync(entry),'Ambiente novo do Gestor ainda não existe');
const realData=path.resolve('src/components/gestor-ia/gestorIaAccess.js');
const fixtureData=`export {canSeeCampaignGoals,canUseGestorIa,GESTOR_PERMISSION_FIELDS} from ${JSON.stringify(realData)};
export const loadGestorPortfolio=(db,p)=>globalThis.__gestor.loadPortfolio(p);
export const loadGestorGoalReadings=(db,ids,period)=>globalThis.__gestor.loadGoalReadings?.(ids,period) ?? {};
export const loadGestorMetrics=(db,p)=>globalThis.__gestor.loadMetrics(p);
export const loadGestorAccountsOverview=(db,p)=>globalThis.__gestor.loadOverview(p);
export const prepareGestorDecisionAnalysis=(db,id,mem,account)=>globalThis.__gestor.prepareAnalysis(id,mem,account);
export const loadGestorDecisionAnalysis=(db,id,mem,scope)=>globalThis.__gestor.analyze(id,mem,scope);
export const loadGestorReviews=(db,p)=>globalThis.__gestor.loadReviews(p);`;
const fixtureAuth='export const useAuth=()=>({profile:globalThis.__gestor.profile,canViewField:globalThis.__gestor.canViewField});';
const fixtureModules='export const useModuleSettings=()=>({moduleSettings:globalThis.__gestor.modules,loading:false});';
const files={
  '@/contexts/SupabaseAuthContext':fixtureAuth,
  '@/contexts/ModuleSettingsContext':fixtureModules,
  '@/lib/customSupabaseClient':'export const supabase={functions:{invoke:(...args)=>globalThis.__gestor.invoke(...args)}};export const supabaseUrl="https://fixture.invalid";export const supabaseAnonKey="fixture-key";',
  '@/components/pages/ContatosRastreamentoPage':`import React from 'react';
    import { useLocation } from 'react-router-dom';
    export default function Rastreamento() { return <output data-tracking>{useLocation().search}</output>; }`,
  './gestorIaData':fixtureData,
  './gestorIaMediaGoalData':`export * from ${JSON.stringify(path.resolve('src/components/gestor-ia/gestorIaMediaGoalData.js'))};
    export const loadMediaGoals=(_db,id)=>globalThis.__gestor.loadMediaGoals?.(id) || [];`,
};
await build({stdin:{contents:`export {default as Workspace} from ${JSON.stringify(entry)};export {MemoryRouter,Routes,Route} from 'react-router-dom';`,resolveDir:process.cwd(),loader:'jsx'},outfile:path.join(scratch,'ui.cjs'),bundle:true,format:'cjs',platform:'node',external:['react'],loader:{'.css':'empty','.jpg':'dataurl','.png':'dataurl'},define:{'import.meta.env':'{"VITE_GESTOR_IA_DECISIONS_ENABLED":"true"}'},plugins:[{name:'isolated',setup(b){
  b.onResolve({filter:/.*/},a=>files[a.path]?{path:a.path,namespace:'fixture'}:null);
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:files[a.path],loader:'jsx',resolveDir:process.cwd()}));
  b.onResolve({filter:/^@\//},a=>{const f=path.resolve('src',a.path.slice(2));return {path:existsSync(f)?f:existsSync(f+'.jsx')?f+'.jsx':f+'.js'};});
}}]});
const {Workspace,MemoryRouter,Routes,Route}=require(path.join(scratch,'ui.cjs'));
const period={since:'2026-11-01',until:'2026-11-06'};
const client=id=>({id,empresa:id==='a'?'Empresa A':'Empresa B',nicho:'Nicho '+id,sobre_empresa:'Contexto '+id,publico_alvo:'Público '+id,produtos_servicos:'Oferta '+id,tom_de_voz:'Tom '+id,objetivo_meta:'mensagens',limite_meta:900,meta_custo_mensagem:7,meta_custo_compra:40,roas_alvo:4,gestorName:'Gestora '+id,metaAccounts:[{meta_account_id:'act_'+id,meta_account_name:'Conta '+id}],googleAccounts:[],tasks:[{id:'t'+id,title:'Tarefa '+id,status:'pending',due_date:'2026-11-02'}],meta_resumo:{period,syncedAt:'2026-11-06T10:00:00Z',spend:100,messages:10,leads:0,purchases:0}});
let renderer,checks=0;
const content=n=>typeof n==='string'?n:Array.isArray(n)?n.map(content).join(' '):n?content(n.children??n.props?.children):'';
const shown=()=>content(renderer.toJSON());
const check=(v,msg)=>{assert.ok(v,msg);checks++;};
const select=id=>renderer.root.findByProps({id});
const click=async label=>{const link=renderer.root.findAllByType('a').find(n=>(n.props['aria-label']||content(n.props.children).trim())===label);assert.ok(link,label);await act(async()=>link.props.onClick({button:0,preventDefault(){},metaKey:false,altKey:false,ctrlKey:false,shiftKey:false}));};
const button=label=>renderer.root.findAllByType('button').find(n=>(n.props['aria-label']||content(n.props.children).trim().replace(/\s+/g,' '))===label);
const href=label=>renderer.root.findAllByType('a').find(n=>content(n.props.children).trim()===label)?.props.href;
const press=async label=>{assert.ok(button(label),label);await act(async()=>button(label).props.onClick());};
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const fixture=globalThis.__gestor={canViewField:()=>true,profile:{id:'staff',role:'colaborador',status:'active'},modules:{paid_traffic:true},loadPortfolio:async()=>({clients:[client('a'),client('b')],warnings:[]}),loadReviews:async({clientId})=>[{id:'r'+clientId,week_start:'2026-11-02',analysis:'Análise '+clientId,result_label:'Agendamentos',investment:100,contacts:10,results:3,finalized_at:'2026-11-03T10:00:00Z'}],loadMetrics:async()=>({fetchedAt:null}),invoke:async()=>({data:{readings:[]}})};
let overviewCalls = 0;
fixture.loadOverview = async () => { overviewCalls++; return { accounts: [] }; };
const tree=(url='/gestor-ia/metricas?cliente=a&desde=2026-11-01&ate=2026-11-06')=>React.createElement(MemoryRouter,{initialEntries:[url]},React.createElement(Routes,null,React.createElement(Route,{path:'/gestor-ia/*',element:React.createElement(Workspace)})));
const detailTree=()=>tree('/gestor-ia/clientes/a?desde=2026-11-01&ate=2026-11-06');
// Os menus fechados só precisam dos listeners de teclado do Radix neste renderer sem DOM.
globalThis.document = new EventTarget();
try{
  await act(async()=>{renderer=create(tree());});
  check(shown().includes('Modo de consulta'),'modo consulta visível');
  check(shown().includes('Empresa A')&&shown().includes('Resumo salvo'),'resumo real sem geração');
  for(const label of ['Métricas','Carteira','Decisões','Relatórios'])check(renderer.root.findAllByType('a').some(n=>content(n.props.children).trim()===label),'destino '+label);
  await click('Carteira');
  check(shown().includes('Empresa A')&&shown().includes('Empresa B')&&!shown().includes('Contexto a'),'carteira abre com a lista sem expor a ficha');
  await click('Abrir cliente Empresa A');
  check(shown().includes('Hoje, neste cliente')&&shown().includes('Resumo salvo'),'cliente abre com métricas próprias');
  await click('Contas e BM');
  check(shown().includes('Conta a')&&!shown().includes('Conta b')&&overviewCalls===1,'colaborador consulta os dados salvos das contas do cliente selecionado');
  await click('Memória');
  check(shown().includes('Memória do cliente')&&shown().includes('Janela do cliente')&&shown().includes('Resultado real')&&shown().includes('Contexto a')&&shown().includes('Público a'),'memória separa notas, portal, resultados e contexto canônico');
  await click('Próximo cliente');
  check(shown().includes('Contexto b')&&!shown().includes('Contexto a'),'contexto muda por ID');
  fixture.canViewField=(field)=>!['sobre_empresa','meta_custo_mensagem','roas_alvo','valor','meta_resumo','responsavel'].includes(field);
  await act(async()=>renderer.update(tree()));
  check(!shown().includes('Contexto b'),'campo oculto não aparece na ficha');
  check(!shown().includes('Gestora b')&&!shown().includes('900'),'visão da carteira respeita campos restritos');
  const cost=renderer.root.findAllByType('dt').find(n=>content(n.props.children)==='Meta por mensagem');
  check(content(cost.parent.findByType('dd').props.children)==='Acesso restrito','meta oculta mantém permissão por campo');
  fixture.canViewField=()=>true;fixture.modules={...fixture.modules,tasks:true};await act(async()=>renderer.update(tree()));
  await click('Decisões');check(shown().includes('Tarefa b')&&shown().includes('Tarefa registrada'),'origem explícita');
  await act(async()=>select('gestor-cliente').props.onChange({target:{value:''}}));
  check(shown().includes('Tarefa a')&&shown().includes('Tarefa b'),'quadro pode mostrar a carteira autorizada');
  await act(async()=>select('gestor-cliente').props.onChange({target:{value:'b'}}));
  let calls = 0;
  const analyzing = deferred();
  const checkedContext = 'a'.repeat(64);
  fixture.prepareAnalysis = async (id, memoryIds) => {
    assert.equal(id, 'b'); assert.deepEqual(memoryIds, []);
    return { context: checkedContext, period, source: 'summary', currency: 'BRL', syncedAt: '2026-11-07T10:00:00Z',
      metrics: { spend: 100, messages: 10 }, campaignCount: 1, memoryIncluded: 0 };
  };
  fixture.analyze = (id, memoryIds, { context }) => {
    assert.equal(id, 'b'); assert.equal(context, checkedContext); assert.deepEqual(memoryIds, []); calls++; return analyzing.promise;
  };
  await press('Analisar com IA');
  check(calls === 0, 'abrir o painel não dispara o provedor');
  check(!button('Gerar sugestões') || button('Gerar sugestões').props.disabled, 'geração aguarda conferência de contexto');
  await press('Conferir contexto');
  check(calls === 0 && shown().includes('Resumo salvo do cliente') && /1\s+campanha/.test(shown()), 'prévia informa a fonte antes de usar o provedor');
  await press('Gerar sugestões');
  check(/Analisando o resumo de\s+Empresa B/.test(shown()) && button('Analisar com IA').props.disabled, 'estado de consulta bloqueia repetição');
  const analysisFixture={period, currency:'BRL', syncedAt:'2026-11-07T10:00:00Z', suggestions:[{
    title:'Investigar captação', kind:'medicao', source:'Campanha B', why:'Há volume sem confirmação.',
    evidence:[{ key:'leads', value:0 }], steps:['Testar a captação.'], verification:'Revisar o resultado.', days:7,
  }]};
  await act(async()=>analyzing.resolve(analysisFixture));
  await press('Investigar captação');
  check(shown().includes('O que a IA olhou') && shown().includes('Testar a captação.') && shown().includes('Como verificar'), 'detalhe mostra evidência e plano');
  check(href('Preparar tarefa') === '/tasks/list/new?type=paid_traffic&client_id=b', 'sugestão abre editor canônico do cliente');
  await press('Fechar detalhe');
  await act(async()=>select('gestor-cliente').props.onChange({target:{value:'a'}}));
  check(!shown().includes('Investigar captação'),'filtrar outro cliente oculta o plano');
  await act(async()=>select('gestor-cliente').props.onChange({target:{value:'b'}}));
  await press('Investigar captação');
  await press('Dispensar nesta leitura');
  check(!shown().includes('Investigar captação') && shown().includes('Tarefa b'), 'dispensar retira só a sugestão da leitura');
  const delayedAnalysis=deferred();
  fixture.analyze=()=>delayedAnalysis.promise;
  await press('Analisar com IA');
  await press('Conferir contexto');
  await press('Gerar sugestões');
  await act(async()=>select('gestor-cliente').props.onChange({target:{value:'a'}}));
  await act(async()=>delayedAnalysis.resolve({ ...analysisFixture, suggestions:[{ ...analysisFixture.suggestions[0], title:'RESPOSTA DO CLIENTE ANTERIOR' }]}));
  check(!shown().includes('RESPOSTA DO CLIENTE ANTERIOR') && shown().includes('Tarefa a'),'resposta atrasada não atravessa troca de cliente');
  await act(async()=>select('gestor-cliente').props.onChange({target:{value:'b'}}));
  fixture.analyze = async () => { throw new Error('Servidor temporariamente indisponível.'); };
  await press('Analisar com IA');
  await press('Conferir contexto');
  await press('Gerar sugestões');
  check(shown().includes('Servidor temporariamente indisponível.') && shown().includes('Tarefa b'), 'falha fica visível sem retirar tarefas do quadro');
  fixture.analyze = async () => ({ ...analysisFixture, suggestions: [] });
  await press('Analisar com IA');
  await press('Conferir contexto');
  await press('Gerar sugestões');
  check(shown().includes('Nenhuma sugestão em aberto') && !shown().includes('Servidor temporariamente indisponível.'), 'nova leitura vazia substitui o erro');
  fixture.canViewField = field => field !== 'meta_resumo';
  await act(async()=>renderer.update(tree()));
  check(!button('Analisar com IA') && !shown().includes('Nenhuma sugestão em aberto') && shown().includes('Tarefa b'), 'revogar resumo esconde IA, preservando tarefas permitidas');
  fixture.canViewField = () => true;
  await act(async()=>renderer.update(tree()));
  await click('Relatórios');check(!shown().includes('Análise b')&&shown().includes('Agendamentos'),'relatório abre com resumo na tabela');
  await press('Abrir análise de 02/11/2026');check(shown().includes('Análise b'),'detalhe exibe a análise existente');
  await press('Evolução semanal');
  check(shown().includes('Investimento por semana')&&!shown().includes('Análise b'),'visualização de evolução troca o conteúdo');
  await press('Análises');
  check(!renderer.root.findAllByType('button').some(n=>/aprovar|concluir|gerar|enviar|salvar|conectar/i.test(content(n.props.children))),'sem ações de escrita');
  const slow=deferred();fixture.loadReviews=()=>slow.promise;
  await act(async()=>select('gestor-periodo').props.onChange({target:{value:'custom'}}));
  await act(async()=>select('gestor-desde').props.onChange({target:{value:'2026-10-01'}}));
  check(!shown().includes('Análise b'),'limpa relatório ao trocar janela');
  fixture.loadReviews=async()=>[{id:'new',week_start:'2026-11-02',analysis:'Relatório novo',result_label:'Provas'}];
  await act(async()=>select('gestor-cliente').props.onChange({target:{value:'a'}}));
  await act(async()=>slow.resolve([{id:'old',week_start:'2026-11-02',analysis:'RELATÓRIO ATRASADO'}]));
  await press('Abrir análise de 02/11/2026');
  check(shown().includes('Relatório novo')&&!shown().includes('RELATÓRIO ATRASADO'),'ignora resposta de cliente anterior');
  fixture.profile={...fixture.profile,id:'outro'};const pending=deferred();fixture.loadPortfolio=()=>pending.promise;
  await act(async()=>renderer.update(tree()));
  check(!shown().includes('Relatório novo')&&!shown().includes('Contexto a'),'sem dados do perfil anterior');
  await act(async()=>pending.resolve({clients:[],warnings:[]}));check(shown().includes('Nenhum cliente'),'vazio explícito');
  fixture.modules={paid_traffic:false};await act(async()=>renderer.update(tree()));
  check(shown().includes('Acesso ao Gestor IA indisponível'),'módulo negado');
  await act(async()=>renderer.unmount());
  fixture.modules={paid_traffic:true};fixture.profile={id:'admin',role:'admin',status:'active'};fixture.loadPortfolio=async()=>({clients:[client('a'),client('b')],warnings:[]});
  fixture.canViewField=(field)=>field!=='valor';
  const slowMeta=deferred();fixture.loadMetrics=()=>slowMeta.promise;
  await act(async()=>{renderer=create(detailTree());});
  fixture.loadMetrics=async()=>({campaigns:[],period,fetchedAt:'2026-11-06T12:00:00Z',account:{spend:55,messages:2,currency:'BRL'}});
  await click('Próximo cliente');
  await act(async()=>slowMeta.resolve({period,fetchedAt:'2026-11-06T12:00:00Z',campaigns:[{id:'old',name:'CAMPANHA ATRASADA'}],account:{spend:999,currency:'BRL'}}));
  check(!shown().includes('CAMPANHA ATRASADA')&&!shown().includes('999'),'ignora Meta atrasada');
  await click('Cliente anterior');
  check(shown().includes('CAMPANHA ATRASADA')&&shown().includes('999,00'),'a leitura atrasada reaparece só no cliente correto');
  fixture.loadMetrics=async()=>{throw new Error('Banco indisponível');};
  await press('Atualizar agora');
  check(shown().includes('Banco indisponível')&&shown().includes('999,00'),'erro mantém o último indicador e informa a falha');
  await act(async()=>renderer.unmount());
  await act(async()=>{renderer=create(tree('/gestor-ia/clientes/fora?cliente=a&tab=memoria'));});
  check(shown().includes('Cliente indisponível')&&!shown().includes('Contexto a'),'cliente adulterado não seleciona outro silenciosamente');
  await act(async()=>renderer.unmount());
  const payload=(compare,visiblePeriod=period)=>({period:visiblePeriod,exact:true,fetchedAt:'2026-11-06T12:00:00Z',
    account:{spend:300,messages:30,leads:12,purchases:3,impressions:1000,clicks:40,frequency:1.6,reach:700,currency:'BRL'},
    daily:[{date:'2026-11-01',spend:100,messages:10,leads:4,impressions:400,clicks:10},{date:'2026-11-06',spend:200,messages:20,leads:8,impressions:600,clicks:30}],
    comparison:compare?{period:{since:'2026-10-26',until:'2026-10-31'},account:{spend:150,messages:15,leads:6,impressions:1000,clicks:20,frequency:1.2,currency:'BRL'},daily:[{date:'2026-10-26',spend:150,messages:15,leads:6}]}:null,
    campaigns:Array.from({length:14},(_,i)=>({id:'cmp'+(i+1),name:'Campanha '+String(i+1).padStart(2,'0'),objective:i<7?'OUTCOME_LEADS':'OUTCOME_SALES',effective_status:i===1?'PAUSED':'ACTIVE',status:i===1?'PAUSED':'ACTIVE',insights:{data:[{spend:String((i+1)*10),impressions:'100',clicks:'4',actions:[{action_type:'lead',value:'2'}]}]},adsets:{data:[{id:'set'+i,name:'Conjunto '+i,ads:{data:[{id:'ad'+i,name:'Anúncio '+i}]}}]}})),
    snapshot:{period,spend:300,messages:30},partial:false,
  });
  let metricReads=0;
  fixture.loadMetrics=async()=>{metricReads++;return payload(true);};
  await act(async()=>{renderer=create(detailTree());});
  check(renderer.root.findAllByProps({'data-gia-chart':true}).length===2,'dois gráficos diários presentes');
  const sparklines=renderer.root.findAllByProps({className:'gia-sparkline'});
  check(sparklines.length===5,'cinco indicadores usam a série diária para minigráficos');
  const sparkPath=sparklines[0].findByType('path').props.d;
  check(sparkPath.split('M').length===3&&!sparkPath.includes('L'),'minigráfico preserva as lacunas entre os dias');
  await act(async()=>select('gia-chart-primary').props.onChange({target:{value:'cpl'}}));
  check(select('gia-chart-primary').props.value==='cpl','controle de métrica do gráfico');
  await press('Comparar com período anterior');
  check(shown().includes('26/10/2026')&&shown().includes('100,0%')&&metricReads===1,'comparação usa período anterior e delta real sem nova chamada');
  await act(async()=>select('gia-chart-primary').props.onChange({target:{value:'spend'}}));
  const plot=renderer.root.findAllByType('svg').find(node=>node.props['aria-label']?.startsWith('Investimento por dia'));
  const pointer=(x,y)=>({clientX:x,clientY:y,currentTarget:{getBoundingClientRect:()=>({left:0,top:0,width:600,height:220})}});
  await act(async()=>plot.props.onPointerMove(pointer(90,75)));
  let tooltip=renderer.root.findByProps({className:'gia-chart-tooltip'});
  check(/01\/11.*Investimento.*100,00.*Anterior · 26\/10.*150,00/.test(content(tooltip.props.children).replace(/\s+/g,' '))&&renderer.root.findAllByProps({className:'gia-crosshair'}).length===2,'hover mostra data, valores comparados e guias do ponto');
  await act(async()=>plot.props.onPointerMove(pointer(145,75)));
  tooltip=renderer.root.findByProps({className:'gia-chart-tooltip'});
  check(/02\/11.*—.*Anterior · 27\/10.*—/.test(content(tooltip.props.children).replace(/\s+/g,' '))&&renderer.root.findAllByProps({className:'gia-crosshair'}).length===1,'dia sem dados preserva a lacuna e não mostra uma guia de valor');
  await act(async()=>plot.props.onPointerMove(pointer(145,213)));
  check(!renderer.root.findAllByProps({className:'gia-chart-tooltip'}).length,'a legenda do eixo fora da área do gráfico não ativa o tooltip');
  await act(async()=>plot.props.onKeyDown({key:'ArrowRight',preventDefault(){}}));
  check(Boolean(renderer.root.findAllByProps({className:'gia-chart-tooltip'}).length),'setas também abrem os valores');
  await act(async()=>plot.props.onKeyDown({key:'Escape',preventDefault(){}}));
  check(!renderer.root.findAllByProps({className:'gia-chart-tooltip'}).length,'Escape fecha os valores');
  check(renderer.root.findAllByProps({className:'gia-plot-dot gia-plot-dot-previous'}).length===2,'dia anterior isolado permanece visível');
  await press('Ver dados do gráfico 1');check(shown().includes('Dia atual')&&shown().includes('Dia anterior'),'tabela acessível do gráfico');
  await act(async()=>select('gia-search').props.onChange({target:{value:'Campanha 01'}}));
  check(shown().includes('Campanha 01')&&!shown().includes('Campanha 14'),'busca filtra linhas');
  await act(async()=>select('gia-search').props.onChange({target:{value:''}}));
  await act(async()=>select('gia-col-impressions').props.onChange({target:{checked:false}}));
  check(!renderer.root.findAllByType('th').some(n=>content(n.props.children).includes('Impressões')),'colunas controlam a tabela');
  await press('Próxima página');check(shown().includes('Campanha 01')&&!shown().includes('Campanha 14'),'paginação muda registros');
  await press('Detalhes de Campanha 04');check(shown().includes('Identificador')&&shown().includes('cmp4'),'ficha abre dados da entidade');
  await press('Fechar detalhes');
  await press('Ordenar por nome');check(shown().includes('Campanha 01'),'ordenação acessível');
  await press('Conjuntos');check(button('Detalhes de Conjunto 0')&&!button('Detalhes de Campanha 01'),'troca de nível funcional');
  await press('Anúncios');check(shown().includes('Anúncio 0'),'nível anúncio funcional');
  const pendingUi=deferred();fixture.loadMetrics=()=>pendingUi.promise;
  await click('Próximo cliente');
  check(!shown().includes('Anúncio 0')&&!shown().includes('100,0%'),'limpa tabela e comparação ao trocar cliente');
  await act(async()=>pendingUi.resolve(payload(true)));
  fixture.loadMetrics=async()=>{const data=payload(true);data.campaigns[3].name=null;return data;};
  await press('Atualizar agora');await press('Campanhas');await press('Ordenar por nome');
  if(!button('Detalhes de Sem nome'))await press('Próxima página');
  check(Boolean(button('Detalhes de Sem nome')),'campanha sem nome não quebra ordenação nem ficha');
  const DateBefore=globalThis.Date;
  globalThis.Date=class extends DateBefore {
    constructor(...args){super(...(args.length ? args : ['2026-11-07T15:00:00Z']));}
  };
  try {
    await act(async()=>select('gestor-periodo').props.onChange({target:{value:'last7'}}));
    check(select('gestor-periodo').props.value==='last7','atalho mantém a seleção quando coincide com o mês');
    await act(async()=>select('gestor-periodo').props.onChange({target:{value:'custom'}}));
    check(select('gestor-periodo').props.value==='custom'&&select('gestor-desde').props.value==='2026-11-01','personalizado preserva a janela');
  } finally {globalThis.Date=DateBefore;}
  fixture.loadMetrics=async()=>({...payload(true),account:null,accountError:'Totais de conta indisponíveis.',snapshot:{period,spend:40,messages:10}});
  await press('Atualizar agora');
  const kpis=renderer.root.findByProps({'aria-label':'Indicadores da Meta Ads'});
  check(shown().includes('Os cartões usam somente as campanhas')&&!kpis.findAllByProps({className:'gia-kpi-comparison'}).length,'subtotal não compara com total da conta');
  check(renderer.root.findAllByType('span').some(node=>node.props.title?.startsWith('Período anterior · '))&&renderer.root.findAllByProps({'data-gia-chart':true}).length===2,'comparação diária continua disponível');
  const clientReads = [];
  const accountReads = [], slowOverview = deferred();
  const clientA = client('a');
  clientA.logo_urls = ['https://assets.fixture.invalid/aurora.png'];
  clientA.metaAccounts.push({meta_account_id:'act_42',meta_account_name:'Conta reserva'});
  fixture.loadPortfolio=async()=>({clients:[clientA,client('b')],warnings:[]});
  fixture.loadOverview=async({clientId})=>{
    accountReads.push(clientId);
    return clientId==='b'?slowOverview.promise:{
      accounts:[
        {id:'act_a',status:1,business:{id:'777',name:'Operação Sul'},spend30d:129.75,billingBalance:86.5,currency:'BRL'},
        {id:'act_42',status:3,business:{id:'fixture-bm-reserva',name:'Outra agência'},spend30d:0,currency:'BRL',prepaid:true},
      ],
      period:{since:'2026-10-08',until:'2026-11-06'},fetchedAt:'2026-11-06T15:00:00Z',
    };
  };
  fixture.loadMetrics = async (query) => { clientReads.push(query); return payload(false,query.period); };
  await act(async()=>renderer.unmount());
  fixture.canViewField=()=>true;
  await act(async()=>{renderer=create(tree('/gestor-ia/clientes/a?desde=2026-11-01&ate=2026-11-06'));});
  const photo=renderer.root.findAllByType('img').find(n=>n.props.src==='https://assets.fixture.invalid/aurora.png');
  check(Boolean(photo),'ficha usa a foto cadastrada');
  await act(async()=>photo.props.onError());
  check(renderer.root.findAllByProps({className:'gia-initials'}).some(n=>content(n.props.children)==='EA'),'foto indisponível cai para as iniciais');
  await click('Contas e BM');
  check(shown().includes('Onde a entrega aconteceu')&&shown().includes('Conjunto 0'),'contas usa a leitura de campanha e conjunto');
  check(clientReads.length===1&&clientReads[0].accountId==='act_a'&&clientReads[0].period.until==='2026-11-06','Métricas e Contas compartilham conta e janela sem repetir a leitura');
  check(shown().includes('Operação Sul')&&shown().includes('Pagamento pendente')&&shown().includes('129,75')&&shown().includes('86,50'),'BMs, estados e valores vêm da leitura separada das contas');
  const accountSearch=renderer.root.findByProps({'aria-label':'Buscar conta ou BM'});
  await act(async()=>accountSearch.props.onChange({target:{value:'outra agencia'}}));
  check(shown().includes('Conta reserva')&&!shown().includes('Operação Sul'),'busca encontra o BM com acento sem exigir acento na consulta');
  await act(async()=>accountSearch.props.onChange({target:{value:''}}));
  await press('Com atenção');
  check(shown().includes('Conta reserva')&&!shown().includes('Operação Sul'),'filtro de atenção limita as contas');
  await press('Todas');
  await press('Recolher conjuntos');
  check(!shown().includes('Conjunto 0'),'recolher esconde os conjuntos');
  await press('Expandir conjuntos');
  await act(async()=>renderer.root.findByProps({'aria-label':'Colunas de entrega'}).props.onChange({target:{value:'cliques'}}));
  check(shown().includes('Conjunto 0')&&shown().includes('Impressões')&&shown().includes('Cliques'),'entrega expande e troca de colunas');
  await press('14 dias');
  await press('Conta reserva');
  check(clientReads.at(-1).accountId==='act_42'&&accountReads.join(',')==='a'&&shown().includes('129,75'),'conta e período de entrega mudam sem repetir o total fixo de 30 dias');
  fixture.canViewField=(field)=>field!=='valor';
  await act(async()=>renderer.update(tree()));
  check(!shown().includes('Saldo de cobrança')&&!shown().includes('86,50'),'restrição de valor oculta a cobrança');
  fixture.canViewField=()=>true;
  await act(async()=>renderer.update(tree()));
  await click('Próximo cliente');
  check(shown().includes('Conta b')&&!shown().includes('Conta a')&&clientReads.at(-1).accountId==='act_b','troca de cliente limpa conta anterior na entrega');
  await click('Cliente anterior');
  await act(async()=>slowOverview.resolve({accounts:[{id:'act_b',business:{id:'888',name:'BM ATRASADO'}}]}));
  check(shown().includes('Operação Sul')&&!shown().includes('BM ATRASADO'),'resposta de BM atrasada não aparece em outro cliente');
  await act(async()=>renderer.unmount());
  const readOverview = fixture.loadOverview;
  const catalogReads = [];
  const googleOnly = { ...client('c'), empresa:'Empresa C', metaAccounts:[],
    googleAccounts:[{google_customer_id:'google-c',google_customer_name:'Conta Google C'}] };
  fixture.loadPortfolio = async()=>({clients:[clientA, client('b'), googleOnly],warnings:[]});
  fixture.loadOverview = async(query)=>{
    catalogReads.push(query.clientId);
    if(query.clientId==='b') throw new Error('Fonte indisponível');
    return readOverview(query);
  };
  await act(async()=>{renderer=create(tree('/gestor-ia/carteira/contas?periodo=last7&desde=2026-11-01&ate=2026-11-06'));});
  check(shown().includes('Dono')&&shown().includes('Investido · 30d')&&shown().includes('Saldo de cobrança'),'catálogo tem as colunas de dono, investimento e saldo');
  const accountRow=renderer.root.findAllByType('tr').find(row=>content(row.props.children).includes('act_a'));
  check(/Gestora a.*129,75.*86,50/.test(content(accountRow?.props.children)),'catálogo associa dono, gasto e saldo ao vínculo certo');
  const bmLinks=renderer.root.findAllByType('a').filter(node=>content(node.props.children).trim()==='Abrir BM');
  check(bmLinks.length===1&&bmLinks[0].props.href==='https://business.facebook.com/settings/ad-accounts?business_id=777'&&bmLinks[0].props.rel==='noreferrer','só o BM com ID válido ganha o link para a Meta');
  const previewBm=renderer.root.findAllByType('button').find(node=>content(node.props.children).trim()==='Abrir BM');
  check(previewBm?.props.disabled,'BM de demonstração mostra o atalho desabilitado');
  check(catalogReads.join(',')==='a,b'&&shown().includes('Conta b')&&shown().includes('Conta Google C'),'uma leitura falha sem apagar vínculos e Google não chama a Meta');
  const catalogSearch=renderer.root.findByProps({'aria-label':'Buscar conta'});
  await act(async()=>catalogSearch.props.onChange({target:{value:'outra agencia'}}));
  check(shown().includes('Conta reserva')&&!shown().includes('Operação Sul'),'catálogo busca por BM sem exigir acento');
  await act(async()=>catalogSearch.props.onChange({target:{value:''}}));
  fixture.canViewField=(field)=>!['responsavel','valor'].includes(field);
  await act(async()=>renderer.update(tree()));
  check(!shown().includes('Gestora a')&&!shown().includes('86,50')&&shown().includes('129,75'),'catálogo respeita permissões de dono e cobrança');
  const readsWithPermissions=catalogReads.length;
  fixture.profile={id:'catalog-staff',role:'colaborador',status:'active'};
  await act(async()=>renderer.update(tree()));
  check(catalogReads.length===readsWithPermissions+2&&shown().includes('129,75')&&shown().includes('Conta a')&&!shown().includes('86,50')&&!shown().includes('Gestora a'),
    'colaborador consulta investimento e preserva as restrições de cobrança e responsável');
  await act(async()=>renderer.unmount());
  fixture.canViewField=()=>true;
  fixture.profile={id:'admin',role:'admin',status:'active'};
  fixture.modules={paid_traffic:true,clients:true,tasks:true,mini_crm:true,atendimento:true,reports:true};
  fixture.loadPortfolio=async()=>({clients:[client('a')],availableClients:[client('a'),{...client('b'),metaAccounts:[],googleAccounts:[],tasks:[]}],warnings:[]});
  await act(async()=>{renderer=create(tree('/gestor-ia/carteira?desde=2026-11-01&ate=2026-11-06'));});
  await press('Selecionar cliente');
  await act(async()=>select('gestor-selecionar-cliente').props.onChange({target:{value:'b'}}));
  await click('Abrir cliente');
  check(shown().includes('Empresa B')&&href('Vincular Meta Ads')==='/clients/b/edit?secao=contas-meta','cliente existente sem conta abre o editor oficial de vínculos');
  await click('Metas');
  check(Boolean(button('Editar meta'))&&!href('Editar metas'),'meta de tráfego tem botão na própria ficha');
  await press('Editar meta');
  check(shown().includes('Custo por mensagem alvo')&&shown().includes('Empresa B')&&renderer.root.findAllByType('dialog').length===1,'painel lateral abre sem trocar o cliente');
  await press('Cancelar');
  check(!renderer.root.findAllByType('dialog').length&&shown().includes('Empresa B'),'cancelar mantém a ficha de metas');
  check(Boolean(button('Editar metas do mês'))&&!href('Metas do mês'),'metas do mês não abrem Indicadores');
  await click('Relatório');
  check(href('Montar relatório')==='/paid-traffic/relatorio?cliente=b&desde=2026-11-01&ate=2026-11-06&origem=gestor-ia','gerador recebe cliente, intervalo e origem do Gestor');
  await click('Decisões');
  check(href('Nova tarefa')==='/tasks/list/new?type=paid_traffic&client_id=b','decisões abrem a tarefa oficial com cliente e tipo');
  await click('Conectores');
  check(shown().includes('Meta Ads')&&shown().includes('1 vínculo')&&!href('Credenciais Meta'),'conectores distinguem vínculo de acesso a credenciais');
  await act(async()=>renderer.unmount());
  fixture.modules={paid_traffic:true};fixture.profile={id:'staff-connectors',role:'colaborador',status:'active'};
  fixture.loadPortfolio=async()=>({clients:[],availableClients:[],warnings:[]});
  await act(async()=>{renderer=create(tree('/gestor-ia/conectores'));});
  check(shown().includes('Conectores')&&shown().includes('Sem vínculos')&&!button('Gerenciar vínculos Meta'),'aba funciona sem carteira e respeita módulo de clientes');
  await act(async()=>renderer.unmount());
  fixture.profile={id:'goals-admin',role:'admin',status:'active'};
  fixture.modules={paid_traffic:true,clients:true};
  const multiAccount={...client('a'),metaAccounts:[...client('a').metaAccounts,{meta_account_id:'act_regional',meta_account_name:'Conta regional'}]};
  const multiGoals=['act_a','act_regional'].map((account_id,i)=>({id:`meta-${i}`,account_id,client_id:'a',name:i?'Meta regional':'Meta principal',
    objective:'leads',scope:'account',campaign_ids:[],cost_cents:2000,budget_cents:100000,result_target:50,is_active:true,is_primary:i===0}));
  fixture.loadPortfolio=async()=>({clients:[{...multiAccount,mediaGoals:multiGoals.slice(0,1)}],warnings:[]});
  fixture.loadMediaGoals=async(id)=>{assert.equal(id,'a');return multiGoals;};
  const goalsReads=[];
  fixture.loadMetrics=async(q)=>{goalsReads.push([q.accountId,q.refresh]);return {period:q.period,fetchedAt:'2026-11-06T12:00:00Z',
    campaigns:[
      {id:'701',name:'Captação de novembro',objective:'OUTCOME_LEADS', insights:{data:[{spend:'310',actions:[{action_type:'lead',value:'5'}]}]},
        adsets:{data:[{id:'801',name:'Conjunto da captação'}]}},
      {id:'702',name:'Vendas de novembro',objective:'OUTCOME_SALES', insights:{data:[{spend:q.accountId==='act_a'?'200':'65',actions:[{action_type:'lead',value:'10'}]}]},
        adsets:{data:[{id:'802',name:'Conjunto de vendas'}]}},
    ],
    account:{spend:q.accountId==='act_a'?510:375,leads:15,currency:'BRL'}};};
  await act(async()=>{renderer=create(tree('/gestor-ia/clientes/a?tab=metas'));});
  check(shown().includes('Meta principal')&&shown().includes('Meta regional')&&shown().includes('510,00')&&shown().includes('375,00'),'Metas abre em todas as contas e mantém o recorte de cada cartão');
  check(goalsReads.length===2&&goalsReads.every(([,refresh])=>!refresh),'cada conta do cliente faz uma única leitura salva');
  await click('Editar metas');
  check(renderer.root.findAllByType('dialog').length===1 && renderer.root.findAllByType('input').some(({props})=>props.value==='Meta principal'),
    'editar metas abre a principal no painel da própria ficha');
  const goalDialog=renderer.root.findByType('dialog');
  check(/Cobertura após salvar\s+2 campanhas nesta meta/.test(content(goalDialog)), 'editor mostra a cobertura atual antes de alterar a régua');
  await act(async()=>goalDialog.findByProps({type:'radio',value:'campaigns'}).props.onChange());
  const selectedCampaign=goalDialog.findAllByType('label').find((label)=>content(label).includes('Captação de novembro')).findByProps({type:'checkbox'});
  await act(async()=>selectedCampaign.props.onChange({target:{checked:true}}));
  const coverageText=content(goalDialog.findByProps({className:'gia-media-scope-stats'})).replace(/\s+/g,' ');
  check(coverageText.includes('1 campanha nesta meta')&&coverageText.includes('1 fica sem meta')&&goalsReads.length===2,
    'trocar o escopo mostra o impacto sem recarregar o histórico');
  await press('Cancelar');
  check(renderer.root.findAllByType('dialog').length===0 && shown().includes('Meta regional') && goalsReads.length===2,
    'cancelar mantém a visão conjunta e reaproveita as leituras salvas');
  await press('Duplicar Meta principal');
  check(renderer.root.findAllByType('dialog').length===1 && renderer.root.findAllByType('input').some(({props})=>props.value==='Meta principal · cópia') &&
    renderer.root.findAllByType('input').some(({props})=>props.value==='50') &&
    renderer.root.findAllByProps({role:'switch'}).every(({props})=>!props['aria-checked']), 'duplicar preserva volume próprio e abre rascunho inativo e secundário');
  await press('Cancelar');
  await act(async()=>select('gestor-conta-metas').props.onChange({target:{value:'act_regional'}}));
  check(!shown().includes('510,00')&&shown().includes('375,00')&&goalsReads.length===2,'filtrar uma conta reaproveita a leitura');
  await click('Editar metas');
  check(renderer.root.findAllByType('dialog').length===1 && select('gestor-conta-metas').props.value==='act_regional',
    'atalho da principal preserva a conta filtrada atrás do editor');
  await press('Cancelar');
  await act(async()=>select('gestor-conta-metas').props.onChange({target:{value:''}}));
  check(shown().includes('Meta principal')&&shown().includes('Meta regional')&&goalsReads.length===2,'limpar a conta retorna à visão do cliente');
  check(button('Atualizar agora').props.title==='Atualizar Conta a','atualização informa qual conta será consultada');
  await press('Atualizar agora');
  check(goalsReads.length===3&&goalsReads.at(-1)[0]==='act_a'&&goalsReads.at(-1)[1]===true,'atualizar em todas as contas consulta apenas a principal');
  await act(async()=>renderer.unmount());
  const allowedGoalMetrics=fixture.loadMetrics;
  fixture.loadMetrics=async(q)=>{
    if(q.accountId==='act_regional') throw Object.assign(new Error('Acesso indisponível.'),{accessDenied:true});
    return allowedGoalMetrics(q);
  };
  await act(async()=>{renderer=create(tree('/gestor-ia/clientes/a?tab=metas'));});
  check(shown().includes('Meta principal')&&/Leitura indisponível para\s+Conta regional/.test(shown())&&!shown().includes('Meta regional'),'uma conta recusada não apaga outra nem expõe valores');
  await act(async()=>renderer.unmount());
  fixture.loadMetrics=allowedGoalMetrics;
  await act(async()=>{renderer=create(tree('/gestor-ia/clientes/a?tab=metas&conta=act_a&mes_meta=2026-10'));});
  await press('2 campanhas');
  check(/Maior desvio na leitura\s+Captação de novembro\s+R\$\s*210,00/.test(shown()), 'cartão revela o maior desvio na leitura salva');
  const focusedLink=renderer.root.findAllByType('a').find(({props})=>props['aria-label']==='Ver métricas de Captação de novembro');
  const focusParams=new URL(focusedLink.props.href,'https://fixture.invalid').searchParams;
  check(focusParams.get('conta')==='act_a' && focusParams.get('desde')==='2026-10-01' && focusParams.get('ate')==='2026-10-31' &&
    focusParams.get('campanha')==='701' && focusParams.get('mes_meta')==='2026-10', 'atalho fixa conta, mês e ID exato da campanha');
  await click('Ver métricas de Captação de novembro');
  const campaignTable=()=>content(renderer.root.findByProps({'aria-label':'Estrutura de anúncios'}));
  check(campaignTable().includes('Campanha em foco') && campaignTable().includes('Captação de novembro') &&
    !campaignTable().includes('Vendas de novembro') && goalsReads.at(-1)[1]===false, 'Métricas filtra a campanha usando leitura salva');
  await press('Conjuntos');
  check(campaignTable().includes('Conjunto da captação') && !campaignTable().includes('Conjunto de vendas'), 'foco segue o conjunto da campanha');
  await click('Ver todas as campanhas');
  check(!campaignTable().includes('Campanha em foco') && campaignTable().includes('Vendas de novembro'), 'limpar foco mantém a conta e recupera a tabela completa');
  await act(async()=>renderer.unmount());
  const progressRequests=[];
  fixture.loadGoalReadings=async(ids,month)=>{
    progressRequests.push({ids,month});
    return {'meta-0':{accountId:'act_a',reading:{period:month,fetchedAt:'2026-11-06T12:00:00Z',campaigns:[],account:{spend:510,leads:15,currency:'BRL'}}}};
  };
  await act(async()=>{renderer=create(tree('/gestor-ia/carteira?mes_meta=2026-10'));});
  check(/15\s+de\s+50\s+leads/.test(shown())&&progressRequests.length===1&&progressRequests[0].ids.join()==='meta-0',
    'Carteira lê em lote o progresso da meta principal do mês');
  await press('7 dias');
  check(/15\s+de\s+50\s+leads/.test(shown())&&progressRequests.length===1,'filtro de dias na Carteira preserva a meta mensal e reutiliza o cache');
  await click('Meta principal');
  check(/Meta do mês\s+15\s+de\s+50\s+leads/.test(shown())&&shown().includes('51% usada')&&select('gestor-conta-metas').props.value==='act_a',
    'atalho da Carteira mostra no cabeçalho o mesmo progresso da conta principal');
  const currentGoalMonth=renderer.root.findByProps({'aria-label':'Mês de referência'}).props.value;
  check(button('Próximo mês').props.disabled,'mês futuro fica desabilitado');
  await press('Mês anterior');
  check(renderer.root.findByProps({'aria-label':'Mês de referência'}).props.value<currentGoalMonth,'seta anterior navega para a leitura do mês anterior');
  await press('Próximo mês');
  check(renderer.root.findByProps({'aria-label':'Mês de referência'}).props.value===currentGoalMonth,'seta próxima retorna ao mês atual');
  await act(async()=>renderer.unmount());
  fixture.modules={paid_traffic:true};fixture.profile={id:'admin',role:'admin',status:'active'};
  fixture.loadPortfolio=async()=>({clients:[client('a'),client('b')],warnings:[]});
  const metricRequests=[];
  fixture.canViewField=(field)=>field!=='valor';
  const update=deferred();
  const savedAt='2026-11-06T12:00:00Z';
  const newAt='2026-11-07T12:00:00Z';
  const history={period:{since:'2026-09-01',until:'2026-11-08'},fetchedAt:savedAt,adDays:[],
    accountDays:[{date_start:'2026-11-06',spend:'50',account_currency:'BRL',impressions:'200',clicks:'10'},
      {date_start:'2026-10-31',spend:'70',account_currency:'BRL',impressions:'100',clicks:'4'}]};
  fixture.loadMetrics=async(q)=>{
    metricRequests.push([q.clientId,q.refresh]);
    if(q.refresh)return update.promise;
    return q.clientId==='a'?{...payload(true,q.period),history}:{fetchedAt:null};
  };
  await act(async()=>{renderer=create(detailTree());});
  const lastRead=()=>renderer.root.findAllByType('time').find(n=>n.props.dateTime)?.props.dateTime;
  const DateNow=globalThis.Date;
  let today='2026-11-08T15:00:00Z';
  globalThis.Date=class extends DateNow {
    constructor(...args){super(...(args.length?args:[today]));}
  };
  try {
    for(const [preset,expected] of [['last7','50,00'],['last14','120,00'],['last30','120,00'],['lastMonth','70,00'],['month','50,00']]) {
      await act(async()=>select('gestor-periodo').props.onChange({target:{value:preset}}));
      check(shown().includes(expected)&&lastRead()===savedAt,`${preset} muda o recorte e preserva o horário salvo`);
    }
    check(metricRequests.length===1,'cinco filtros não repetem o acesso ao banco quando há histórico');
    await click('Próximo cliente');
    check(!shown().includes('50,00')&&shown().includes('Resumo salvo do cliente'),'cliente sem leitura detalhada abre com seu resumo próprio');
    await click('Cliente anterior');
    check(metricRequests.length===2&&shown().includes('50,00'),'voltar ao cliente anterior reutiliza sua leitura');
    await act(async()=>{void button('Atualizar agora').props.onClick();});
    check(shown().includes('Atualizando…')&&shown().includes('50,00')&&lastRead()===savedAt,'atualização em curso mantém indicadores e a hora anterior');
    await act(async()=>update.resolve({...payload(true,{since:'2026-11-01',until:'2026-11-08'}),fetchedAt:newAt,
      account:{spend:51,reach:199,currency:'BRL'},history:{...history,fetchedAt:newAt},refreshStatus:'updated'}));
    check(shown().includes('51,00')&&lastRead()===newAt&&metricRequests.at(-1)[1]===true,'apenas a atualização concluída avança o horário');
    today='2026-11-09T15:00:00Z';
    await act(async()=>select('gestor-periodo').props.onChange({target:{value:'month'}}));
    check(shown().includes('51,00')&&/Alcance:\s*199/.test(shown())&&metricRequests.length===3,
      'a leitura direta continua visível se o mês avança sem um novo dia salvo');
  } finally {globalThis.Date=DateNow;}
  await act(async()=>renderer.unmount());
  fixture.canViewField=()=>true;
  fixture.modules={paid_traffic:true,clients:true};
  fixture.loadPortfolio=async()=>({clients:[
    {...client('a'),mediaGoals:[{account_id:'act_a',is_active:true,objective:'leads',scope:'objective'}]},
    {...client('b'),mediaGoals:[]},
  ],warnings:[]});
  const requests=[];
  let pendingPortfolio;
  fixture.invoke=async(name,{body})=>{
    assert.equal(name,'gestor-ia-meta');
    assert.equal(body.action,'get-gestor-portfolio-readings');
    requests.push(body);
    if(pendingPortfolio)await pendingPortfolio.promise;
    const readings=body.scopes.map(({cliente_id:clientId,ad_account_id:accountId})=>{
      const values={spend:clientId==='a'?60:40,impressions:100,clicks:3,account_currency:'BRL',actions:[{action_type:'lead',value:5}]};
      const campaign={id:clientId==='a'?'10':'20',name:`Campanha do cliente ${clientId}`,objective:'OUTCOME_LEADS',insights:{data:[values]}};
      return {clientId,accountId,reading:{period:body.time_range,fetchedAt:savedAt,accountRows:[values],campaigns:[campaign],
        dailyRows:[{...values,date_start:body.time_range.since}],campaignDays:[{...values,date_start:body.time_range.since,campaign_id:campaign.id}]}};
    });
    return {data:{readings}};
  };
  await act(async()=>{renderer=create(tree('/gestor-ia/metricas?desde=2026-11-01&ate=2026-11-06&periodo=custom'));});
  check(shown().includes('2 clientes · 2 de 2 contas')&&shown().includes('100,00')&&requests.length===1,'Métricas começa pela carteira autorizada');
  const filterMetric=async(label,value)=>act(async()=>renderer.root.findByProps({'aria-label':label}).props.onChange({target:{value}}));
  await filterMetric('Objetivo','leads');
  await filterMetric('Situação da meta','with');
  check(shown().includes('Campanha do cliente a')&&!shown().includes('Campanha do cliente b')&&shown().includes('60,00')&&requests.length===1,
    'combinação de objetivo e meta recalcula a leitura sem outra chamada');
  await filterMetric('Situação da meta','all');
  await act(async()=>select('gestor-cliente').props.onChange({target:{value:'b'}}));
  check(shown().includes('40,00')&&!shown().includes('Campanha do cliente a')&&requests.length===1,'troca de cliente reaproveita o lote e isola linhas');
  await act(async()=>select('gestor-cliente').props.onChange({target:{value:''}}));
  pendingPortfolio=deferred();
  await act(async()=>select('gestor-desde').props.onChange({target:{value:'2026-11-02'}}));
  check(shown().includes('100,00')&&shown().includes('Último recorte consultado')&&requests.length===2,'nova janela mantém os cartões do recorte anterior identificado');
  await act(async()=>pendingPortfolio.resolve());
  check(!shown().includes('Último recorte consultado')&&requests.at(-1).time_range.since==='2026-11-02','leitura salva substitui o recorte anterior após concluir');
  check(metricRequests.length===3,'consolidado nunca aciona a coleta Meta individual');
  await act(async()=>renderer.unmount());
  fixture.profile={id:'traffic-staff',role:'colaborador',status:'active'};
  fixture.canViewField=(field)=>field!=='valor';
  fixture.loadPortfolio=async()=>({clients:[client('a')],warnings:[]});
  const staffMetricRequests=[];
  fixture.loadMetrics=async(query)=>{staffMetricRequests.push(query);return payload(true,query.period);};
  const portfolioRequestsBefore=requests.length;
  await act(async()=>{renderer=create(tree('/gestor-ia/metricas?desde=2026-11-01&ate=2026-11-06&periodo=custom'));});
  check(shown().includes('1 cliente · 1 de 1 conta')&&shown().includes('60,00')&&
    shown().includes('Campanha do cliente a')&&!shown().includes('Campanha do cliente b')&&requests.length===portfolioRequestsBefore+1,
    'colaborador sem valor contratual carrega o consolidado e campanhas da própria carteira');
  await click('Carteira');
  await click('Abrir cliente Empresa A');
  check(renderer.root.findAllByProps({'data-gia-chart':true}).length===2&&shown().includes('300,00'),
    'ficha do colaborador carrega cartões e gráficos detalhados');
  await press('Atualizar agora');
  check(staffMetricRequests.at(-1).refresh===true&&staffMetricRequests.every(({clientId})=>clientId==='a'),
    'atualização manual do colaborador mantém o cliente autorizado');
  fixture.canViewField=(field)=>!['valor','meta_resumo'].includes(field);
  const beforeRevocation=staffMetricRequests.length;
  await act(async()=>renderer.update(tree()));
  if(button('Atualizar agora')&&!button('Atualizar agora').props.disabled)await press('Atualizar agora');
  check(!shown().includes('300,00')&&!shown().includes('60,00')&&staffMetricRequests.length===beforeRevocation,
    'revogação do resumo remove leituras anteriores e bloqueia a atualização Meta');
  await act(async()=>renderer.unmount());
  fixture.canViewField=()=>true;
  fixture.profile={id:'admin',role:'admin',status:'active'};
  const trackingPath='/gestor-ia/rastreamento?aba=eventos&plataforma=google&de=2026-11-01&ate=2026-11-06';
  let trackingPortfolioReads=0;
  fixture.loadPortfolio=async()=>{ trackingPortfolioReads++; return {clients:[client('a')],warnings:[]}; };
  fixture.modules={...fixture.modules,rastreamento:false};
  await act(async()=>{renderer=create(tree(trackingPath));});
  check(shown().includes('Acesso ao Rastreamento indisponível')&&!href('Rastreamento')&&
    renderer.root.findAllByProps({'data-tracking':true}).length===0&&trackingPortfolioReads===0,'link direto exige o módulo Rastreamento e fica sem leituras');
  fixture.modules={...fixture.modules,rastreamento:true};
  await act(async()=>renderer.update(tree(trackingPath)));
  check(shown().includes('?aba=eventos&plataforma=google&de=2026-11-01&ate=2026-11-06')&&
    href('Rastreamento')===trackingPath&&trackingPortfolioReads===0,'Rastreamento usa a página oficial e mantém os filtros na rota do Gestor');
  check(href('Métricas')==='/gestor-ia/metricas','parâmetros do Rastreamento não vazam para Métricas');
  await click('Métricas');
  check(trackingPortfolioReads===1&&href('Rastreamento')==='/gestor-ia/rastreamento','menu volta às consultas do Gestor e abre Rastreamento sem filtros de Métricas');
  console.log(`${checks} verificações React do Gestor IA passaram`);
}finally{if(renderer)await act(async()=>renderer.unmount());await rm(scratch,{recursive:true,force:true});delete globalThis.__gestor;delete globalThis.document;}
