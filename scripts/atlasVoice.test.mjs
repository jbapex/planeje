import test from 'node:test';
import assert from 'node:assert/strict';
import { AtlasVoiceSession } from '../src/lib/atlasVoiceSession.js';
import { atlasVoiceConfig, validateVoiceOffer } from '../supabase/functions/_shared/atlasVoiceConfig.js';
const OFFER = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111';
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
function harness(overrides = {}) {
  const sent = [], changes = [], queries = [], connections = [];
  const track = { enabled: true, stopped: false, stop() { this.stopped = true; } };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const channel = { readyState: 'open', send: (raw) => sent.push(JSON.parse(raw)), close() { this.readyState = 'closed'; this.onclose?.(); } };
  const audio = { play: async () => {}, pause() { this.paused = true; } };
  const peer = { connectionState: 'new', addTrack() {}, createDataChannel: () => channel, createOffer: async () => ({ sdp: OFFER }), setLocalDescription: async () => {}, setRemoteDescription: async function() { this.connectionState = 'connected'; this.onconnectionstatechange?.(); }, close() { this.connectionState = 'closed'; this.onconnectionstatechange?.(); } };
  const session = new AtlasVoiceSession({ createPeer: () => peer, createAudio: () => audio, mediaDevices: { getUserMedia: async () => stream }, connect: async (value) => { connections.push(value); return { sdp: OFFER }; }, consult: async (message) => { queries.push(message); return { status: 'completed', message: { content: 'Resultado consultado no Planeje.' } }; }, onChange: (state) => changes.push(state), ...overrides });
  const receive = (event) => channel.onmessage({ data: JSON.stringify(event) });
  const call = (id = 'call-1', args = { message: 'O que depende de mim?' }, name = 'consult_atlas') => receive({ type: 'response.done', response: { status: 'completed', output: [{ type: 'function_call', call_id: id, name, arguments: JSON.stringify(args) }] } });
  return { session, receive, call, sent, queries, connections, track, stream, channel, peer, audio, changes };
}

