// Isolated fixture only: real MediaRecorder, synthetic stream, no microphone.
function install(win){
 if(!win.navigator.mediaDevices)return;
 Object.defineProperty(win.navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{
  const Audio=win.AudioContext||win.webkitAudioContext,context=new Audio(),osc=context.createOscillator(),out=context.createMediaStreamDestination();
  osc.frequency.value=220;osc.connect(out);osc.start();await context.resume();
  for(const track of out.stream.getTracks()){const stop=track.stop.bind(track);track.stop=()=>{stop();try{osc.stop();}catch{}context.close();};}
  return out.stream;
 }});
}
install(window);
new MutationObserver(()=>{for(const frame of document.querySelectorAll('iframe'))if(!frame.dataset.syntheticAudio){frame.dataset.syntheticAudio='true';frame.addEventListener('load',()=>{try{install(frame.contentWindow);}catch{}});}}).observe(document.documentElement,{childList:true,subtree:true});
