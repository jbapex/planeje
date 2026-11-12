import {activityFixture} from './activity-fixture.js';
export * from '../../../src/lib/atlasTeam.js';
export const ATLAS_TEAM_ENABLED=true,ATLAS_TEAM_PILOT=true;
export async function teamRpc(name,args={}){
 if(name==='atlas_demand_access')return true;
 if(name==='atlas_team_list')return activityFixture.threads.filter(t=>t.state!=='closed').map(t=>({...t,client_name:'Cliente fictício',person_name:t.current_person_id===activityFixture.owner_id?'Ana Exemplo':'Bia Exemplo'}));
 if(name==='atlas_team_action'&&args.p_action==='read')return{};
 if(name==='atlas_team_context'){const thread=activityFixture.threads.find(t=>t.id===args.p_thread);if(!thread)throw Error('Conversa fictícia indisponível.');return{thread,client_name:'Aurora fictícia',people:[{id:activityFixture.owner_id,name:'Ana Exemplo'},{id:'00000000-0000-4000-8000-000000000002',name:'Bia Exemplo'}],messages:[...(thread.last_atlas||[]),...(thread.last_human||[])],task:{id:thread.task_id,due_date:null},is_owner:true};}
 throw Error('Prévia sem escrita ou chamadas externas.');
}
