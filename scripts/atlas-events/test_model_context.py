import copy
import unittest
from model_context import model_context

class ModelContextTests(unittest.TestCase):
 def setUp(self):
  self.source={'messages':[{'id':'m','body':'Ajustar o vídeo de inauguração.'}],'tasks':[{'id':'a','title':'Atual','description':'detalhes ativos','terminal':False},{'id':'b','title':'Histórico antigo','description':'histórico longo','terminal':True},{'id':'c','title':'Vídeo de inauguração','description':'detalhes citados','terminal':True}], 'comments':[{'task_id':'a','content':'Em andamento'},{'task_id':'b','content':'Comentário antigo'}],'memories':[{'content':'Direção do dono'}],'requests':[],'coverage':{}}
 def test_original_source_is_unchanged(self):
  original=copy.deepcopy(self.source);model_context(self.source);self.assertEqual(original,self.source)
 def test_all_messages_preserved(self):self.assertEqual(model_context(self.source)['messages'],self.source['messages'])
 def test_all_task_ids_and_titles_preserved(self):self.assertEqual([(t['id'],t['title']) for t in model_context(self.source)['tasks']],[(t['id'],t['title']) for t in self.source['tasks']])
 def test_active_and_cited_tasks_keep_details(self):self.assertEqual([t['id'] for t in model_context(self.source)['tasks'] if 'description' in t],['a','c'])
 def test_previous_linked_request_expands_detail(self):
  self.source['requests']=[{'task_id':'b'}];self.assertIn('description',model_context(self.source)['tasks'][1])
 def test_comment_coverage_is_explicit(self):
  value=model_context(self.source);self.assertEqual(value['coverage']['comments_total'],2);self.assertEqual(value['coverage']['comments_included'],1)
 def test_owner_memories_preserved(self):self.assertEqual(model_context(self.source)['memories'],self.source['memories'])
 def test_initial_manual_review_focuses_latest_without_claiming_it_is_new(self):
  value=model_context(self.source);self.assertEqual(value['focus_ids'],['m']);self.assertFalse(value.get('new_ids'))
 def test_new_message_batch_keeps_its_actual_focus(self):
  self.source['new_ids']=['m'];self.assertNotIn('focus_ids',model_context(self.source))

if __name__=='__main__':unittest.main()
