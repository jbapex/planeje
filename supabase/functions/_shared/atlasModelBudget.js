import { AtlasError } from './atlasCore.js';

export async function budgetedAtlasModel({job,rpc,callModel},payload) {
 const id=crypto.randomUUID();
 const estimate=new TextEncoder().encode(JSON.stringify({messages:payload.messages,tools:payload.tools})).length+(payload.maxTokens||2400)+300;
 const reservation=await rpc('atlas_model_reserve',{p_call:id,p_estimate:estimate,p_job:job.id,p_lease:job.lease_token});
 if(!reservation?.reserved)throw new AtlasError('DAILY_BUDGET_WAIT','O teto diário foi atingido. O pedido foi preservado para nova tentativa.',429);
 let answer;
 try {answer=await callModel(payload);return answer;}
 finally {await rpc('atlas_model_finish',{p_call:id,p_usage:answer?.usage||null});}
}
