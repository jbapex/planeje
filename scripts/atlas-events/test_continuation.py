"""Continuation writes are scoped and only repeat analysis when coverage advances."""
import unittest
import datetime as dt
import threading
from context import normalize,digest
from server import Engine

class ContinuationTests(unittest.TestCase):
 def setUp(self):
  self.engine=Engine.__new__(Engine);self.writes=[]
  self.engine.rows=lambda *args,**kwargs:[{'coverage':{'head':'unchanged'}}]
  self.engine.patch=lambda table,filters,value:self.writes.append((table,filters,value))
  self.job={'id':'job','conversation_id':'group','source_refs':['in:old','in:new'],'input':{'requests':[{'request_key':'old'}]}}
 def test_new_coverage_schedules_same_group(self):
  self.engine.continue_topics(self.job,{'has_more':True,'items':[{'request_key':'new'}]},'token','owner')
  _,where,value=self.writes[0];self.assertEqual(where,{'owner_id':'eq.owner','conversation_id':'eq.group'})
  self.assertEqual(value['coverage']['continuation_job'],'job');self.assertEqual(value['coverage']['head'],'unchanged')
  self.assertEqual(value['coverage']['continuation_refs'],['in:old','in:new'])
  self.assertEqual(self.writes[-1],('atlas_event_jobs',{'id':'eq.job','owner_id':'eq.owner'},{'continuation_checked':True}))
 def test_repeated_topics_do_not_create_an_infinite_model_loop(self):
  self.engine.continue_topics(self.job,{'has_more':True,'items':[{'request_key':'old'}]},'token','owner')
  self.assertNotIn('continuation_job',self.writes[0][2]['coverage']);self.assertTrue(self.writes[0][2]['coverage']['continuation_stalled'])
 def test_complete_result_does_not_schedule(self):
  self.engine.continue_topics(self.job,{'has_more':False,'items':[]},'token','owner');self.assertEqual(self.writes,[('atlas_event_jobs',{'id':'eq.job','owner_id':'eq.owner'},{'continuation_checked':True})])

 def test_scan_continuation_retains_sources_beyond_history_window(self):
  now=dt.datetime(2026,10,19,14,tzinfo=dt.timezone.utc)
  inbox=[{'id':str(i),'message_id':'m'+str(i),'created_at':(now-dt.timedelta(minutes=30-i)).isoformat(),'body':'Pedido '+str(i),'type':'conversation'} for i in range(25)]
  messages=normalize(inbox,[],[],[]);refs=[m['id'] for m in messages]
  cfg={'enabled':True,'client_ids':['client'],'started_at':(now-dt.timedelta(days=1)).isoformat(),'history_messages':20,'review_seconds':3600,'quiet_seconds':120,'max_wait_seconds':300}
  group={'id':'group','cliente_id':'agency','display_name':'Aurora','is_group':True,'bloqueada':False,'last_message_at':inbox[-1]['created_at']}
  tables={'atlas_event_config':[cfg],'clientes':[{'id':'client','empresa':'Aurora','etapa':'closed','entregaveis':{'whatsapp_grupo':{'conversation_id':'group','wa_cliente_id':'agency'}}}], 'atendimento_conversas':[group],
   'atlas_event_groups':[{'conversation_id':'group','seen':{m['id']:digest(m) for m in messages},'checked_at':now.isoformat(),'coverage':{'continuation_job':'previous','continuation_refs':refs,'source_last_at':inbox[-1]['created_at']}}],'cliente_whatsapp_inbox':inbox}
  engine=Engine.__new__(Engine);engine.lock=threading.Lock();engine.identity=lambda token:'owner';engine.process=lambda *args:0
  queued=[];writes=[]
  def select(table,filters=None):
   rows=list(tables.get(table,[]))
   for key,value in (filters or {}).items():
    if key=='created_at' and value.startswith('gte.'):rows=[r for r in rows if r['created_at']>=value[4:]]
    if key=='created_at' and value.startswith('lt.'):rows=[r for r in rows if r['created_at']<value[3:]]
    if key=='id' and value.startswith('in.('):rows=[r for r in rows if r['id'] in value[4:-1].split(',')]
   return rows
  engine.rows=lambda table,fields,filters=None,*args,**kwargs:select(table,filters)
  def data(table,filters=None,value=None,method='GET',**kwargs):
   if method=='POST':writes.append(value);return []
   rows=select(table,filters)
   if (filters or {}).get('order','').startswith('created_at.desc'):rows=sorted(rows,key=lambda r:r['created_at'],reverse=True)
   return rows[:int((filters or {}).get('limit',500))]
  engine.data=data;engine.patch=lambda *args:None
  def rpc(name,args,*rest):
   self.assertEqual(name,'atlas_event_enqueue');queued.append(args);return 'next'
  engine.rpc=rpc
  result=engine.scan('token',now=now)
  self.assertEqual(result['blocked'],0,writes);self.assertEqual(result['queued'],1)
  self.assertEqual({m['id'] for m in queued[0]['p_input']['messages']},set(refs))

 def test_recovery_acknowledges_continuation_after_publish_crash(self):
  row={**self.job,'published_at':'2026-10-19T14:00:00Z','result':{'has_more':True,'items':[{'request_key':'new'}]}}
  filters=[]
  def rows(table,fields,where=None,*args,**kwargs):
   if table=='atlas_event_jobs':filters.append(where);return [row] if where.get('state')=='eq.completed' else []
   return [{'coverage':{}}]
  self.engine.rows=rows;self.engine.sources_current=lambda *args:True;self.engine.open_accounts=lambda *args:None
  self.engine.rpc=lambda *args:(_ for _ in ()).throw(AssertionError('already published'))
  self.engine.process('owner','token',{},dt.datetime.now(dt.timezone.utc))
  self.assertIn('continuation_checked.eq.false',filters[0]['or'])
  self.assertEqual(self.writes[-1][2],{'continuation_checked':True})

if __name__=='__main__':unittest.main()
