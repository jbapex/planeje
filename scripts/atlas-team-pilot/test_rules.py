import datetime as dt
import importlib.util
from pathlib import Path
import unittest
from time_rules import SP,review_plan,due_call,next_work_time,explicit_review_time
spec=importlib.util.spec_from_file_location('team_server',Path(__file__).with_name('server.py'));server=importlib.util.module_from_spec(spec);spec.loader.exec_module(server)
class Rules(unittest.TestCase):
 def test_explicit_review_clock(self):
  now=dt.datetime(2026,10,16,13,tzinfo=SP)
  for text in ['Vamos revisar hoje às 15h.','Retorno hoje às 15:00.','Volto hoje as 15h00.']:
   self.assertEqual(explicit_review_time(text,now),'2026-10-16T15:00:00-03:00')
  self.assertEqual(explicit_review_time('Retorno amanhã às 10h.',now),'2026-10-17T10:00:00-03:00')
  self.assertIsNone(explicit_review_time('Volto depois.',now))
 def test_explicit_clock_corrects_model_date(self):
  result=self.result();result['review_at']='2026-10-19T15:00:00-03:00'
  result=server.validate_result(result,self.context(),'Vamos revisar hoje às 15h.',dt.datetime(2026,10,16,13,tzinfo=SP))
  self.assertEqual(result['review_at'],'2026-10-16T15:00:00-03:00')
 def test_timezones(self):
  now=dt.datetime(2026,10,16,13,tzinfo=SP)
  self.assertEqual(review_plan('2026-10-16T18:00:00Z',now,{'end_time':'16:00'})[0],'2026-10-16T15:00:00-03:00')
 def test_before_departure(self):
  now=dt.datetime(2026,10,16,13,tzinfo=SP)
  result,note=review_plan('2026-10-16T17:00:00-03:00',now,{'end_time':'16:00'})
  self.assertEqual(result,'2026-10-16T15:45:00-03:00');self.assertIn('15 minutos',note)
 def test_weekend_and_missing(self):
  now=dt.datetime(2026,10,16,13,tzinfo=SP)
  self.assertEqual(next_work_time(dt.datetime(2026,10,17,12,tzinfo=SP)).weekday(),0)
  self.assertEqual(review_plan(None,now),(None,''))
 def test_no_call_after_hours(self):
  row={'state':'waiting_review','next_review_at':'2026-10-16T14:00:00-03:00'}
  self.assertIsNone(due_call(row,dt.datetime(2026,10,16,16,tzinfo=SP),{'end_time':'16:00'}))
  self.assertIsNone(due_call(row,dt.datetime(2026,10,17,14,tzinfo=SP)))
 def test_bounded_reminders(self):
  row={'state':'waiting_review','next_review_at':'2026-10-16T14:00:00-03:00','reminder_day':'2026-10-16','reminders_today':1}
  self.assertEqual(due_call(row,dt.datetime(2026,10,16,15,tzinfo=SP))['reminders_today'],2)
  row['reminders_today']=2;self.assertIsNone(due_call(row,dt.datetime(2026,10,16,15,tzinfo=SP)))
 def test_exception_also_waits_for_business_hours(self):
  class Fake:
   def rpc(self,name,args):
    if name=='atlas_team_worker_snapshot':
     return [{'thread':{'id':'test','revision':1},'task_exists':False,'hours':{'end_time':'16:00'}}]
    raise AssertionError('Não deve chamar a equipe fora do expediente')
  self.assertEqual(server.Bridge.scan(Fake(),dt.datetime(2026,10,16,17,tzinfo=SP)),0)
 def test_missing_or_empty_bearer_never_uses_service_identity(self):
  for authorization in ['', 'Bearer ', 'Bearer    ']:
   handler=object.__new__(server.Handler);handler.path='/functions/v1/atlas-team-chat'
   handler.headers={'Authorization':authorization};handler.server=type('Server',(),{'bridge':type('Bridge',(),{'origins':[None]})()})()
   responses=[];handler.respond=lambda body,status=200:responses.append(status)
   handler.do_POST();self.assertEqual(responses,[403])
 def test_stops_for_owner_review(self):
  for state in ['needs_owner','delivery_review','closed']:
   self.assertIsNone(due_call({'state':state,'next_review_at':'2026-10-16T14:00:00-03:00'},dt.datetime(2026,10,16,15,tzinfo=SP)))
 def test_date_validation(self):
  now=dt.datetime(2026,10,16,13,tzinfo=SP)
  for date in ['2026-10-16T12:00:00-03:00','2028-10-16T12:00:00-03:00','2026-10-16T15:00:00']:
   with self.assertRaises(ValueError):review_plan(date,now)
 def result(self,**kw):
  return dict(reply='Vou preparar o combinado para sua confirmação.',summary='Andamento informado.',update_kind='progress',review_at='2026-10-16T15:00:00-03:00',expected_at=None,next_person_id=None,evidence_url=None,**kw)
 def context(self):return {'thread':{'current_person_id':'p'},'people':[{'id':'p','name':'Pessoa'}],'hours':{},'task':{}}
 def test_unsafe_recipient(self):
  r=self.result();r['next_person_id']='unknown'
  with self.assertRaises(ValueError):server.validate_result(r,self.context(),'Texto',dt.datetime(2026,10,16,13,tzinfo=SP))
 def test_invented_url(self):
  for url in ['javascript:alert(1)','https://example.com/nao-informado','https://user:pass@example.com/doc']:
   r=self.result();r['evidence_url']=url
   with self.assertRaises(ValueError):server.validate_result(r,self.context(),'Mensagem',dt.datetime(2026,10,16,13,tzinfo=SP))
 def test_delivery_requires_evidence(self):
  r=self.result();r['update_kind']='delivered'
  result=server.validate_result(r,self.context(),'Entreguei',dt.datetime(2026,10,16,13,tzinfo=SP));self.assertEqual(result['update_kind'],'clarify');self.assertIsNone(result['review_at'])
if __name__=='__main__':unittest.main()
