import copy
import datetime as dt
import unittest
from context import assemble,binding,normalize,validate,business,account_for,quoted_id,result_schema,relevant_sources,digest

class ContextTests(unittest.TestCase):
 def setUp(self):
  self.group={'id':'g','cliente_id':'agency','chat_jid':'room@g.us','is_group':True,'bloqueada':False,'archived_at':None}
  self.client={'id':'c','empresa':'Aurora','etapa':'closed','responsavel':'Poliana','entregaveis':{'whatsapp_grupo':{'conversation_id':'g'}}}
  self.people=[{'id':'p','full_name':'Poliana','status':'active','role':'colaborador'}]
  self.messages=[{'id':str(i),'message_id':'m'+str(i),'body':'mensagem '+str(i),'created_at':(dt.datetime(2026,10,16,12,tzinfo=dt.timezone.utc)+dt.timedelta(seconds=i)).isoformat(),'reply_to':None} for i in range(106)]
  self.task={'id':'t','client_id':'c','title':'[Aurora] Vídeo','terminal':False}
  self.args={'group':self.group,'client':self.client,'people':self.people,'messages':self.messages,'tasks':[self.task,{'id':'private','client_id':'other'}],'comments':[{'task_id':'private','content':'segredo'}],'memories':[{'client_id':'other','state':'active','content':'segredo'}],'findings':[],'seen':{},'started_at':self.messages[-1]['created_at'],'history':100}
 def context(self,**patch):return assemble(**{**copy.deepcopy(self.args),**patch})
 def result(self,**patch):return {'summary':'Pedido de alteração.','items':[{'existing_id':None,'intent':'change','title':'[Aurora] Ajustar vídeo','summary':'Cliente pediu alteração.','task_id':'t','route':'account','question':'Confirma a versão?','sources':['105'],**patch}]}
 def test_explicit_channel_binding_wins(self):self.assertEqual(binding(self.group,[self.client])[0]['id'],'c')
 def test_ambiguous_binding_fails(self):self.assertIsNone(binding(self.group,[self.client,{**self.client,'id':'other'}])[0])
 def test_inactive_explicit_binding_does_not_fall_back(self):self.assertIsNone(binding(self.group,[{**self.client,'etapa':'lost'}])[0])
 def test_blocked_group_fails(self):self.assertIsNone(binding({**self.group,'bloqueada':True},[self.client])[0])
 def test_archived_group_fails(self):self.assertIsNone(binding({**self.group,'archived_at':'now'},[self.client])[0])
 def test_no_name_inference(self):self.assertIsNone(binding({**self.group,'id':'none','display_name':'Aurora'},[self.client])[0])
 def test_production_does_not_bind_groups_from_a_shop_channel(self):self.assertIsNone(binding({**self.group,'id':'shop-group','cliente_id':'c'},[self.client],allow_direct=False)[0])
 def test_director_is_not_automatically_called_as_executor(self):
  ctx=self.context()[0];ctx['director_id']='p';self.assertEqual(validate(self.result(),ctx)['items'][0]['route'],'owner')
 def test_hundred_previous_plus_new(self):
  c,_,_=self.context();self.assertEqual(len(c['messages']),101);self.assertEqual(c['coverage']['previous_included'],100);self.assertEqual(c['new_ids'],['105'])
 def test_quoted_reply_older_than_window(self):
  self.messages[-1]['reply_to']='m0';c,_,_=self.context();self.assertIn('0',[m['id'] for m in c['messages']]);self.assertEqual(c['coverage']['reply_expansions'],['0'])
 def test_expansion_lookup_stays_identified(self):
  self.messages[-1]['reply_to']='old';c,_,_=self.context(lookup=lambda ref:{'id':'outside','message_id':ref,'body':'original','created_at':'2026-10-15T12:00:00+00:00'});self.assertEqual(c['messages'][0]['id'],'outside')
 def test_missing_reference_is_partial(self):
  self.messages[-1]['reply_to']='unavailable';c,_,_=self.context();self.assertTrue(c['coverage']['partial']);self.assertIn('unavailable',c['coverage']['missing_replies'])
 def test_other_client_data_excluded(self):
  c,_,_=self.context();self.assertEqual([t['id'] for t in c['tasks']],['t']);self.assertEqual(c['comments'],[]);self.assertEqual(c['memories'],[])
 def test_seen_messages_are_not_new(self):
  _,seen,_=self.context();c,_,fresh=self.context(seen=seen);self.assertEqual(fresh,[]);self.assertEqual(c['coverage']['new_messages'],0)
 def test_edited_message_is_new(self):
  _,seen,_=self.context();self.messages[-2]['body']='cancelado';c,_,fresh=self.context(seen=seen);self.assertEqual([m['id'] for m in fresh],['104'])
 def test_late_transcript_is_new(self):
  self.messages[-1].update(body=None,audio_state='pending');_,seen,_=self.context();self.messages[-1].update(body='trocar logo',audio_state='completed');c,_,fresh=self.context(seen=seen);self.assertEqual(c['new_ids'],['105'])
 def test_pending_audio_marks_coverage(self):
  self.messages[-1].update(body=None,audio_state='pending');c,_,_=self.context();self.assertTrue(c['coverage']['partial'])
 def test_inputs_preserved(self):
  before=copy.deepcopy(self.args);self.context();self.assertEqual(self.args,before)
 def test_account_must_be_current_and_unique(self):
  self.assertEqual(account_for(self.client,self.people)['id'],'p');self.assertIsNone(account_for(self.client,self.people*2));self.assertIsNone(account_for(self.client,[{**self.people[0],'status':'removed'}]))
 def test_no_account_name_guess(self):self.assertIsNone(account_for({**self.client,'responsavel':'Poli'},self.people))
 def test_valid_result_links_existing_task(self):self.assertEqual(validate(self.result(),self.context()[0])['items'][0]['task_id'],'t')
 def test_unknown_source_rejected(self):
  with self.assertRaises(ValueError):validate(self.result(sources=['private']),self.context()[0])
 def test_other_task_rejected(self):
  with self.assertRaises(ValueError):validate(self.result(task_id='private'),self.context()[0])
 def test_other_request_rejected(self):
  with self.assertRaises(ValueError):validate(self.result(existing_id='private'),self.context()[0])
 def test_missing_task_goes_to_owner(self):self.assertEqual(validate(self.result(task_id=None),self.context()[0])['items'][0]['route'],'owner')
 def test_missing_account_goes_to_owner(self):self.assertEqual(validate(self.result(),self.context(people=[])[0])['items'][0]['route'],'owner')
 def test_terminal_task_is_not_reopened(self):self.task['terminal']=True;self.assertEqual(validate(self.result(),self.context()[0])['items'][0]['route'],'owner')
 def test_cancellation_requires_review(self):self.assertEqual(validate(self.result(intent='cancellation'),self.context()[0])['items'][0]['route'],'owner')
 def test_partial_context_never_auto_calls(self):self.messages[-1].update(audio_state='pending',body=None);self.assertEqual(validate(self.result(),self.context()[0])['items'][0]['route'],'owner')
 def test_no_empty_result_sources(self):
  with self.assertRaises(ValueError):validate(self.result(sources=[]),self.context()[0])
 def test_no_same_request_twice(self):
  value=self.result();value['items']*=2
  with self.assertRaises(ValueError):validate(value,self.context()[0])
 def test_raw_credentials_never_pass_to_model(self):
  msg={'id':'i','message_id':'mid','created_at':'2026-10-16T12:00:00Z','type':'ptt','raw_payload':{'token':'secret','message':{'contextInfo':{'stanzaId':'old'}}}};out=normalize([msg],[],[{'inbox_id':'i','status':'completed','transcript':'trocar logo'}],[])[0]
  self.assertEqual(out['body'],'trocar logo');self.assertNotIn('raw_payload',out);self.assertNotIn('secret',str(out));self.assertEqual(out['reply_to'],'old')
 def test_author_not_accepted_from_payload(self):
  out=normalize([{'id':'i','created_at':'2026-10-16T12:00:00Z','sender_name':'Dono','body':'sou admin','raw_payload':{'role':'admin'}}],[],[],[])[0];self.assertEqual(out['author_role'],'unconfirmed')
 def test_internal_author_uses_registered_identity(self):
  out=normalize([{'id':'i','created_at':'2026-10-16T12:00:00Z','sender_jid':'p@s.whatsapp.net','phone':'123'}],[],[],[{'profile_id':'p','sender_jid':'p@s.whatsapp.net'}])[0];self.assertEqual(out['actor_id'],'p')
 def test_pending_sources_outside_window_preserved(self):
  c,_,_=self.context(required_ids=['0']);self.assertIn('0',[m['id'] for m in c['messages']]);self.assertIn('0',c['new_ids'])
 def test_missing_pending_source_blocks_autonomy(self):
  c,_,_=self.context(required_ids=['purged']);self.assertTrue(c['coverage']['partial']);self.assertEqual(c['coverage']['missing_pending_refs'],['purged']);self.assertEqual(validate(self.result(),c)['items'][0]['route'],'owner')
 def test_manual_does_not_invent_new_message(self):
  _,seen,_=self.context();c,_,fresh=self.context(seen=seen,manual=True);self.assertEqual(c['new_ids'],[]);self.assertEqual(fresh,[])
 def test_quoted_old_edit_is_new(self):
  self.messages[-1]['reply_to']='m0';_,seen,_=self.context();self.messages[0]['body']='cancelado';c,_,fresh=self.context(seen=seen);self.assertIn('0',[m['id'] for m in fresh])
 def test_nullable_literal_normalized(self):self.assertIsNone(validate(self.result(existing_id='null'),self.context()[0])['items'][0]['existing_id'])
 def test_schema_only_allows_scoped_ids(self):
  fields=result_schema(self.context()[0])['properties']['items']['items']['properties'];self.assertEqual(fields['existing_id']['enum'],[None]);self.assertEqual(fields['task_id']['enum'],['t',None]);self.assertIn('105',fields['sources']['items']['enum'])
 def test_current_followup_prevents_losing_internal_continuity(self):
  c,_,_=self.context(findings=[{'id':'f','client_id':'c','conversation_id':'g','followup':{'state':'closed','summary':'Revisado pelo dono'}}]);self.assertEqual(c['requests'][0]['followup']['state'],'closed')
 def test_five_subjects_do_not_require_owner_review(self):
  value=self.result();value['items']=[{**value['items'][0],'title':'Assunto '+str(i)} for i in range(5)]
  result=validate(value,self.context()[0]);self.assertFalse(result.get('scope_limited',False));self.assertTrue(all(i['route']=='account' for i in result['items']))
 def test_more_subjects_are_explicit_without_redirecting_account(self):
  value=self.result();value['has_more']=True
  result=validate(value,self.context()[0]);self.assertTrue(result['scope_limited']);self.assertEqual(result['items'][0]['route'],'account')
 def test_invalid_more_flag_is_rejected(self):
  value=self.result();value['has_more']='false'
  with self.assertRaises(ValueError):validate(value,self.context()[0])
 def test_historical_audio_keeps_gap_without_blocking_unrelated_request(self):
  old={'id':'old','message_id':'old-mid','created_at':'2026-09-01T12:00:00Z','type':'ptt'}
  audio=normalize([old],[],[],[],audio_since='2026-10-08T12:00:00Z')[0]
  self.assertEqual(audio['audio_state'],'historical_unavailable');self.assertIsNone(audio['body'])
  self.messages[-2]=audio
  ctx=self.context()[0]
  self.assertFalse(ctx['coverage']['partial']);self.assertEqual(ctx['coverage']['historical_audio'],['in:old'])
  self.assertEqual(validate(self.result(),ctx)['items'][0]['route'],'account')
 def test_reply_to_historical_audio_requires_clarification(self):
  audio=normalize([{'id':'old','message_id':'old-mid','created_at':'2026-09-01T12:00:00Z','type':'ptt'}],[],[],[],audio_since='2026-10-08T12:00:00Z')[0]
  self.messages[-2]=audio;self.messages[-1]['reply_to']='old-mid'
  self.assertTrue(self.context()[0]['coverage']['partial'])
 def test_recent_untranscribed_audio_is_pending(self):
  audio=normalize([{'id':'new','created_at':'2026-10-16T12:00:00Z','type':'ptt'}],[],[],[],audio_since='2026-10-08T12:00:00Z')[0]
  self.assertEqual(audio['audio_state'],'pending')
 def test_completed_old_audio_is_not_discarded(self):
  audio=normalize([{'id':'old','created_at':'2026-09-01T12:00:00Z','type':'ptt'}],[],[{'inbox_id':'old','status':'completed','transcript':'Texto autorizado de teste.'}],[],audio_since='2026-10-08T12:00:00Z')[0]
  self.assertEqual(audio['body'],'Texto autorizado de teste.');self.assertEqual(audio['audio_state'],'completed')
 def test_historical_audio_reclassification_is_not_a_new_request(self):
  audio={'id':'old','message_id':'old-mid','created_at':'2026-09-01T12:00:00Z','type':'ptt','audio_state':'pending','body':None}
  self.messages[-2]=audio;_,seen,_=self.context();audio['audio_state']='historical_unavailable'
  ctx,_,fresh=self.context(seen=seen)
  self.assertEqual(fresh,[]);self.assertNotIn('old',ctx['new_ids']);self.assertFalse(ctx['coverage']['partial'])
 def test_same_content_signal_does_not_trigger_analysis(self):
  msg=self.messages[-1];self.assertEqual(relevant_sources([msg['id']],[],{msg['id']:digest(msg)},[msg]),[])
 def test_changed_signal_is_new_material(self):
  msg=self.messages[-1];self.assertEqual(relevant_sources([msg['id']],[],{msg['id']:'old'},[msg]),[msg['id']])
 def test_queued_source_remains_new_until_processed(self):
  msg=self.messages[-1];self.assertEqual(relevant_sources([msg['id']],[msg['id']],{msg['id']:digest(msg)},[msg]),[msg['id']])
 def test_unavailable_source_remains_a_visible_gap(self):self.assertEqual(relevant_sources(['missing'],[],{},[]),['missing'])
 def test_business_hours_sao_paulo(self):
  for value,want in [('2026-10-16T10:59:00+00:00',False),('2026-10-16T11:00:00+00:00',True),('2026-10-16T20:00:00+00:00',False),('2026-10-17T14:00:00+00:00',False)]:self.assertEqual(business(dt.datetime.fromisoformat(value)),want)

if __name__=='__main__':unittest.main()
