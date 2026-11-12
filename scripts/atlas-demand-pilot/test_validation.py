import copy
import unittest
from server import validate_result

class ModelDraftValidation(unittest.TestCase):
 def setUp(self):
  self.context={'basis_hash':'current','coverage':{'whatsapp_read':False},'team':[{'id':'staff'}],'tasks':[{'id':'task'}],'projects':[{'id':'project'}]}
  self.value={'summary':'Próximo passo para revisão.','owner_question':'','task':{'title':'Apurar resultado','description':'Levantar dados e registrar evidências.','type':'interno','assignee_id':'staff','existing_task_id':None,'project_id':None,'due_date':None}}
 def test_strategic_question_has_no_executable_task(self):
  self.value['owner_question']='Autoriza ampliar o escopo?'
  self.value['task'].update(existing_task_id='unknown',assignee_id='',project_id='unknown')
  result=validate_result(self.value,self.context)
  self.assertEqual(result['task']['title'],'')
  self.assertIsNone(result['task']['existing_task_id'])
  self.assertEqual(result['context_hash'],'current')
 def test_execution_rejects_unauthorized_links(self):
  for key in ['existing_task_id','assignee_id','project_id']:
   value=copy.deepcopy(self.value);value['task'][key]='unknown'
   with self.assertRaises(ValueError): validate_result(value,self.context)
 def test_empty_optional_links_are_null(self):
  self.value['task'].update(existing_task_id='',project_id=' ')
  result=validate_result(self.value,self.context)
  self.assertIsNone(result['task']['project_id'])
  self.assertIsNone(result['task']['existing_task_id'])
 def test_missing_owner_does_not_silently_delegate(self):
  self.value['task']['assignee_id']=None
  self.assertTrue(validate_result(self.value,self.context)['owner_question'])
 def test_invalid_date_rejected(self):
  self.value['task']['due_date']='amanhã'
  with self.assertRaises(ValueError): validate_result(self.value,self.context)

if __name__=='__main__': unittest.main()
