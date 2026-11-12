export const audioClock = seconds => `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
export class AtlasDictationRecorder {
  constructor({onChange,onAudio,media=globalThis.navigator?.mediaDevices,Recorder=globalThis.MediaRecorder,clock=globalThis,now=Date.now,uuid=()=>crypto.randomUUID()}) {
    Object.assign(this,{onChange,onAudio,media,Recorder,clock,now,uuid});this.generation=0;this.disposed=false;this.state={phase:'idle',seconds:0,error:''};
  }
  emit(patch){this.state={...this.state,...patch};if(!this.disposed)this.onChange(this.state);}
  accepts(generation){return !this.disposed&&this.generation===generation;}
  cleanup(){if(this.timer)this.clock.clearInterval(this.timer);this.timer=null;this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;}
  async start(){
    if(!['idle','error'].includes(this.state.phase))return;
    this.cancel();const generation=++this.generation;this.emit({phase:'permission',seconds:0,error:''});
    try{
      if(!this.media?.getUserMedia||!this.Recorder)throw new Error('Seu navegador não permite gravar aqui. Abra o Planeje no Safari ou Chrome atualizado.');
      const stream=await this.media.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true},video:false});
      if(!this.accepts(generation)){stream.getTracks().forEach(t=>t.stop());return;}
      this.stream=stream;
      const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus','audio/webm'].find(t=>this.Recorder.isTypeSupported?.(t));
      const recorder=new this.Recorder(stream,{...(mime?{mimeType:mime}:{}),audioBitsPerSecond:64000});this.recorder=recorder;this.chunks=[];this.started=this.now();
      recorder.ondataavailable=event=>{if(this.accepts(generation)&&event.data?.size)this.chunks.push(event.data);};
      recorder.onerror=()=>{if(this.accepts(generation))this.fail(new Error('A gravação foi interrompida. Tente novamente.'));};
      recorder.onstop=()=>{
        this.cleanup();if(!this.accepts(generation))return;
        const blob=new Blob(this.chunks,{type:recorder.mimeType||mime||this.chunks[0]?.type});this.chunks=[];
        if(blob.size<100){this.fail(new Error('Não consegui gravar a fala. Tente novamente.'));return;}
        if(blob.size>6*1024*1024){this.fail(new Error('Áudio acima de 6 MB. Faça uma gravação mais curta.'));return;}
        this.lastAudio={blob,seconds:Math.min(120,Math.max(1,Math.ceil((this.now()-this.started)/1000))),requestId:this.uuid()};this.transcribe(generation);
      };
      recorder.start(250);this.emit({phase:'recording'});
      this.timer=this.clock.setInterval(()=>{const seconds=Math.floor((this.now()-this.started)/1000);this.emit({seconds:Math.min(120,seconds)});if(seconds>=120)this.stop();},1000);
    }catch(error){if(this.accepts(generation)){const denied=['NotAllowedError','SecurityError'].includes(error?.name);this.fail(new Error(denied?'O microfone está bloqueado. Libere o microfone para este site no navegador e tente novamente.':error.message||'Não foi possível abrir o microfone.'));}}
  }
  stop(){if(this.state.phase!=='recording')return;if(this.timer)this.clock.clearInterval(this.timer);this.timer=null;this.emit({phase:'transcribing'});try{this.recorder.stop();}catch(error){this.fail(error);}}
  transcribe(generation){this.emit({phase:'transcribing',error:''});Promise.resolve(this.onAudio({...this.lastAudio,generation})).catch(error=>{if(this.accepts(generation))this.fail(error);});}
  retry(){if(!this.lastAudio||this.state.phase!=='error')return;if(this.retryNewRequest)this.lastAudio.requestId=this.uuid();this.transcribe(++this.generation);}
  complete(){this.cleanup();this.lastAudio=null;this.emit({phase:'idle',seconds:0,error:''});}
  fail(error){this.generation++;this.cleanup();if(this.recorder){this.recorder.onstop=null;this.recorder.ondataavailable=null;try{if(this.recorder.state!=='inactive')this.recorder.stop();}catch{}}this.retryNewRequest=!!error.retryNewRequest;this.emit({phase:'error',error:error.message||'Não foi possível transcrever agora.'});}
  cancel(){this.generation++;this.cleanup();if(this.recorder){this.recorder.onstop=null;this.recorder.ondataavailable=null;try{if(this.recorder.state!=='inactive')this.recorder.stop();}catch{}this.recorder=null;}this.chunks=[];this.lastAudio=null;this.emit({phase:'idle',seconds:0,error:''});}
  destroy(){this.disposed=true;this.cancel();}
}
