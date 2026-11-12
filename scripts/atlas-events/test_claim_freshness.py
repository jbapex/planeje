"""Queue freshness before claiming, without HTTP, database writes or a provider."""
import copy
import datetime as dt
import sys
import types
import unittest
from unittest.mock import patch
from production import ProductionEngine
from server import Engine

UTC=dt.timezone.utc
class ClaimHarness(ProductionEngine):
 def __init__(self,jobs,stale=()):
  self.base='http://fixture.invalid';self.jobs=copy.deepcopy(jobs);self.stale=set(stale);self.scan_client='client';self._owner='owner';self.patches=[];self.requests=[];self.reads=[];self.checks=[]
 def rows(self,table,fields,filters=None,token=None,order='id',maximum=30000):
  self.reads.append(filters);return self.jobs
 def owner_token(self):return 'synthetic-delegation'
 def sources_current(self,context,token,owner):
  self.checks.append(context['job']);return context['job'] not in self.stale
 def patch(self,table,filters,value):self.patches.append((filters,value));return []
 def request(self,url,data=None,token=None,content_type='application/json',timeout=55):
  self.requests.append(data);return data

def job(key,**patches):
 return {'id':key,'input':{'job':key,'messages':[],'tasks':[],'requests':[],'coverage':{}},'state':'queued','attempt':0,'ready_at':(dt.datetime.now(UTC)-dt.timedelta(hours=1)).isoformat(),'lease_until':None,'created_at':(dt.datetime.now(UTC)-dt.timedelta(hours=1)).isoformat(),**patches}

class ClaimFreshnessTests(unittest.TestCase):
 def claim(self,engine):
  with patch.dict(sys.modules,{'token_budget':types.SimpleNamespace(reserve_tokens=lambda *args:42)}):
   return engine.rpc('atlas_event_claim',{'p_owner':'owner','p_estimate':999})
 def test_old_stale_review_does_not_block_current_messages(self):
  e=ClaimHarness([job('old',created_at=(dt.datetime.now(UTC)-dt.timedelta(minutes=1)).isoformat()),job('current')],['old']);r=self.claim(e);self.assertEqual(r['p_job'],'current');self.assertEqual(r['p_estimate'],42);self.assertEqual(len(e.patches),1)
 def test_quarantine_keeps_attempt_input_and_reservations_untouched(self):
  e=ClaimHarness([job('old',state='error',attempt=1)],['old']);before=copy.deepcopy(e.jobs);self.claim(e);filters,value=e.patches[0]
  self.assertEqual(e.jobs,before);self.assertEqual(set(value),{'state','error'});self.assertEqual(value['state'],'blocked');self.assertEqual(filters,{'id':'eq.old','owner_id':'eq.owner','state':'eq.error','attempt':'eq.1'})
 def test_all_stale_means_no_real_job_claim(self):
  e=ClaimHarness([job('old')],['old']);r=self.claim(e);self.assertEqual(r['p_job'],'00000000-0000-0000-0000-000000000000');self.assertEqual(r['p_estimate'],1)
 def test_current_oldest_preserves_queue_fairness(self):
  e=ClaimHarness([job('first'),job('second')]);e.scan_client=None;self.assertEqual(self.claim(e)['p_job'],'first');self.assertFalse(e.patches)
 def test_client_and_owner_scope_preserved(self):
  e=ClaimHarness([job('one')]);r=self.claim(e);self.assertEqual(e.reads[0]['owner_id'],'eq.owner');self.assertEqual(e.reads[0]['client_id'],'eq.client');self.assertEqual(r['p_client'],'client')
 def test_future_and_exhausted_jobs_are_not_checked_or_claimed(self):
  e=ClaimHarness([job('future',ready_at=(dt.datetime.now(UTC)+dt.timedelta(hours=1)).isoformat()),job('done',attempt=3)]);self.claim(e);self.assertFalse(e.checks);self.assertFalse(e.patches)
 def test_active_lease_is_preserved(self):
  e=ClaimHarness([job('active',state='processing',lease_until=(dt.datetime.now(UTC)+dt.timedelta(minutes=1)).isoformat())]);self.claim(e);self.assertFalse(e.checks);self.assertFalse(e.patches)
 def test_expired_lease_still_goes_through_sql_accounting(self):
  e=ClaimHarness([job('expired',state='processing',lease_until=(dt.datetime.now(UTC)-dt.timedelta(minutes=1)).isoformat())],['expired']);self.assertEqual(self.claim(e)['p_job'],'expired');self.assertFalse(e.patches)
 def test_explicit_client_analysis_uses_newest_snapshot_and_keeps_old_input(self):
  e=ClaimHarness([job('old'),job('new',created_at=dt.datetime.now(UTC).isoformat())]);before=copy.deepcopy(e.jobs);self.assertEqual(self.claim(e)['p_job'],'new');self.assertEqual(e.jobs,before);self.assertFalse(e.patches)
 def test_owner_change_stops_claim(self):
  e=ClaimHarness([job('one')]);e._owner='different'
  with self.assertRaises(PermissionError):self.claim(e)
  self.assertFalse(e.requests);self.assertFalse(e.patches)
 def test_source_read_failure_is_not_relabelled_as_stale(self):
  e=ClaimHarness([job('one')]);e.sources_current=lambda *a:(_ for _ in ()).throw(ConnectionError('unavailable'))
  with self.assertRaises(ConnectionError):self.claim(e)
  self.assertFalse(e.patches);self.assertFalse(e.requests)

class ProcessHarness(Engine):
 def __init__(self,current,finish=True):self.current=iter(current);self.finish=finish;self.finished=[];self.patches=[];self.provider=0;self.fixture=job('one',lease='lease',attempt=1)
 def rows(self,table,fields,filters=None,token=None,**kwargs):return [] if (filters or {}).get('state')=='eq.completed' else [self.fixture]
 def open_accounts(self,*args):pass
 def rpc(self,name,data,token=None):
  if name=='atlas_event_claim':return self.fixture
  if name=='atlas_event_finish':self.finished.append(data);return self.finish
  raise AssertionError('No publish expected')
 def identity(self,*args):return 'owner'
 def sources_current(self,*args):return next(self.current)
 def patch(self,table,filters,value):self.patches.append((filters,value))
 def request(self,*args):
  self.provider+=1;return {'choices':[{'finish_reason':'stop','message':{'content':'{"summary":"Sem novo pedido.","items":[]}'}}],'usage':{'total_tokens':123}}

class ProcessFreshnessTests(unittest.TestCase):
 def run_process(self,current,finish=True):
  e=ProcessHarness(current,finish);self.assertEqual(e.process('owner','synthetic-session',{},dt.datetime.now(UTC)),0);return e
 def test_change_after_lease_releases_without_provider_and_is_not_global_failure(self):
  e=self.run_process([False]);self.assertEqual(e.provider,0);self.assertEqual(e.finished[0]['p_usage'],{'total_tokens':0,'provider_started':False});self.assertEqual(e.patches[0][1]['state'],'blocked')
 def test_rejected_finish_does_not_overwrite_newer_lease(self):
  e=self.run_process([False],False);self.assertFalse(e.patches)
 def test_change_during_provider_preserves_usage_without_publishing(self):
  e=self.run_process([True,False]);self.assertEqual(e.provider,1);self.assertEqual(e.finished[0]['p_usage'],{'total_tokens':123});self.assertEqual(e.patches[0][0]['attempt'],'eq.1')

if __name__=='__main__':unittest.main()
