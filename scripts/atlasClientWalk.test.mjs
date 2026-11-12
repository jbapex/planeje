import test from 'node:test';
import assert from 'node:assert/strict';
import {clientWalkers,pickClientWalker,CLIENT_WALK_PATHS} from '../src/lib/atlasClientWalk.js';
const clients=Array.from({length:24},(_,i)=>({id:'client-'+String(i).padStart(2,'0'),empresa:'Cliente Exemplo '+i,operation:i<9?'apice':'unclassified'}));
test('every client has exactly one named avatar in its explicitly classified room or reception',()=>{
 const before=structuredClone(clients),avatars=clientWalkers(clients,1000);assert.equal(avatars.length,24);assert.equal(new Set(avatars.map(a=>a.id)).size,24);assert.equal(avatars.filter(a=>a.operation==='apice').length,9);assert.equal(avatars.filter(a=>a.operation==='unclassified').length,15);assert.deepEqual(clients,before);
 assert.equal(clientWalkers([...clients,clients[0]],1000).length,24);
});
test('avatars move over time and keep deterministic positions across redraws and record ordering',()=>{
 const a=clientWalkers(clients,2000),b=clientWalkers(clients,6000);assert.notDeepEqual(a.map(c=>[c.x,c.y]),b.map(c=>[c.x,c.y]));assert.deepEqual(a,clientWalkers([...clients].reverse(),2000));
});
test('walking paths remain inside the suites and shared reception, including long-running clocks',()=>{
 for(const now of [0,900,4000,12000,Date.now(),1e15,NaN])for(const a of clientWalkers([...clients,{id:'jb',empresa:'JB',operation:'jb'}],now)){
  const path=CLIENT_WALK_PATHS[a.operation];assert.ok(Number.isFinite(a.x)&&Number.isFinite(a.y));assert.ok(a.x>=Math.min(...path.map(p=>p[0]))&&a.x<=Math.max(...path.map(p=>p[0])));assert.ok(a.y>=Math.min(...path.map(p=>p[1]))&&a.y<=Math.max(...path.map(p=>p[1])));assert.ok(['up','down','left','right'].includes(a.dir));
 }
});
test('a visible character hit identifies the client; empty floor does not fabricate a client',()=>{
 const a=clientWalkers([clients[0]],1000);assert.equal(pickClientWalker(a,a[0].x,a[0].y-15),clients[0].id);assert.equal(pickClientWalker(a,0,0),null);
});
test('reduced motion leaves all client avatars visible and stationary',()=>{
 const a=clientWalkers(clients,1000,{reducedMotion:true}),b=clientWalkers(clients,50000,{reducedMotion:true});assert.deepEqual(a,b);assert.ok(a.every(c=>c.pose==='stand'));assert.equal(a.length,24);
});
test('unknown classification goes to reception without changing either named portfolio',()=>{
 const a=clientWalkers([{id:'x',empresa:'Noivas exemplo',operation:'unknown'}],1);assert.equal(a[0].operation,'unclassified');
});

test('logo follows its company avatar and is clickable above the head',()=>{
 const a=clientWalkers([{id:'company-logo',empresa:'Empresa',operation:'jb',logo_url:'https://example.com/logo.png'}],1000)[0];assert.equal(a.logo_url,'https://example.com/logo.png');assert.equal(pickClientWalker([a],a.x,a.y-53),a.id);
});
