"""Event/context engine in the isolated pilot only. Never deploy this entrypoint to production."""
from pathlib import Path
import datetime as dt
import hashlib
import importlib.util
import json
import os
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler
from socketserver import ThreadingUnixStreamServer
from context import ANALYSIS_OUTPUT_TOKENS,SP,assemble,binding,business,digest,normalize,SYSTEM,SCHEMA,validate,result_schema,relevant_sources,classification_refs

ROOT=Path('/opt/planeje-cs-integration')
BASE=Path(__file__).resolve().parents[1]/'atlas-demand-pilot/server.py'
if not BASE.is_file():BASE=ROOT/'candidate/scripts/atlas-demand-pilot/server.py'
if not BASE.is_file():BASE=ROOT/'server.py'
spec=importlib.util.spec_from_file_location('atlas_demand_bridge',BASE);demand=importlib.util.module_from_spec(spec);spec.loader.exec_module(demand)
CLIENT_FIELDS='id,empresa,etapa,responsavel,etiquetas,entregaveis,objetivo_meta,sobre_empresa,tipo_contrato,tipo_servico'
GROUP_FIELDS='id,cliente_id,display_name,chat_jid,is_group,bloqueada,archived_at,last_message_at,updated_at,whatsapp_config_id'
INBOX_FIELDS='id,message_id,created_at,sender_name,sender_jid,phone,type,body,raw_payload,media_purged_at'
TASK_FIELDS='id,client_id,title,description,status,due_date,assignee_ids,project_id,production_delivered_at,stage_due_at'
MEMORY_FIELDS='id,client_id,content,state,version,created_at,source,learning_kind,evidence,source_quote,source_job_id'

def group_source(group):
    channel=group.get('whatsapp_config_id')
    return {'wa_client_id':group['cliente_id'],'channel_id':channel,
            'group_jid':(group.get('chat_jid') or '').strip().lower()} if channel else None

def message_scope(group):
    filters={'conversation_id':'eq.'+group['id']}
    if source:=group_source(group):
        filters.update(cliente_id='eq.'+source['wa_client_id'],whatsapp_config_id='eq.'+source['channel_id'])
    return filters

class SourceChanged(ValueError):
    """Expected freshness guard; preserve the input without treating it as a provider failure."""


