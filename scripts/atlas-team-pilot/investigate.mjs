/** Local stdio adapter: the Python worker owns authorization, sources and provider. */
import { createInterface } from 'node:readline';
import { runAtlasMission } from '../../supabase/functions/_shared/atlasManager.js';

export async function investigate(input, exchange) {
  return runAtlasMission({message:input.message,clientId:input.clientId,memories:[],
    policy:{identity:'team',allowedAgents:['central','clientes','operacao','estrategia','trafego','resultados'],
      allowedSections:['portfolio','client','tasks','task_detail','publications','plans','conversations','conversation','audio_transcript','team','traffic','results'],
      allowInternalQuestions:false},
    limits:{calls:6,tools:8,ms:45000,output:4200},
    onProgress:({steps})=>exchange({type:'activity',step:steps.at(-1)}),
    callModel:({messages,tools,maxTokens})=>exchange({type:'model',payload:{messages,tools,maxTokens}}),
    readContext:(section,options)=>exchange({type:'source',section,options:{clientId:options.clientId,referenceId:options.referenceId,offset:options.offset,referenceMonth:options.referenceMonth}}),
  });
}

if (process.argv[1] && import.meta.url===new URL('file://'+process.argv[1]).href) {
  const lines=createInterface({input:process.stdin,crlfDelay:Infinity})[Symbol.asyncIterator]();
  const exchange=async value=>{process.stdout.write(JSON.stringify(value)+'\n');const line=await lines.next();if(line.done)throw new Error('Worker disconnected');return JSON.parse(line.value);};
  try {
    const first=await lines.next();if(first.done)throw new Error('Missing request');
    const result=await investigate(JSON.parse(first.value),exchange);
    process.stdout.write(JSON.stringify({type:'result',result})+'\n');
    process.exit(0);
  } catch {
    process.stdout.write(JSON.stringify({type:'error'})+'\n');process.exit(1);
  }
}
