"""Scoped adapter for the existing Atlas specialist executor; no new transport."""
import json
import os
from pathlib import Path
import re
import subprocess
import threading
import unicodedata
import uuid
from activity import record, specialist_step

SECTIONS = frozenset(('portfolio','client','tasks','task_detail','publications','plans',
                      'conversations','conversation','audio_transcript','team','traffic','results'))


class BudgetWait(ValueError):
    pass


def needed(message):
    text = ''.join(c for c in unicodedata.normalize('NFD', message.casefold()) if not unicodedata.combining(c))
    return bool(re.search(r'\b(?:grupos?|whatsapp|planejamento|planos?|escopo|projetos?|campanhas?|resultados?|comentarios?|publicacoes?|publicacao|postagem|postado|anexos?|contextualize|verifi(?:que|car)|confira|conferir|consult(?:e|ar))\b', text))


def read_source(bridge, request, client, section, options):
    if section not in SECTIONS or options.get('clientId') not in (None, client):
        raise ValueError('Fonte fora do cliente autorizado.')
    offset = options.get('offset', 0)
    if not isinstance(offset, int) or isinstance(offset, bool) or not 0 <= offset <= 1000000:
        raise ValueError('Recorte de fonte inválido.')
    args = {'p_request':request,'p_section':section,'p_reference':options.get('referenceId'),'p_offset':offset}
    month=options.get('referenceMonth')
    if month is not None:
        if not isinstance(month,str) or not re.fullmatch(r'20\d{2}-(?:0[1-9]|1[0-2])-01',month):
            raise ValueError('Mês inválido.')
        args['p_month']=month
    return bridge.rpc('atlas_team_read_source', args)


def revalidate(bridge, request, sources):
    for source in sources:
        current=bridge.rpc('atlas_team_read_source', {'p_request':request,'p_section':source['section'],
            'p_reference':source.get('reference_id'),'p_offset':source.get('offset',0),'p_month':source.get('reference_month')})
        if not source.get('source_version') or current.get('source_version') != source['source_version']:
            raise ValueError('As fontes mudaram durante a consulta; o pedido foi preservado.')


def model(bridge, request, payload, lease=None):
    call=str(uuid.uuid4())
    messages=[]
    image_tokens=0
    for message in payload.get('messages',[]):
        content=message.get('content')
        if isinstance(content,list):
            parts=[]
            for part in content:
                if part.get('type')=='image_url':
                    # GPT-4o-mini auto: at most eight tiles (48,169 tokens); reserve 50k, not base64 bytes.
                    image_tokens+=50000
                    parts.append({'type':'image_url'})
                else:parts.append(part)
            message={**message,'content':parts}
        messages.append(message)
    estimate=len(json.dumps({**payload,'messages':messages},ensure_ascii=False).encode())+image_tokens+payload.get('max_tokens',1600)+300
    reservation=bridge.rpc('atlas_model_reserve',{'p_call':call,'p_estimate':estimate,'p_request':request,'p_lease':lease})
    if not reservation.get('reserved'):
        raise BudgetWait('O teto diário foi atingido. A mensagem foi preservada para nova tentativa.')
    answer=None
    try:
        answer=bridge.request('https://api.openai.com/v1/chat/completions',payload)
        return answer
    finally:
        bridge.rpc('atlas_model_finish',{'p_call':call,'p_usage':answer.get('usage') if answer else None})


def run(bridge, request, context, message, lease=None):
    """Only public operational facts cross the adapter; no owner history or JWT."""
    client=context['thread']['client_id']
    path=Path(__file__).resolve().with_name('investigate.mjs')
    environment={k:v for k,v in os.environ.items() if k in ('PATH','LANG','LC_ALL','TZ','NODE_OPTIONS')}
    # Never inherit NODE_OPTIONS preload hooks into this closed protocol.
    environment.pop('NODE_OPTIONS',None)
    process=subprocess.Popen([os.environ.get('ATLAS_NODE_BIN','node'),str(path)],stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,encoding='utf-8',env=environment)
    timer=threading.Timer(55,process.kill)
    timer.start()
    sources=[]
    usage={'prompt_tokens':0,'completion_tokens':0,'total_tokens':0}
    try:
        process.stdin.write(json.dumps({'message':message,'clientId':client})+'\n');process.stdin.flush()
        for line in process.stdout:
            if len(line)>180000:
                raise ValueError('Consulta excedeu o recorte autorizado.')
            event=json.loads(line)
            if event.get('type')=='source':
                section=event['section'];options=event.get('options') or {}
                record(bridge,request,lease,'source',section=section)
                data=read_source(bridge,request,client,section,options)
                record(bridge,request,lease,'source','unavailable' if data.get('available') is False else 'partial' if (data.get('coverage') or {}).get('complete') is not True else 'completed',section=section,reference=options.get('referenceId'))
                sources.append({'section':section,'reference_id':options.get('referenceId'),'offset':options.get('offset',0),
                    'reference_month':options.get('referenceMonth'),'source_version':data.get('source_version')})
                response=data
            elif event.get('type')=='activity':
                specialist_step(bridge,request,lease,event.get('step') or {})
                response={'recorded':True}
            elif event.get('type')=='model':
                payload=event['payload']
                if len(json.dumps(payload,ensure_ascii=False).encode())>55000:
                    raise ValueError('Consulta muito extensa; detalhe preservado na fonte.')
                answer=model(bridge,request,{'model':'gpt-4o-mini-2024-07-18','store':False,'temperature':0.15,
                    'max_tokens':min(payload['maxTokens'],1200),'messages':payload['messages'],
                    **({'tools':payload['tools'],'tool_choice':'auto'} if payload.get('tools') else {})},lease=lease)
                for key in usage:
                    usage[key]+=answer.get('usage',{}).get(key,0)
                choice=answer.get('choices',[{}])[0]
                response={'message':choice.get('message'),'finish_reason':choice.get('finish_reason'),'usage':answer.get('usage'),'model':answer.get('model')}
            elif event.get('type')=='result':
                value=event['result']
                revalidate(bridge,request,sources)
                return {'content':value['content'],'evidence_status':value.get('evidence_status'),
                    'steps':value['steps'],'sources':sources,'usage':usage}
            else:
                raise ValueError('O Atlas não concluiu a investigação com fontes suficientes.')
            process.stdin.write(json.dumps(response,ensure_ascii=False)+'\n');process.stdin.flush()
        raise ValueError('A investigação foi interrompida; o pedido foi preservado.')
    except Exception as error:
        error.investigation_usage=usage
        raise
    finally:
        timer.cancel()
        if process.poll() is None:
            process.kill()
        process.communicate(timeout=5)
