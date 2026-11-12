import test from 'node:test';
import assert from 'node:assert/strict';
import { followupState, hydrateTaskUpdates } from '../src/lib/atlasTaskFollowup.js';
const task={id:'task',assignee_ids:['staff'],due_date:'2026-10-20',status:'todo'};
const open={label:'A fazer',is_terminal:false};
const update=(kind,id='a',actor_id='staff',reply_to=null)=>({id,kind,actor_id,reply_to,created_at:'2026-10-15T15:00:0'+({a:1,b:2,c:3,d:4}[id]||1)+'.000Z'});
const state=(updates,t=task,s=open)=>followupState(t,updates,s,'2026-10-15');
test('task assignment and due date do not imply receipt or human work',()=>assert.equal(state([]).key,'waiting'));
test('receipt and progress require explicit structured updates',()=>{assert.equal(state([update('received')]).key,'received');assert.equal(state([update('progress')]).key,'progress');});
test('blockers stay with team until an explicit owner decision is requested',()=>{const s=state([update('blocked')]);assert.equal(s.key,'blocked');assert.equal(s.ownerAttention,false);});
test('decision request needs the owner and exact reply clears it',()=>{const q=update('needs_owner');assert.equal(state([q]).ownerAttention,true);assert.equal(state([q,update('owner_reply','b','owner','a')]).key,'owner_replied');});
test('ordinary or unrelated owner comments do not clear a decision',()=>assert.equal(state([update('needs_owner'),update('owner_reply','b','owner','other')]).key,'needs_owner'));
test('a later update by the same person replaces their old request',()=>assert.equal(state([update('needs_owner'),update('progress','b')]).key,'progress'));
test('an ex-assignee response does not confirm current assignment',()=>assert.equal(state([update('progress','a','old')]).key,'waiting'));
test('co-assignee decision is not hidden by another person progress',()=>{const s=state([update('needs_owner'),update('progress','b','second')],{...task,assignee_ids:['staff','second']});assert.equal(s.key,'needs_owner');assert.equal(s.pending.length,1);});
test('delivery is a review request, never task completion',()=>{const s=state([update('delivered')]);assert.equal(s.key,'delivered');assert.equal(s.ownerAttention,true);});
test('owner feedback on delivery does not mark task done',()=>assert.equal(state([update('delivered'),update('owner_reply','b','owner','a')]).label,'Entrega comentada'));
test('team delivery remains visible when another assignee is blocked',()=>{const s=state([update('blocked'),update('delivered','b','second')],{...task,assignee_ids:['staff','second']});assert.equal(s.key,'blocked');assert.equal(s.ownerAttention,true);assert.equal(s.pending.length,2);});
test('reply does not claim an actual blocker was removed',()=>assert.equal(state([update('blocked'),update('owner_reply','b','owner','a')]).key,'blocked'));
test('terminal task source prevails over stale requests and late date',()=>{const s=state([update('needs_owner')],{...task,due_date:'2026-10-01'},{is_terminal:true});assert.equal(s.key,'done');assert.equal(s.ownerAttention,false);assert.equal(s.overdue,false);});
test('missing assignment and removed task become owner exceptions',()=>{assert.equal(state([],{...task,assignee_ids:[]}).key,'unassigned');assert.equal(state([],null).key,'unavailable');});
test('overdue is factual and independent of deciding for the owner',()=>{const s=state([],{...task,due_date:'2026-10-14'});assert.equal(s.overdue,true);assert.equal(s.ownerAttention,false);});
test('deleted canonical comment cannot leave a phantom request',()=>assert.deepEqual(hydrateTaskUpdates([{id:'u',comment_id:'c'}],[]),[]));
test('hydrate uses the canonical comment and author without private intake',()=>assert.equal(hydrateTaskUpdates([{id:'u',comment_id:'c',actor_id:'p'}],[{id:'c',content:'Canonical'}],[{id:'p',full_name:'Person'}])[0].content,'Canonical'));

test('free comments are visible without inventing receipt, work or a decision',()=>{const s=followupState(task,[],open,'2026-10-15',[{user_id:'staff',content:'Uma mensagem'}]);assert.equal(s.key,'comment');assert.equal(s.ownerAttention,false);});
test('owner comment does not impersonate the employee update',()=>assert.equal(followupState(task,[],open,'2026-10-15',[{user_id:'owner'}]).key,'waiting'));

test('task assigned only to its owner never claims an employee returned a message',()=>{
  const t={...task,assignee_ids:['owner']}, comments=[{user_id:'owner',content:'Meu comentário'}];
  const s=followupState(t,[],open,'2026-10-15',comments,'owner');
  assert.equal(s.key,'owner_assigned');assert.equal(s.ownerAttention,true);assert.equal(s.total,0);assert.equal(s.lastComment,undefined);
});
test('owner co-assignment and owner updates do not count as a team receipt',()=>{
  const t={...task,owner_id:'owner',assignee_ids:['owner','staff']};
  const s=followupState(t,[update('received','a','owner')],open,'2026-10-15',[{user_id:'owner',content:'Meu comentário'}]);
  assert.equal(s.key,'waiting');assert.equal(s.responded,0);assert.equal(s.total,1);
});
test('latest actual team comment wins despite a newer owner comment and unsorted input',()=>{
  const comments=[
    {id:'b',user_id:'staff',body:'Mensagem mais recente',at:'2026-10-15T15:00:00Z',author:'Pessoa'},
    {id:'c',user_id:'owner',body:'Orientação',at:'2026-10-15T16:00:00Z'},
    {id:'a',user_id:'staff',content:'Antiga',created_at:'2026-10-15T14:00:00Z'},
    {id:'d',user_id:'old',content:'Ex-responsável',created_at:'2026-10-15T17:00:00Z'},
  ];
  const before=structuredClone(comments);
  const s=followupState({...task,assignee_ids:['owner','staff']},[],open,'2026-10-15',comments,'owner');
  assert.equal(s.key,'comment');assert.equal(s.lastComment.id,'b');assert.equal(s.responded,0);assert.equal(s.ownerAttention,false);
  assert.deepEqual(comments,before);
});
test('a newer ordinary comment cannot dismiss an explicit pending decision or delivery',()=>{
  const comments=[{user_id:'staff',content:'Nova mensagem',created_at:'2026-10-16T15:00:00Z'}];
  for(const kind of ['needs_owner','delivered']) {
    const s=followupState(task,[update(kind)],open,'2026-10-15',comments,'owner');
    assert.equal(s.key,kind);assert.equal(s.pending.length,1);assert.equal(s.ownerAttention,true);
  }
});
test('terminal task remains done when it was assigned only to the owner',()=>{
  assert.equal(followupState({...task,assignee_ids:['owner']},[],{is_terminal:true},'2026-10-15',[{user_id:'owner'}],'owner').key,'done');
});