class Engine(demand.Bridge):
    def __init__(self):
        if socket.gethostname()!='srv1968820' or os.environ.get('ATLAS_DEMAND_ENV')=='production':raise RuntimeError('Este piloto não executa na produção.')
        super().__init__();self.host='127.0.0.1:4320';self.origins={'http://127.0.0.1:4320','http://localhost:4320'};self.lock=threading.Lock();self.login_token=None;self.login_at=0
    def data(self,table,query=None,body=None,method=None,token=None,upsert=False):
        url=self.base+'/rest/v1/'+table
        if query:url+='?'+urllib.parse.urlencode(query)
        headers={'Host':self.host,'apikey':self.keys['anon'],'Authorization':'Bearer '+(token or self.keys['service']),'Content-Type':'application/json','Prefer':'return=representation'+(',resolution=merge-duplicates' if upsert else '')}
        with urllib.request.urlopen(urllib.request.Request(url,None if body is None else json.dumps(body).encode(),headers,method=method),timeout=35) as res:
            raw=res.read();return json.loads(raw) if raw else None
    def rows(self,table,fields,filters=None,token=None,order='id',maximum=30000):
        result=[]
        if order=='id':order={'atlas_event_config':'owner_id','atlas_event_groups':'conversation_id','atlas_audio_transcripts':'inbox_id','atlas_office_clients':'client_id'}.get(table,'id')
        for offset in range(0,maximum,500):
            rows=self.data(table,{'select':fields,'order':order,'limit':500,'offset':offset,**(filters or {})},token=token)
            result.extend(rows)
            if len(rows)<500:return result
        raise ValueError('Fonte extensa ou incompleta; nenhum recorte foi tratado como inventário completo.')
    def owner_token(self):
        if not self.login_token or time.time()-self.login_at>1200:
            # Existing synthetic test owner only. No production credentials are copied.
            owner=json.loads((ROOT/'test-access.json').read_text())['owner']
            self.login_token=self.request(self.base+'/auth/v1/token?grant_type=password',{'email':owner['email'],'password':owner['password']})['access_token'];self.login_at=time.time()
        return self.login_token
    def patch(self,table,filters,value):return self.data(table,filters,value,'PATCH')
    def resolve_groups(self,groups,clients,owner):
        return {group['id']:binding(group,clients,allow_direct=getattr(self,'allow_direct_binding',True)) for group in groups}
    def message_inventory(self,filters,token):
        result={}
        references=set()
        for name,prefix,table,fields in [('received','in:','cliente_whatsapp_inbox','id,media_purged_at'),('sent','out:','cliente_whatsapp_sent','id')]:
            rows=self.rows(table,fields,filters,token)
            ids=sorted(row['id'] for row in rows if not row.get('media_purged_at'))
            references.update(prefix+source_id for source_id in ids)
            result[name]={'count':len(ids),'sha256':hashlib.sha256('\n'.join(ids).encode()).hexdigest()}
        return result,references
    def scan(self,token,manual=False,now=None,client_id=None):
        if not self.lock.acquire(blocking=False):return {'busy':True}
        owner=None
        try:
            owner=self.identity(token);configs=self.rows('atlas_event_config','*',{'owner_id':'eq.'+owner},token)
            if not configs or not configs[0]['enabled']:return {'enabled':False}
            cfg=configs[0];now=now or dt.datetime.now(dt.timezone.utc)
            audio_settings=self.rows('atlas_settings','audio_since',{'owner_id':'eq.'+owner},token)
            audio_since=max(stamp_iso(audio_settings[0]['audio_since']),now-dt.timedelta(days=35)).isoformat() if audio_settings and audio_settings[0].get('audio_since') else None
            if client_id and client_id not in cfg['client_ids']:raise PermissionError('Cliente fora da seleção autorizada.')
            self.scan_client=client_id
            if client_id:cfg={**cfg,'client_ids':[client_id]}
            clients=self.rows('clientes',CLIENT_FIELDS,token=token);people=self.rows('profiles','id,full_name,role,status',token=token)
            groups=self.rows('atendimento_conversas',GROUP_FIELDS,{'is_group':'eq.true','bloqueada':'eq.false','archived_at':'is.null'},token)
            bindings=self.resolve_groups(groups,clients,owner)
            prior={g['conversation_id']:g for g in self.rows('atlas_event_groups','*',{'owner_id':'eq.'+owner},token)}
            statuses={s['value']:s for s in self.rows('task_statuses','value,label,is_terminal',token=token)}
            findings=self.rows('atlas_event_findings','*',{'owner_id':'eq.'+owner},token)
            management=self.rpc('atlas_manager_snapshot',{'p_owner':owner}) if getattr(self,'manager_enabled',False) else None
            threads={t['id']:t for t in (management['threads'] if management else self.rows('atlas_team_threads','id,client_id,task_id,state,next_review_at,summary,evidence_url,updated_at',{'owner_id':'eq.'+owner},token))}
            for finding in findings:
                followup=threads.get(finding.get('thread_id'))
                if followup and followup['client_id']==finding['client_id'] and followup['task_id']==finding['task_id']:finding['followup']=followup
            pending=self.rows('atlas_event_jobs','*',{'owner_id':'eq.'+owner,'state':'in.(queued,budget_wait,blocked,error)'},token)
            office_requests=self.rows('atlas_office_clients','client_id,requested_at,analyzed_at',{'owner_id':'eq.'+owner},token)
            requested={r['client_id'] for r in office_requests if r.get('requested_at') and (not r.get('analyzed_at') or r['requested_at']>r['analyzed_at'])}
            signals=self.rows('atlas_event_signals','id,client_id,conversation_id,created_at,kind,source_id,source_version',{'owner_id':'eq.'+owner},token,order='created_at,id')
            totals={'groups':0,'queued':0,'blocked':0,'model_calls':0,'after_hours':not business(now)}
            for group in groups:
                try:
                    client,reason=bindings.get(group['id'],(None,'Vínculo explícito ausente, divergente ou indisponível para o Atlas.'))
                    if client and client['id'] not in cfg['client_ids']:continue
                    # Unknown groups are not exported to another client; only coverage metadata is stored.
                    old=prior.get(group['id']) or {};seen=old.get('seen') or {};coverage=old.get('coverage') or {}
                    source=group_source(group)
                    if client and (old.get('client_id') not in (None,client['id']) or
                                   coverage.get('group_source') and coverage['group_source']!=source):
                        seen={};coverage={}
                    continuing=coverage.get('continuation_job')
                    if not client:
                        channels={((c.get('entregaveis') or {}).get('whatsapp_grupo') or {}).get('wa_cliente_id') for c in clients if c['id'] in cfg['client_ids']}
                        if group['cliente_id'] not in channels and not getattr(self,'allow_direct_binding',True):
                            if old and old.get('state')!='out_of_scope':self.patch('atlas_event_groups',{'owner_id':'eq.'+owner,'conversation_id':'eq.'+group['id']},{'state':'out_of_scope','client_id':None,'coverage':{},'seen':{},'reason':'Sem vínculo explícito; fora da leitura da agência.'})
                            continue
                        if group['id'] not in prior and group['cliente_id'] not in channels:continue
                        self.data('atlas_event_groups',{'on_conflict':'owner_id,conversation_id'},{'owner_id':owner,'conversation_id':group['id'],'client_id':None,'state':'unbound','reason':reason,'checked_at':now.isoformat()},'POST',upsert=True);totals['blocked']+=1;continue
                    totals['groups']+=1
                    force=manual or client['id'] in requested
                    sig=[s for s in signals if s['client_id']==client['id'] and (not s['conversation_id'] or s['conversation_id']==group['id'])]
                    head=digest([source,group.get('last_message_at'),group.get('updated_at'),sig[-1]['id'] if sig else None])
                    periodic=not old.get('checked_at') or (now-dt.datetime.fromisoformat(old['checked_at'])).total_seconds()>=cfg['review_seconds']
                    if not force and not continuing and coverage.get('message_inventory') and head==coverage.get('head') and not periodic:continue
                    window_start=coverage.get('source_last_at') or cfg['started_at']
                    # Capture before reading bodies so an arrival during assembly cannot look current.
                    filters=message_scope(group)
                    inventory,inventory_refs=self.message_inventory(filters,token)
                    group_findings=findings
                    if source:
                        seen={ref:version for ref,version in seen.items() if ref in inventory_refs}
                        group_findings=[f for f in findings if f['client_id']==client['id'] and f['conversation_id']==group['id']
                                        and f.get('sources') and all(ref in inventory_refs for ref in f['sources'])]
                    def window(table,fields):
                        fresh_rows=self.rows(table,fields,{**filters,'created_at':'gte.'+window_start},token,order='created_at,id')
                        latest=self.data(table,{'select':fields,**filters,'order':'created_at.desc,id.desc','limit':cfg['history_messages']},token=token)
                        if fresh_rows:
                            latest+=self.data(table,{'select':fields,**filters,'created_at':'lt.'+min(r['created_at'] for r in fresh_rows),'order':'created_at.desc,id.desc','limit':cfg['history_messages']},token=token)
                        return list({r['id']:r for r in [*latest,*fresh_rows]}.values())
                    inbox=window('cliente_whatsapp_inbox',INBOX_FIELDS)
                    sent=window('cliente_whatsapp_sent','id,message_id,created_at,sent_by,body')
                    trans=self.rows('atlas_audio_transcripts','inbox_id,status,transcript,finished_at',{'conversation_id':'eq.'+group['id']},token)
                    internal=self.rows('atendimento_grupo_remetente_interno','profile_id,sender_jid,phone',{'or':'(cliente_id.is.null,cliente_id.eq.'+group['cliente_id']+')'},token)
                    required=[]
                    for job in pending:
                        if job['conversation_id']!=group['id']:continue
                        prior_scope=(job.get('input') or {}).get('coverage',{}).get('group_source')
                        if source and (job.get('client_id')!=client['id'] or prior_scope not in (None,source)):continue
                        required.extend(ref for ref in job['source_refs'] if not source or prior_scope==source or ref in inventory_refs)
                    if continuing:required.extend(coverage.get('continuation_refs',[]))
                    required=list(dict.fromkeys(required))
                    pending_required=list(required)
                    for signal in sig:
                        if old.get('checked_at') and stamp_iso(signal['created_at'])<=stamp_iso(old['checked_at']):continue
                        prefix={'cliente_whatsapp_inbox':'in:','atlas_audio_transcripts':'in:','cliente_whatsapp_sent':'out:'}.get(signal['kind'])
                        if prefix and signal['source_id'] and (not source or prefix+signal['source_id'] in inventory_refs):
                            required.append(prefix+signal['source_id'])
                    required=list(dict.fromkeys(required))
                    # Prior classifications retain context without treating observed sources as new work.
                    load_refs=list(dict.fromkeys([*required,*classification_refs(group_findings,client['id'],group['id'])]))
                    for prefix,table,fields,target in [('in:','cliente_whatsapp_inbox',INBOX_FIELDS,inbox),('out:','cliente_whatsapp_sent','id,message_id,created_at,sent_by,body',sent)]:
                        missing=[ref[len(prefix):] for ref in load_refs if ref.startswith(prefix) and ref[len(prefix):] not in {m['id'] for m in target}]
                        for start in range(0,len(missing),80):
                            target.extend(self.rows(table,fields,{**filters,'id':'in.('+','.join(missing[start:start+80])+')'},token))
                    messages=normalize(inbox,sent,trans,internal,audio_since,people=people)
                    required=relevant_sources(required,pending_required,seen,messages)
                    tasks=self.rows('tarefas',TASK_FIELDS,{'client_id':'eq.'+client['id']},token)
                    for task in tasks:task['terminal']=bool(statuses.get(task.get('status'),{}).get('is_terminal'))
                    comments=[]
                    for i in range(0,len(tasks),80):
                        ids=[t['id'] for t in tasks[i:i+80]]
                        comments+=self.rows('task_comments','id,task_id,user_id,content,created_at',{'task_id':'in.('+','.join(ids)+')'},token) if ids else []
                    memories=self.rows('atlas_memories',MEMORY_FIELDS,{'owner_id':'eq.'+owner,'client_id':'eq.'+client['id'],'state':'eq.active'},token)
                    def lookup(ref,source_id=False):
                        for prefix,table,fields in [('in:','cliente_whatsapp_inbox',INBOX_FIELDS),('out:','cliente_whatsapp_sent','id,message_id,created_at,sent_by,body')]:
                            if source_id and not ref.startswith(prefix):continue
                            key,value=('id',ref[len(prefix):]) if source_id else ('message_id',ref)
                            matches=self.data(table,{'select':fields,**filters,key:'eq.'+value,'limit':1},token=token)
                            if matches:
                                rows=normalize(matches if prefix=='in:' else [],matches if prefix=='out:' else [],trans,internal,audio_since,people=people)
                                return rows[0] if rows else None
                        return None
                    context,versions,fresh=assemble(group=group,client=client,people=people,messages=messages,tasks=tasks,comments=comments,memories=memories,findings=group_findings,seen=seen,started_at=cfg['started_at'],history=cfg['history_messages'],manual=force,lookup=lookup,required_ids=required)
                    context['coverage']['message_inventory']=inventory
                    if source:context['coverage']['group_source']=source
                    context['waiting_threads']=self.rpc('atlas_manager_waiting_context',{'p_owner':owner,'p_client':client['id'],'p_conversation':group['id']}) if management else []
                    context['now_sao_paulo']=now.astimezone(SP).isoformat()
                    context['audio_since']=audio_since
                    if continuing:context['coverage']['continuation_from']=continuing
                    context['director_id']=owner
                    if management:
                        account_id=next((a['person_id'] for a in management['accounts'] if a['client_id']==client['id']),None)
                        if account_id:
                            context['account']=next((p for p in people if p['id']==account_id and p.get('status')=='active'),None)
                            context['coverage']['account_confirmed']=bool(context['account'])
                    # Learning alone waits for the next real event; it does not buy another analysis.
                    task_hash=digest([tasks,comments,[m for m in memories if not m.get('source_job_id')]]);changed=bool(fresh or required) or task_hash!=coverage.get('task_hash') and bool(coverage)
                    deadlines=sorted((t['id'],str(t.get('due_date')),str(t.get('stage_due_at'))) for t in tasks if not t.get('terminal') and (t.get('due_date') and str(t['due_date'])[:10]<now.astimezone(SP).date().isoformat() or t.get('stage_due_at') and stamp_iso(t['stage_due_at'])<=now))
                    deadline_changed=bool(coverage) and digest(deadlines)!=coverage.get('deadline_hash')
                    due=[f for f in group_findings if f['client_id']==client['id'] and f.get('state') not in ['no_action','closed']]
                    # No new material and no due review means no model call. Clock checks are cheap.
                    review_due=periodic and any(not f.get('thread_id') or not threads.get(f['thread_id']) or (not (management or {}).get('enabled') and threads[f['thread_id']]['state'] not in ['closed','delivery_review','needs_owner'] and threads[f['thread_id']].get('next_review_at') and stamp_iso(threads[f['thread_id']]['next_review_at'])<=now) for f in due)
                    refs=[m['id'] for m in fresh]
                    refs+=required
                    refs=list(dict.fromkeys(refs));context['new_ids']=list(dict.fromkeys(context['new_ids']))
                    has_usable=any(m.get('body') for m in context['messages'])
                    state='audio_pending' if context['coverage']['pending_audio'] else 'unchanged';error='Áudio pendente de transcrição.' if context['coverage']['pending_audio'] else None
                    if (changed or force or continuing or review_due or deadline_changed) and has_usable:
                        kind='messages' if refs else 'review'
                        fingerprint=digest(['context-v2',group['id'],source,versions,task_hash,[f['revision'] for f in due],continuing,int(now.timestamp()//cfg['review_seconds']) if review_due else None])
                        batch=[m for m in context['messages'] if m['id'] in context['new_ids']]
                        first=min((stamp_iso(m['created_at']) for m in batch),default=now)
                        last=max((stamp_iso(m['created_at']) for m in batch),default=now)
                        ready=min(last+dt.timedelta(seconds=cfg['quiet_seconds']),first+dt.timedelta(seconds=cfg['max_wait_seconds'])) if batch and not force else now
                        cov={**context['coverage'],'head':head,'task_hash':task_hash,'trigger':kind,'periodic_review_due':review_due,'deadline_hash':digest(deadlines)}
                        job=self.rpc('atlas_event_enqueue',{'p_owner':owner,'p_conversation':group['id'],'p_client':client['id'],'p_fingerprint':fingerprint,'p_input':context,'p_coverage':cov,'p_sources':refs,'p_kind':kind,'p_ready':ready.isoformat()})
                        state='queued';totals['queued']+=1
                        if context['coverage'].get('missing_pending_refs'):
                            state='blocked';error='Fonte de lote anterior indisponível; revisão necessária.';self.patch('atlas_event_jobs',{'id':'eq.'+job,'state':'eq.queued'},{'state':'blocked','error':error});totals['blocked']+=1
                        if any(ref in context['new_ids'] for ref in context['coverage']['pending_audio']):
                            state='audio_pending';error='Aguardando a transcrição para entender o novo áudio.';self.patch('atlas_event_jobs',{'id':'eq.'+job,'state':'eq.queued'},{'state':'blocked','error':error});totals['blocked']+=1
                    cov={**context['coverage'],'head':head,'task_hash':task_hash,'deadline_hash':digest(deadlines)}
                    self.data('atlas_event_groups',{'on_conflict':'owner_id,conversation_id'},{'owner_id':owner,'conversation_id':group['id'],'client_id':client['id'],'state':state,'reason':error,'seen':{**seen,**versions},'source_hash':digest(versions),'coverage':cov,'checked_at':now.isoformat()},'POST',upsert=True)
                    if client['id'] in requested:self.patch('atlas_office_clients',{'owner_id':'eq.'+owner,'client_id':'eq.'+client['id']},{'requested_at':None})
                except Exception as group_error:
                    self.identity(token)
                    reason=str(group_error)[:300] if isinstance(group_error,ValueError) else 'A leitura deste grupo ficou incompleta; fila e fontes preservadas para nova conferência.'
                    self.data('atlas_event_groups',{'on_conflict':'owner_id,conversation_id'},{'owner_id':owner,'conversation_id':group['id'],'state':'blocked','reason':reason,'checked_at':now.isoformat()},'POST',upsert=True)
                    totals['blocked']+=1
            self.identity(token)
            self.patch('atlas_event_config',{'owner_id':'eq.'+owner},{'heartbeat_at':now.isoformat(),'last_scan_at':now.isoformat(),'last_error':None})
            if manual:self.patch('atlas_event_jobs',{'owner_id':'eq.'+owner,'state':'in.(error,budget_wait)',**({'client_id':'eq.'+client_id} if client_id else {})},{'ready_at':now.isoformat()})
            if manual or requested or business(now):totals['model_calls']=self.process(owner,token,cfg,now)
            return totals
        except Exception:
            if owner:
                try:self.patch('atlas_event_config',{'owner_id':'eq.'+owner},{'heartbeat_at':dt.datetime.now(dt.timezone.utc).isoformat(),'last_error':'A conferência ficou incompleta; os pedidos existentes e a fila foram preservados.'})
                except Exception:pass
            raise
        finally:self.lock.release()
    def process(self,owner,token,cfg,now):
        calls=0
        # Publish a completed result again safely if the process stopped between completion and projection.
        for row in self.rows('atlas_event_jobs','id,input,result,conversation_id,source_refs,published_at',{'owner_id':'eq.'+owner,'state':'eq.completed','or':'(published_at.is.null,continuation_checked.eq.false)'},token):
            try:
                if not self.sources_current({**row['input'],'learning_job_id':row['id']},token,owner):
                    self.patch('atlas_event_jobs',{'id':'eq.'+row['id']},{'state':'blocked','error':'Fontes atuais mudaram; resultado anterior preservado para revisão.'});continue
                if (row.get('result') or {}).get('learnings'):self.rpc('atlas_event_learn',{'p_job':row['id']})
                if not row.get('published_at'):self.rpc('atlas_event_publish',{'p_job':row['id']})
                self.continue_topics(row,row.get('result') or {},token,owner)
            except urllib.error.HTTPError as error:
                if error.code>=500:raise
                self.patch('atlas_event_jobs',{'id':'eq.'+row['id']},{'state':'blocked','error':'Resultado preservado; vínculo ou tarefa atual precisa de revisão.'})
        self.open_accounts(owner,token,cfg,now)
        pending=self.rows('atlas_event_jobs','id,input',{'owner_id':'eq.'+owner,'state':'in.(queued,error,budget_wait,processing)'},token)
        if not pending:return 0
        estimate=len(SYSTEM.encode())+max(len(json.dumps(result_schema(j['input'])).encode()) for j in pending)+ANALYSIS_OUTPUT_TOKENS+200
        job=self.rpc('atlas_event_claim',{'p_owner':owner,'p_estimate':estimate})
        if not job:return 0
        response=None;provider_started=False
        try:
            self.identity(token)
            if not self.sources_current(job['input'],token,owner):raise SourceChanged('O contexto deste lote mudou; aguarde a conferência atual do cliente.')
            provider_started=True
            response=self.request('https://api.openai.com/v1/chat/completions',{'model':'gpt-4o-mini-2024-07-18','store':False,'temperature':0.15,'max_tokens':ANALYSIS_OUTPUT_TOKENS,'messages':[{'role':'system','content':SYSTEM},{'role':'user','content':json.dumps(job['input'],ensure_ascii=False)}],'response_format':{'type':'json_schema','json_schema':{'name':'atlas_event_analysis','strict':True,'schema':result_schema(job['input'])}}})
            choice=response['choices'][0]
            if choice.get('finish_reason')!='stop' or choice['message'].get('refusal'):raise ValueError('O modelo não concluiu uma análise válida.')
            candidate=json.loads(choice['message']['content'])
            try:result=validate(candidate,job['input'])
            except ValueError:
                # Preserve usage in the ledger without writing client text to runtime logs.
                raise
            self.identity(token)
            if not self.sources_current(job['input'],token,owner):raise SourceChanged('As fontes mudaram durante a análise. Resultado preservado para nova conferência.')
            saved=self.rpc('atlas_event_finish',{'p_job':job['id'],'p_lease':job['lease'],'p_result':result,'p_usage':response.get('usage',{}),'p_error':None})
            if saved:
                if result.get('learnings'):self.rpc('atlas_event_learn',{'p_job':job['id']})
                self.rpc('atlas_event_publish',{'p_job':job['id']});calls=1
                self.continue_topics(job,result,token,owner)
                self.open_accounts(owner,token,cfg,now)
        except Exception as error:
            finished=self.rpc('atlas_event_finish',{'p_job':job['id'],'p_lease':job['lease'],'p_result':{},'p_usage':response.get('usage',{}) if response else ({} if provider_started else {'total_tokens':0,'provider_started':False}),'p_error':str(error)[:500] if isinstance(error,ValueError) else 'Análise não concluída; fonte preservada para revisão.'})
            if isinstance(error,SourceChanged):
                if finished:self.patch('atlas_event_jobs',{'id':'eq.'+job['id'],'owner_id':'eq.'+owner,'state':'eq.error','attempt':'eq.'+str(job['attempt'])},{'state':'blocked','error':str(error)})
                return 0
            raise
        return calls

    def continue_topics(self,job,result,token,owner):
        acknowledged={'id':'eq.'+job['id'],'owner_id':'eq.'+owner}
        if not result.get('has_more'):
            self.patch('atlas_event_jobs',acknowledged,{'continuation_checked':True});return
        prior={r['request_key'] for r in job['input'].get('requests',[])}
        progressing=any(r.get('request_key') not in prior for r in result.get('items',[]))
        where={'owner_id':'eq.'+owner,'conversation_id':'eq.'+job['conversation_id']}
        rows=self.rows('atlas_event_groups','coverage',where,token)
        if not rows:return
        coverage={k:v for k,v in (rows[0].get('coverage') or {}).items() if k not in ('continuation_job','continuation_refs','continuation_stalled')}
        coverage.update({'continuation_job':job['id'],'continuation_refs':job.get('source_refs') or [m['id'] for m in job['input'].get('messages',[])]} if progressing else {'continuation_stalled':True})
        self.patch('atlas_event_groups',where,{'coverage':coverage})
        self.patch('atlas_event_jobs',acknowledged,{'continuation_checked':True})

    def sources_current(self,context,token,owner):
        """Never send a queued snapshot after its source/policy has changed."""
        cfg=self.rows('atlas_event_config','enabled,client_ids',{'owner_id':'eq.'+owner},token)
        cid=context['client']['id'];gid=context['conversation']['id']
        if not cfg or not cfg[0]['enabled'] or cid not in cfg[0]['client_ids']:return False
        clients=self.rows('clientes',CLIENT_FIELDS,token=token)
        groups=self.rows('atendimento_conversas',GROUP_FIELDS,{'id':'eq.'+gid},token)
        if not groups:return False
        client,_=self.resolve_groups(groups,clients,owner).get(gid,(None,None))
        if not client or client['id']!=cid or digest(client)!=digest(context['client']):return False
        coverage=context.get('coverage',{})
        if coverage.get('group_source')!=group_source(groups[0]):return False
        filters=message_scope(groups[0])
        actual_inventory,_=self.message_inventory(filters,token)
        if coverage.get('message_inventory')!=actual_inventory:return False
        incoming=[];outgoing=[]
        for prefix,table,fields,target in [('in:','cliente_whatsapp_inbox',INBOX_FIELDS,incoming),('out:','cliente_whatsapp_sent','id,message_id,created_at,sent_by,body',outgoing)]:
            ids=[m['id'][len(prefix):] for m in context['messages'] if m['id'].startswith(prefix)]
            for start in range(0,len(ids),80):target.extend(self.rows(table,fields,{**filters,'id':'in.('+','.join(ids[start:start+80])+')'},token))
        audio=self.rows('atlas_audio_transcripts','inbox_id,status,transcript,finished_at',{'conversation_id':'eq.'+gid},token)
        internal=self.rows('atendimento_grupo_remetente_interno','profile_id,sender_jid,phone',{'or':'(cliente_id.is.null,cliente_id.eq.'+groups[0]['cliente_id']+')'},token)
        people=self.rows('profiles','id,full_name,role,status',token=token)
        audio_settings=self.rows('atlas_settings','audio_since',{'owner_id':'eq.'+owner},token)
        audio_since=max(stamp_iso(audio_settings[0]['audio_since']),dt.datetime.now(dt.timezone.utc)-dt.timedelta(days=35)).isoformat() if audio_settings and audio_settings[0].get('audio_since') else None
        actual={m['id']:digest(m) for m in normalize(incoming,outgoing,audio,internal,audio_since,people=people)}
        if any(actual.get(m['id'])!=digest(m) for m in context['messages']):return False
        tasks=self.rows('tarefas',TASK_FIELDS,{'client_id':'eq.'+cid},token)
        fields=TASK_FIELDS.split(',');clean=lambda rows,keys:sorted([{k:v.get(k) for k in keys} for v in rows],key=lambda v:v['id'])
        if digest(clean(tasks,fields))!=digest(clean(context['tasks'],fields)):return False
        comments=[]
        for start in range(0,len(tasks),80):
            ids=[t['id'] for t in tasks[start:start+80]]
            if ids:comments+=self.rows('task_comments','id,task_id,user_id,content,created_at',{'task_id':'in.('+','.join(ids)+')'},token)
        if digest(clean(comments,['id','task_id','user_id','content','created_at']))!=digest(clean(context['comments'],['id','task_id','user_id','content','created_at'])):return False
        memories=self.rows('atlas_memories',MEMORY_FIELDS,{'owner_id':'eq.'+owner,'client_id':'eq.'+cid,'state':'eq.active'},token)
        memories=[m for m in memories if not context.get('learning_job_id') or m.get('source_job_id')!=context['learning_job_id']]
        if digest(clean(memories,MEMORY_FIELDS.split(',')))!=digest(clean(context['memories'],MEMORY_FIELDS.split(','))):return False
        if context.get('waiting_threads') is not None and context['waiting_threads']!=self.rpc('atlas_manager_waiting_context',{'p_owner':owner,'p_client':cid,'p_conversation':gid}):return False
        return True

    def open_accounts(self,owner,token,cfg,now):
        if cfg['mode']!='assist' or not business(now):return
        self.identity(token)
        managed=getattr(self,'manager_enabled',False) and (self.rpc('atlas_manager_snapshot',{'p_owner':owner}) or {}).get('enabled')
        if managed:self.rpc('atlas_manager_resolved',{'p_owner':owner})
        for finding in self.rows('atlas_event_findings','id,job_id',{'owner_id':'eq.'+owner,'route':'neq.none' if managed else 'eq.account','state':'in.(observed,update_for_review)' if managed else 'eq.observed',**({} if managed else {'thread_id':'is.null'})},token):
            try:
                source=self.rows('atlas_event_jobs','input',{'id':'eq.'+finding['job_id']},token)
                # Sibling returns from this published job may already be applied; the SQL writer checks this target's revision.
                actual_source={**{k:v for k,v in source[0]['input'].items() if k!='waiting_threads'},'learning_job_id':finding['job_id']} if source else None
                if not actual_source or not self.sources_current(actual_source,token,owner):
                    self.patch('atlas_event_findings',{'id':'eq.'+finding['id']},{'route':'owner','state':'observed','question':'O contexto mudou desde a análise. Confira as fontes atuais antes de chamar a equipe.'});continue
                if managed and self.rpc('atlas_manager_apply_event',{'p_finding':finding['id']}):continue
                self.rpc('atlas_manager_open' if managed else 'atlas_event_open_account',{'p_finding':finding['id']})
            except urllib.error.HTTPError as error:
                if error.code>=500:raise
                latest=self.rows('atlas_event_findings','thread_id,state',{'id':'eq.'+finding['id']},token)
                if latest and latest[0]['state']=='account_contacted':continue
                self.patch('atlas_event_findings',{'id':'eq.'+finding['id']},{'route':'owner','state':'observed','question':'Confirme o vínculo, a tarefa e o responsável atuais antes de abrir uma pergunta interna.'})

def stamp_iso(value):return dt.datetime.fromisoformat(value.replace('Z','+00:00'))

class Handler(BaseHTTPRequestHandler):
    server_version='AtlasEventsPilot'
    def log_message(self,*args):pass
    def do_POST(self):
        bridge=self.server.bridge
        try:
            if self.path!='/functions/v1/atlas-events':raise PermissionError()
            if self.headers.get('Origin') not in bridge.origins:raise PermissionError()
            authorization=self.headers.get('Authorization','');token=authorization[7:].strip() if authorization.startswith('Bearer ') else ''
            if not token:raise PermissionError()
            try:bridge.identity(token)
            except (PermissionError,urllib.error.HTTPError):raise PermissionError()
            size=int(self.headers.get('Content-Length','0'))
            if not 2<=size<=10000:raise ValueError('Pedido inválido.')
            body=json.loads(self.rfile.read(size))
            if body.get('action')!='scan':raise ValueError('Ação inválida.')
            client_id=body.get('client_id')
            if client_id is not None:client_id=demand.identifier(client_id)
            value={'ok':True,**bridge.scan(token,manual=True,client_id=client_id)};status=200
        except PermissionError:status=403;value={'ok':False,'error':'Entre na conta do gestor autorizado.'}
        except Exception:status=400;value={'ok':False,'error':'A análise não foi concluída. Confira cobertura, fila e limites; as fontes foram preservadas.'}
        raw=json.dumps(value).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)

if __name__=='__main__':
    engine=Engine()
    if '--once' in sys.argv:
        now=None
        if '--test-time' in sys.argv:now=dt.datetime.fromisoformat(sys.argv[sys.argv.index('--test-time')+1])
        print(json.dumps(engine.scan(engine.owner_token(),manual='--manual' in sys.argv,now=now)));sys.exit(0)
    path=ROOT/'dist/.runtime/events.sock';path.parent.mkdir(exist_ok=True,parents=True);path.unlink(missing_ok=True)
    server=ThreadingUnixStreamServer(str(path),Handler);server.bridge=engine;os.chown(path,-1,101);os.chmod(path,0o660)
    def cycle():
        while True:
            try:engine.scan(engine.owner_token())
            except Exception:print(json.dumps({'event':'atlas_event_scan_failed'}),flush=True)
            time.sleep(15)
    threading.Thread(target=cycle,daemon=True).start();server.serve_forever()
