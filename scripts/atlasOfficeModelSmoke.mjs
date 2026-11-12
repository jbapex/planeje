/** Synthetic input only; run with the existing server-private Atlas environment. */
import {OFFICE_SYSTEM_PROMPT} from '../supabase/functions/_shared/atlasOfficeManager.js';
import {validateOfficeAnalysis} from '../supabase/functions/_shared/atlasOffice.js';
const context={client:{id:'11111111-1111-4111-8111-111111111111',name:'Cliente inteiramente fictício',objective:'Aumentar pedidos qualificados',service:'No teste, preparar uma peça estática aprovada antes de publicar.'},direction_known:true,
  people:[],functions:[],tasks:[],projects:[],campaigns:[],conversations:[],traffic:{},traffic_source_updated_at:null,
  memories:[{content:'O contrato fictício permite uma peça estática por semana. A prioridade confirmada é preparar o primeiro criativo, sem prazo ou responsável definido.'}]};
const model=process.env.ATLAS_OFFICE_MODEL||process.env.ATLAS_MODEL||'gpt-4o-mini';
const response=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body:JSON.stringify({model,messages:[{role:'system',content:OFFICE_SYSTEM_PROMPT},{role:'user',content:JSON.stringify(context)}],response_format:{type:'json_object'},max_tokens:900,temperature:0.2}),signal:AbortSignal.timeout(65000)});
if(!response.ok)throw new Error('Synthetic model smoke failed; provider HTTP '+response.status);
const data=await response.json();
if(data.choices?.[0]?.finish_reason!=='stop')throw new Error('Incomplete synthetic answer.');
const result=validateOfficeAnalysis(JSON.parse(data.choices[0].message.content),context);
console.log(JSON.stringify({passed:true,synthetic_input:true,operational_writes:false,model:data.model,usage:data.usage,proposals_validated:result.proposals.length,question_returned:!!result.question}));
