// One session owns one immutable API/client/editor scope. No draft uses browser storage.
export function createAgentDraftSession({api,scope,onState=()=>{},delayMs=500}) {
  let revision=null,ready=false,accepting=true,listening=true,timer=null,flight=null,loading=null,latest=null,savedKey=null,phase='loading',error=null,sourceConflict=false,conflict=null;
  const emit=(next,failure=null)=>{phase=next;error=failure;if(listening)onState({phase,error,ready,revision,sourceConflict});};
  const cancelTimer=()=>{if(timer!==null){clearTimeout(timer);timer=null;}};
  const session={
    async load(){
      if(loading)return loading;
      cancelTimer();ready=false;emit('loading');
      loading=(async()=>{
        if(flight)await flight.catch(()=>{});
        const result=await api('agent_draft',scope);
        if(!accepting)return result;
        if(!result?.revision)throw new Error('Não foi possível obter a revisão do rascunho.');
        revision=result.revision;ready=true;conflict=null;sourceConflict=result.source_conflict===true;
        latest=result.draft?{data:result.draft.payload,key:JSON.stringify(result.draft.payload)}:null;savedKey=latest?.key??null;
        emit('clean');return result;
      })().catch(failure=>{emit('error',failure.message);throw failure;}).finally(()=>{loading=null;});
      return loading;
    },
    change(data){
      if(!accepting||!ready)return;
      const key=JSON.stringify(data);latest={key,data:JSON.parse(key)};
      if(key===savedKey)return;
      if(conflict){emit('error',conflict.message);return;}
      emit(flight?'saving':'dirty');cancelTimer();timer=setTimeout(()=>{timer=null;void session.flush().catch(()=>{});},delayMs);
    },
    flush(){
      cancelTimer();if(conflict)return Promise.reject(conflict);if(flight)return flight;
      flight=(async()=>{
        if(loading)await loading;
        if(!ready||!latest||latest.key===savedKey)return;
        while(latest&&latest.key!==savedKey){
          const sending=latest;emit('saving');
          const result=await api('save_agent_draft',{...scope,revision,data:sending.data});
          if(!result?.revision)throw new Error('O salvamento do rascunho não foi confirmado.');
          revision=result.revision;savedKey=sending.key;
        }
        emit('saved');
      })().catch(failure=>{if(failure.code==='40001')conflict=failure;emit('error',failure.message);throw failure;}).finally(()=>{flight=null;});
      return flight;
    },
    async publish(){
      await session.flush();if(!ready)throw new Error('Aguarde a leitura do rascunho.');
      accepting=false;emit('publishing');
      try{const result=await api('publish_agent_draft',{...scope,revision});if(result?.published!==true||!result.agent?.id)throw new Error('A publicação não foi confirmada. Confira a versão publicada antes de tentar novamente.');return result;}
      catch(failure){accepting=true;if(failure.code==='40001')conflict=failure;emit('error',failure.message);throw failure;}
    },
    async discard(){
      await session.flush();if(!ready)throw new Error('Aguarde a leitura do rascunho.');
      accepting=false;emit('discarding');
      try{const result=await api('discard_agent_draft',{...scope,revision});if(result?.discarded!==true)throw new Error('O descarte não foi confirmado. Seu rascunho foi preservado.');return result;}
      catch(failure){accepting=true;emit('error',failure.message);throw failure;}
    },
    current:()=>({revision,data:latest?.data,phase,error,sourceConflict}),
    dispose(){accepting=false;listening=false;cancelTimer();return session.flush();},
  };
  return session;
}

export const agentDraftScope=(row,type,pipelineId)=>row?.id?{agent_id:row.id}:{tipo:type,pipeline_id:pipelineId};
export const agentAudioMode=audio=>audio?.enabled===true?(audio.mode||'always'):'never';
export const agentDraftPayload=(draft,rules,original={})=>({nome:draft.nome,objetivo:draft.objetivo,instrucoes:draft.instrucoes,tom:draft.tom,modelo:draft.modelo,
  base_ids:draft.base_ids,setor_ids:draft.setor_ids,ativo:draft.ativo===true,auto_responder:draft.auto_responder===true,
  funil:{...(draft.funil||original.funil||{}),crm_ia:rules}});