test('voice negotiation accepts bounded SDP and canonicalizes only valid client scope', () => {
  assert.equal(validateVoiceOffer({ sdp: OFFER, client_id: 'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE' }).clientId, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
  for (const sdp of ['', 'not-sdp', 'v=0\r\nm=video', OFFER + 'x'.repeat(64000)]) assert.throws(() => validateVoiceOffer({ sdp }), { code: 'INVALID_INPUT' });
  assert.throws(() => validateVoiceOffer({ sdp: OFFER, client_id: 'other' }), { code: 'INVALID_INPUT' });
});
test('voice configuration requires the existing Atlas tool, with natural turn detection', () => {
  const config = atlasVoiceConfig({ clientId: 'client-A' });
  assert.equal(config.tool_choice, 'required'); assert.equal(config.tools.length, 1);
  assert.equal(config.tools[0].name, 'consult_atlas'); assert.equal(config.max_output_tokens, 2400);
  assert.equal(config.audio.input.turn_detection.interrupt_response, true);
  assert.match(config.instructions, /client-A/); assert.ok(!JSON.stringify(config).includes('api_key'));
});
test('connect, real status events, mute, interrupt and end release browser resources', async () => {
  const h = harness(); await h.session.start('client-A');
  assert.equal(h.connections[0].clientId, 'client-A'); assert.equal(h.session.state.status, 'listening');
  h.receive({ type: 'input_audio_buffer.speech_started' }); assert.equal(h.session.state.status, 'hearing');
  h.session.toggleMute(); assert.equal(h.track.enabled, false);
  h.receive({ type: 'response.created' }); h.receive({ type: 'output_audio_buffer.started' });
  h.session.interrupt(); assert.ok(h.sent.some((event) => event.type === 'response.cancel')); assert.ok(h.sent.some((event) => event.type === 'output_audio_buffer.clear'));
  h.session.stop(); assert.equal(h.track.stopped, true); assert.equal(h.peer.connectionState, 'closed'); assert.equal(h.audio.paused, true);
});
test('each voice tool consults the real chat path once and returns its grounded answer', async () => {
  const h = harness(); try {
    await h.session.start(); h.call(); h.call(); await h.session.queue;
    assert.deepEqual(h.queries, ['O que depende de mim?']);
    const output = h.sent.find((event) => event.type === 'conversation.item.create');
    assert.match(output.item.output, /Resultado consultado/); assert.equal(output.item.call_id, 'call-1');
    assert.equal(h.sent.filter((event) => event.type === 'response.create').length, 1);
    assert.equal(h.sent.at(-1).response.tool_choice, 'none');
  } finally { h.session.stop(); }
});
test('voice cannot inject another tool or choose a client through tool arguments', async () => {
  const h = harness(); try { await h.session.start(); h.call('bad', { message: 'x', client_id: 'B' }); h.call('write', { message: 'x' }, 'create_task'); await h.session.queue; assert.equal(h.queries.length, 0); assert.ok(h.sent.filter((e) => e.type === 'conversation.item.create').every((e) => JSON.parse(e.item.output).status === 'failed')); } finally { h.session.stop(); }
});
test('late microphone permission after ending is released without connecting', async () => {
  const pending = deferred(); const h = harness({ mediaDevices: { getUserMedia: () => pending.promise } });
  const starting = h.session.start(); h.session.stop(); pending.resolve(h.stream); await starting;
  assert.equal(h.track.stopped, true); assert.equal(h.connections.length, 0); assert.equal(h.session.state.status, 'idle');
});
test('provider negotiation failure releases mic and permission denial never connects', async () => {
  const h = harness({ connect: async () => { throw new Error('Voz indisponível.'); } }); await h.session.start(); assert.equal(h.track.stopped, true); assert.match(h.session.state.error, /indisponível/);
  const denied = harness({ mediaDevices: { getUserMedia: async () => { throw Object.assign(new Error(), { name: 'NotAllowedError' }); } } }); await denied.session.start(); assert.match(denied.session.state.error, /Permita/); assert.equal(denied.connections.length, 0);
});
test('ending during a query suppresses late playback; unconfirmed responses stay unconfirmed', async () => {
  const pending = deferred(); const h = harness({ consult: () => pending.promise }); await h.session.start(); h.call(); await Promise.resolve(); h.session.stop(); pending.resolve({ status: 'completed', message: { content: 'Tarde' } }); await h.session.queue; assert.equal(h.sent.length, 0);
  const uncertain = harness({ consult: async () => undefined }); try { await uncertain.session.start(); uncertain.call(); await uncertain.session.queue; assert.equal(JSON.parse(uncertain.sent[0].item.output).status, 'unconfirmed'); } finally { uncertain.session.stop(); }
});
test('browser autoplay denial exposes an explicit play action', async () => {
  const h = harness({ createAudio: () => ({ autoplay: false, play: async () => { throw new Error('blocked'); }, pause() {} }) }); try { await h.session.start(); await h.session.play(); assert.equal(h.session.state.needsPlay, true); } finally { h.session.stop(); }
});

test('opening the channel greets once without an operational tool; next utterance still consults Atlas', async () => {
  const h = harness();
  try {
    await h.session.start(); h.channel.onopen();
    assert.equal(h.sent[0].type, 'response.create');
    assert.equal(h.sent[0].response.tool_choice, 'none');
    assert.match(h.sent[0].response.instructions, /Oi, Josias/);
    h.call(); await h.session.queue;
    assert.equal(h.queries.length, 1);
  } finally { h.session.stop(); }
});

test('real audio meters attach both streams and close when ending', async () => {
  const streams = []; let stopped = false;
  const h = harness({ createMeter: () => ({ add: (stream,channel) => streams.push({stream,channel}), stop: () => { stopped = true; } }) });
  await h.session.start(); h.peer.ontrack({ streams: [h.stream] });
  assert.equal(streams.length, 2); assert.deepEqual(streams.map(s=>s.channel),['input','output']); h.session.stop(); assert.equal(stopped, true);
});

test('background results wait until user speech and audio output have ended', async () => {
  const h=harness();try {
    await h.session.start();
    h.receive({type:'input_audio_buffer.speech_started'});
    h.session.announceMission({id:'job-one',title:'Revisão',result:'Fonte conferida.'});
    assert.equal(h.sent.length,0);
    h.receive({type:'input_audio_buffer.speech_stopped'});
    h.receive({type:'output_audio_buffer.started'});
    h.receive({type:'response.done',response:{status:'completed',output:[]}});
    assert.equal(h.sent.length,0);
    h.receive({type:'output_audio_buffer.stopped'});
    assert.equal(h.sent.length,2);
    assert.equal(h.sent[0].type,'conversation.item.create');
    assert.match(h.sent[0].item.content[0].text,/Fonte conferida/);
    assert.equal(h.sent[1].response.tool_choice,'none');
    h.session.stop();h.session.announceMission({id:'two',result:'late'});assert.equal(h.sent.length,2);
  }finally{h.session.stop();}
});

test('consultation speech waits for remaining playback, even after response.done',async()=>{
 const h=harness();try{await h.session.start();h.receive({type:'output_audio_buffer.started'});h.call();await h.session.queue;
 assert.equal(h.sent.filter(e=>e.type==='response.create').length,0);
 h.receive({type:'output_audio_buffer.stopped'});assert.equal(h.sent.filter(e=>e.type==='response.create').length,1);
 }finally{h.session.stop();}
});
test('a transient disconnect preserves microphone and recovers; a persistent loss closes it',async()=>{
 const h=harness({disconnectGraceMs:15});try{await h.session.start();h.peer.connectionState='disconnected';h.peer.onconnectionstatechange();assert.equal(h.track.stopped,false);
 h.peer.connectionState='connected';h.peer.onconnectionstatechange();await new Promise(r=>setTimeout(r,25));assert.equal(h.session.closed,false);
 h.peer.connectionState='disconnected';h.peer.onconnectionstatechange();await new Promise(r=>setTimeout(r,25));assert.equal(h.track.stopped,true);assert.match(h.session.state.error,/retomar/);
 }finally{h.session.stop();}
});
test('length cutoff continues speech once, waits for playback and never re-executes partial tool calls',async()=>{
 const h=harness();try{await h.session.start();
 const cut={type:'response.done',response:{status:'incomplete',status_details:{reason:'max_output_tokens'},output:[{type:'message',content:[{type:'audio'}]},{type:'function_call',call_id:'partial',name:'consult_atlas',arguments:'{"message":'}]}};
 h.receive({type:'output_audio_buffer.started'});h.receive(cut);assert.equal(h.sent.length,0);assert.equal(h.queries.length,0);
 h.receive({type:'output_audio_buffer.stopped'});assert.equal(h.sent.length,1);assert.equal(h.sent[0].response.tool_choice,'none');
 h.receive(cut);assert.equal(h.sent.length,1);assert.match(h.session.state.error,/incompleta/);
 }finally{h.session.stop();}
});
test('user interruption cancels a pending continuation, and response races keep the connection alive',async()=>{
 const h=harness();try{await h.session.start();h.receive({type:'output_audio_buffer.started'});
 h.receive({type:'response.done',response:{status:'incomplete',status_details:{reason:'max_output_tokens'},output:[{type:'message',content:[{type:'audio'}]}]}});
 h.receive({type:'input_audio_buffer.speech_started'});h.receive({type:'output_audio_buffer.cleared'});assert.equal(h.sent.length,0);
 h.receive({type:'error',error:{code:'conversation_already_has_active_response'}});assert.equal(h.session.closed,false);assert.equal(h.track.stopped,false);
 }finally{h.session.stop();}
});
test('session duration limit waits for the final audio to finish',async()=>{
 const h=harness();try{await h.session.start();h.receive({type:'output_audio_buffer.started'});h.session.durationExpired=true;
 h.receive({type:'response.done',response:{status:'completed',output:[]}});assert.equal(h.session.closed,false);
 h.receive({type:'output_audio_buffer.stopped'});assert.equal(h.session.closed,true);
 }finally{h.session.stop();}
});
