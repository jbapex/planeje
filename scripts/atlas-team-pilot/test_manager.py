import copy,datetime as dt,json,sys,unittest
from pathlib import Path
from manager import FIELDS,SP,validate,scope_supports,model_context,named_account
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'atlas-events'))
from context import account_for

class ManagerTests(unittest.TestCase):
 def setUp(self):
  self.now=dt.datetime(2026,10,19,10,tzinfo=SP)
  self.ctx={'thread':{'owner_id':'owner','account_person_id':'account','current_person_id':'account','management_kind':'intake','management_data':{'finding_ids':['f1']}},'actor_id':'account','people':[{'id':'owner','name':'Dono Exemplo'},{'id':'account','name':'Conta Exemplo'},{'id':'executor','name':'Samuel Exemplo'}],'tasks':[],'task':None,'scope':{'entregaveis':{'videos':4}},'hours':{'start_time':'08:00','end_time':'17:00'},'messages':[]}
  self.result={k:None for k in FIELDS};self.result.update(reply='Vou conferir a organização do trabalho.',summary='Conta informou a alteração da legenda.',decision='ready',scope_status='within_scope',scope_basis='"videos": 4',task_title='Ajustar legenda',task_description='Ajustar a legenda do vídeo conforme texto informado e anexar a versão revisada.',task_type='video',executor_id='executor',finding_ids=['f1'])
 def valid(self,message='Samuel Exemplo vai ajustar a legenda do vídeo.'):
  return validate(copy.deepcopy(self.result),self.ctx,message,self.now)
 def test_ready_after_operational_clarification(self):self.assertEqual(self.valid()['decision'],'ready')
 def test_owner_demand_intake_reuses_organization_after_account_clarification(self):
  self.ctx['thread']['management_data']={'demand_ids':['demand']};self.result['finding_ids']=['demand']
  self.assertEqual(self.valid()['decision'],'ready')
 def test_greeting_cannot_identify_executor(self):self.assertEqual(self.valid('oi')['decision'],'ask')
 def test_unknown_scope_goes_owner(self):
  self.result['scope_status']='unknown';self.assertEqual(self.valid()['decision'],'owner_needed')
 def test_extra_budget_is_owner(self):
  self.result['scope_status']='budget_decision';self.assertEqual(self.valid()['decision'],'owner_needed')
 def test_staff_cannot_answer_as_owner(self):
  self.result['decision']='owner_answered'
  with self.assertRaises(ValueError):self.valid()
 def test_owner_cannot_skip_account(self):
  self.ctx['actor_id']='owner'
  with self.assertRaises(ValueError):self.valid()
 def test_cross_client_task_rejected(self):
  self.result['existing_task_id']='foreign'
  with self.assertRaises(ValueError):self.valid()
 def test_foreign_findings_rejected(self):
  self.result['finding_ids']=['foreign']
  with self.assertRaises(ValueError):self.valid()
 def test_missing_finding_cannot_create(self):
  self.result['finding_ids']=[];self.assertEqual(self.valid()['decision'],'ask')
 def test_no_fabricated_scope_basis(self):
  self.result['scope_basis']='O dono liberou tudo';self.assertEqual(self.valid()['decision'],'owner_needed')
 def test_zero_video_is_not_video_scope(self):self.assertFalse(scope_supports({'videos':0},'video'))
 def test_ads_not_authorized_by_video_service(self):
  self.result['task_type']='paid_traffic';self.assertEqual(self.valid()['decision'],'owner_needed')
 def test_inquiry_does_not_require_new_service(self):
  self.result['task_type']='interno';self.ctx['scope']={};self.assertEqual(self.valid()['decision'],'ready')
 def test_consultation_greeting_does_not_resolve_owner_question(self):
  self.ctx['thread']['management_kind']='consultation';self.result['decision']='resolved'
  self.assertEqual(self.valid('oi')['decision'],'ask')
 def test_publication_claim_needs_evidence_before_returning_to_owner(self):
  self.ctx['thread'].update(management_kind='consultation',shared_context={'text':'O vídeo foi postado?'})
  self.result['decision']='resolved';self.assertEqual(self.valid('O vídeo já foi postado sim.')['decision'],'ask')
 def test_publication_negative_status_is_useful_information(self):
  self.ctx['thread'].update(management_kind='consultation',shared_context={'text':'O vídeo foi postado?'})
  self.result['decision']='resolved';self.assertEqual(self.valid('O vídeo ainda não foi postado. Está em edição.')['decision'],'resolved')
 def test_consultation_with_link_is_reported_not_quality_approved(self):
  self.ctx['thread'].update(management_kind='consultation',shared_context={'text':'O vídeo foi postado?'})
  self.result.update(decision='delivered',evidence_url='https://example.invalid/post')
  self.assertEqual(self.valid('Foi postado, segue https://example.invalid/post')['decision'],'resolved')
 def test_delivery_without_evidence_is_question(self):
  self.result['decision']='delivered';self.assertEqual(self.valid()['decision'],'ask')
 def test_fake_evidence_rejected(self):
  self.result['evidence_url']='https://example.invalid/file'
  with self.assertRaises(ValueError):self.valid()
 def test_next_review_falls_in_business_hours(self):
  result=self.valid();review=dt.datetime.fromisoformat(result['review_at']);self.assertEqual(review.hour,11);self.assertIsNone(result['expected_at'])
 def test_existing_task_does_not_transfer(self):
  self.ctx['tasks']=[{'id':'t1','terminal':False,'assignee_ids':['account']}];self.result['existing_task_id']='t1';self.assertEqual(self.valid()['decision'],'ask')
 def test_complete_index_preserved_for_large_client(self):
  self.ctx['tasks']=[{'id':str(i),'title':'Vídeo '+str(i),'description':'x'*1500,'terminal':i<106,'assignee_ids':['executor'],'due_date':None} for i in range(110)]
  self.ctx['messages']=[{'role':'human','actor_id':'account','content':'a'*4000,'created_at':'2026-10-19'} for i in range(40)]
  result=model_context(self.ctx);self.assertEqual(len(result['tasks']),110);self.assertLess(len(json.dumps(result)),65000)
 def test_uuid_responsible(self):
  person={'id':'id123','full_name':'Pessoa Exemplo','status':'active','role':'colaborador'};self.assertEqual(account_for({'responsavel':'id123'},[person]),person)
 def test_ambiguous_name_not_guessed(self):
  people=[{'id':str(i),'full_name':'Pessoa Exemplo','status':'active','role':'colaborador'} for i in range(2)];self.assertIsNone(account_for({'responsavel':'Pessoa Exemplo'},people))
 def test_inactive_responsible_not_selected(self):self.assertIsNone(account_for({'responsavel':'p'},[{'id':'p','status':'inactive','role':'colaborador'}]))
 def test_owner_can_just_name_account(self):self.assertEqual(named_account('Pode ser a Samuel',self.ctx['people'],'owner'),'executor')
 def test_ambiguous_account_not_guessed(self):self.assertIsNone(named_account('Pode ser Samuel ou Conta',self.ctx['people'],'owner'))
 def test_uncertain_account_not_saved(self):self.assertIsNone(named_account('Não sei, talvez Samuel?',self.ctx['people'],'owner'))

if __name__=='__main__':unittest.main()
