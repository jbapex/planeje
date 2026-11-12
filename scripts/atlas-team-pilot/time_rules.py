"""Review clocks are independent of the task's official due date."""
import datetime as dt
import hashlib
import json
import re
from zoneinfo import ZoneInfo
from task_progress import task_progress, normalized

SP = ZoneInfo('America/Sao_Paulo')


def explicit_review_time(message, now):
    """An unambiguous spoken clock wins over model-generated ISO dates."""
    pattern=r'\b(hoje|amanh[ãa])\s*(?:[àa]s\s*)?(\d{1,2})(?:\s*h(?:oras?)?\s*(\d{2})?|:(\d{2}))?\b'
    hits=list(re.finditer(pattern,message,re.I))
    if len(hits)!=1 or not re.search(r'revis|retorn|volto|confer',message,re.I):
        return None
    hit=hits[0];hour=int(hit[2]);minute=int(hit[3] or hit[4] or 0)
    if hour>23 or minute>59:
        raise ValueError('Horário informado inválido.')
    day=now.astimezone(SP).date()+dt.timedelta(days=1 if hit[1].lower()!='hoje' else 0)
    return dt.datetime.combine(day,dt.time(hour,minute),SP).isoformat()


def parse_time(value):
    if not value:
        return None
    parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise ValueError('Informe o fuso da revisão.')
    return parsed.astimezone(SP)


def work_window(now, hours=None):
    hours = hours or {}
    now = now.astimezone(SP)
    start = dt.time.fromisoformat(hours.get('start_time', '08:00'))
    end = dt.time.fromisoformat(hours.get('end_time', '17:00'))
    if start >= end:
        raise ValueError('Expediente inválido.')
    day = now.date()
    return dt.datetime.combine(day, start, SP), dt.datetime.combine(day, end, SP)


def next_work_time(at, hours=None):
    at = at.astimezone(SP)
    for _ in range(15):
        start, end = work_window(at, hours)
        if at.weekday() < 5 and at < end:
            return max(at, start)
        at = dt.datetime.combine(at.date() + dt.timedelta(days=1), dt.time(0), SP)
    raise ValueError('Expediente não localizado.')


def review_plan(requested, now, hours=None, expected=None, due_date=None):
    """Normalize visibly before confirmation; alert before departure only for today's work."""
    now = now.astimezone(SP)
    requested = parse_time(requested)
    if requested is None:
        return None, ''
    if requested <= now or requested > now + dt.timedelta(days=90):
        raise ValueError('Escolha uma revisão futura, em até 90 dias.')
    normalized = next_work_time(requested, hours)
    note = 'Ajustei a revisão para o expediente cadastrado.' if normalized != requested else ''
    _, end = work_window(now, hours)
    before_exit = end - dt.timedelta(minutes=15)
    promised = parse_time(expected)
    today_work = (promised and promised.date() <= now.date()) or (due_date and due_date <= now.date().isoformat()) or requested.date() == now.date()
    if now.weekday() < 5 and now < before_exit < normalized and today_work:
        normalized = before_exit
        note = 'Vamos conferir 15 minutos antes do fim do seu expediente; o prazo da tarefa permanece igual.'
    return normalized.isoformat(), note


def attention_plan(thread, task, now, hours=None):
    """Use the task's current deadline, not the worker's polling clock."""
    dialogue=(thread.get('management_data') or {}).get('dialogue') or {}
    pending=(thread.get('management_data') or {}).get('unanswered_request_id')
    promised=parse_time(thread.get('expected_at'))
    if not promised and dialogue.get('expected_on'):
        try:promised=dt.datetime.combine(dt.date.fromisoformat(dialogue['expected_on']),work_window(now,hours)[1].timetz())
        except (ValueError,TypeError):pass
    if promised:
        return {'needed':promised<=now,'at':next_work_time(max(promised,now+dt.timedelta(minutes=1)),hours),'reason':'human_return:'+promised.isoformat()}
    explicit=parse_time((thread.get('management_data') or {}).get('explicit_review_at'))
    if explicit and explicit==parse_time(thread.get('next_review_at')):
        return {'needed':explicit<=now,'at':next_work_time(max(explicit,now+dt.timedelta(minutes=1)),hours),'reason':'agreed_review:'+explicit.isoformat()}
    if pending:return {'needed':True,'at':next_work_time(now+dt.timedelta(hours=1),hours),'reason':'client_request:'+pending}
    stage=str(task.get('status') or '').casefold()
    if stage in ('blocked','bloqueado','impedido') or (thread.get('management_data') or {}).get('reported_blocked'):
        return {'needed':True,'at':next_work_time(now+dt.timedelta(days=1),hours),'reason':'blocked:'+stage}
    deadlines=[]
    advanced=task.get('production_delivered_at') or task_progress(task,now)['publication_stage'] or normalized(task.get('status')) in ('em revisao','aguardando aprovacao','aprovar roteiro')
    production=('stage',task.get('stage_due_at')) if advanced else ('production',task.get('due_date'))
    scheduled=[('scheduled',p.get('scheduled_at') or p.get('scheduled_for')) for p in task.get('publications',[]) if p.get('status')=='scheduled']
    for kind,value in [production,('publication',task.get('post_date')),*scheduled]:
        if not value:continue
        try:
            if len(str(value))==10:
                day=dt.date.fromisoformat(value)
                at=dt.datetime.combine(day,work_window(now,hours)[1].timetz())-dt.timedelta(minutes=15)
            else:at=parse_time(value)
            if at:deadlines.append((at,kind))
        except (ValueError,TypeError):continue
    if not deadlines:return {'needed':True,'at':next_work_time(now+dt.timedelta(days=1),hours),'reason':'missing_deadline'}
    at,kind=min(deadlines)
    return {'needed':at<=now,'at':next_work_time(max(at,now+dt.timedelta(minutes=1)),hours),'reason':kind+':'+at.isoformat()}


def due_call(thread, now, hours=None, task=None):
    """No model call here. At most two unanswered reminders per working day."""
    now = now.astimezone(SP)
    start, end = work_window(now, hours)
    if now.weekday() >= 5 or not start <= now < end or thread['state'] not in ('awaiting_reply', 'waiting_review'):
        return None
    review = parse_time(thread.get('next_review_at'))
    if not review or review > now:
        return None
    dialogue = thread.get('management_data', {}).get('dialogue') or {}
    followup=thread.get('management_kind')=='followup' and bool(task)
    attention=attention_plan(thread,task,now,hours) if followup else None
    if attention and not attention['needed']:return None
    semantic = bool(thread.get('management_kind') or dialogue or (task or {}).get('source_version'))
    key = hashlib.sha256(json.dumps({'source': (thread.get('management_data', {}).get('task_observation') or {}).get('meaningful_version') or (task or {}).get('source_version'),
                                    'human': dialogue.get('last_human_at'), 'waiting': dialogue.get('waiting_on'),
                                    'summary': thread.get('summary')}, sort_keys=True).encode()).hexdigest()
    if attention:key=hashlib.sha256(json.dumps({'reason':attention['reason'],'human':dialogue.get('last_human_at'),'day':now.date().isoformat()},sort_keys=True).encode()).hexdigest()
    if semantic and thread.get('management_data', {}).get('dialogue_reminded_key') == key:
        return None
    if dialogue.get('waiting_on') == 'client' and not thread.get('management_data',{}).get('unanswered_request_id'):
        informed = parse_time(dialogue.get('last_human_at'))
        if not informed or informed.date() >= now.date():
            return None
    count = thread.get('reminders_today', 0) if thread.get('reminder_day') == now.date().isoformat() else 0
    if count >= (1 if followup else 2):
        return None
    next_at = next_work_time(now + dt.timedelta(minutes=60), hours)
    if count == 1:
        next_at = next_work_time(dt.datetime.combine(now.date() + dt.timedelta(days=1), dt.time(0), SP), hours)
    text = 'Oi! Como ficou esse trabalho? Me conta o que avançou e, se algo travou, o que falta para seguirmos. Se já estiver pronto, me manda onde posso conferir.'
    if dialogue.get('waiting_on') == 'client':
        text = 'Ficamos aguardando o retorno do cliente. Houve resposta sobre '+str(dialogue.get('next_action') or 'o pedido')[:180]+'?'
    owner_consultation = thread.get('management_kind') == 'consultation' and thread.get('management_data', {}).get('owner_contact_request_id')
    if task and task.get('status') and not owner_consultation:
        progress = task_progress(task, now)
        if progress['review_ready'] and not thread.get('management_data',{}).get('unanswered_request_id'):
            return None
        scheduled = []
        pending = [p for p in task.get('publications', []) if p.get('status') not in ('published','client_posts','cancelled')]
        for p in pending:
            if p.get('status') == 'scheduled' and (p.get('scheduled_at') or p.get('scheduled_for')):
                try:
                    if p.get('scheduled_at'):
                        scheduled.append(parse_time(p['scheduled_at']))
                    elif len(p['scheduled_for']) == 10:
                        scheduled.append(dt.datetime.combine(dt.date.fromisoformat(p['scheduled_for']),dt.time.max,SP))
                    else:
                        scheduled.append(parse_time(p['scheduled_for']))
                except (TypeError, ValueError):
                    pass
        if progress['publication_stage'] and scheduled and len(scheduled)==len(pending) and all(at > now for at in scheduled) and not thread.get('management_data',{}).get('unanswered_request_id') and not thread.get('management_data',{}).get('reported_blocked'):
            return None
        if dialogue.get('waiting_on') != 'client':
            text = progress['prompt']
    if owner_consultation:
        text = 'Ainda preciso confirmar este ponto: ' + str((thread.get('shared_context') or {}).get('text') or 'qual é a situação deste assunto?')[:400]
    if followup and thread.get('management_data',{}).get('unanswered_request_id'):
        text=client_request_question(thread)
    plan = {'next_review_at': next_at.isoformat(), 'reminder_day': now.date().isoformat(), 'reminders_today': count + 1, 'text': text}
    if semantic:
        plan['dialogue_reminded_key'] = key
    if task and task.get('source_version'):
        plan['task_source_version'] = task['source_version']
    return plan


def client_request_question(thread):
    data=thread.get('management_data') or {}
    source=next((f for f in data.get('findings',[]) if f.get('id')==data.get('unanswered_request_id')), {})
    return 'Chegou este pedido do cliente: '+str(source.get('summary') or 'esclarecer o trabalho desta tarefa')[:200]+' O que falta para atendermos por essa tarefa?'


def refresh_plan(row, now):
    """Refresh the existing conversation once per source version, without a model call."""
    thread, task = row['thread'], row.get('task') or {}
    if thread.get('management_kind') != 'followup' or not task.get('source_version') or thread.get('management_data', {}).get('pending_request_id'):
        return None
    previous = thread.get('management_data', {}).get('task_observation') or {}
    progress = task_progress(task, now)
    review_ready=progress['review_ready'] and not thread.get('management_data',{}).get('unanswered_request_id')
    meaningful = {k: v for k, v in task.items() if k not in ('source_version', 'traffic')}
    # Client-level campaigns enrich the context; they do not advance this task.
    meaningful_version = hashlib.sha256(json.dumps(meaningful, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    state = thread['state']
    paused = state == 'waiting_review' and not thread.get('next_review_at')
    attention=attention_plan(thread,task,now,row.get('hours'))
    if state in ('awaiting_reply','waiting_review') and not paused and not review_ready:
        state='awaiting_reply' if attention['needed'] else 'waiting_review'
    observed_stage = previous.get('task_stage')
    was_ready = previous.get('review_ready')
    human = row.get('last_human_observation') or {}
    if human.get('revision',0) > previous.get('revision',0):
        value = human.get('task_stage')
        observed_stage = {k:value.get(k) for k in ('status','assignee_ids','timestamp')} if isinstance(value,dict) else None
        was_ready = False
    if isinstance(observed_stage,dict):
        observed_stage = {**observed_stage,'assignee_ids':sorted(observed_stage.get('assignee_ids') or [])}
    if not paused and review_ready and row.get('account_active'):
        state = 'delivery_review'
    elif not paused and review_ready:
        state = 'needs_owner'
    elif state == 'delivery_review' and not review_ready and previous and (
            was_ready or observed_stage and observed_stage != progress['stage']):
        state = 'awaiting_reply'
    if state == 'delivery_review' and not row.get('account_active'):
        state = 'needs_owner'
    if previous.get('source_version') == task['source_version'] and state == thread['state']:
        return None
    review = parse_time(thread.get('next_review_at'))
    if previous.get('meaningful_version') == meaningful_version and state == thread['state'] and review and review <= now:
        return None
    if state in ('awaiting_reply','waiting_review') and not review_ready and (not row.get('recipient_active',True) or not row.get('recipient_valid',True)):
        return None
    if state in ('awaiting_reply', 'waiting_review') and not paused:
        review = attention['at'] if not attention['needed'] else next_work_time(review if review and review > now else now+dt.timedelta(hours=1), row.get('hours'))
    else:
        review = None
    summary = (progress['summary']+' '+progress['next_step'])[:2000]
    if state in ('delivery_review','needs_owner') and thread['state'] == 'delivery_review' and not review_ready:
        summary = (progress['summary']+' A entrega informada aguarda conferência da conta; a etapa oficial não foi concluída automaticamente.')[:2000]
    if paused:
        summary = (progress['summary']+' O acompanhamento está aguardando um esclarecimento/decisão; a cobrança da execução permanece pausada.')[:2000]
    if state == 'needs_owner' and not row.get('account_active'):
        summary = (summary+' Falta uma conta interna ativa para conferir a entrega.')[:2000]
    # Old conversations get a silent baseline; a real transition remains visible.
    first_contact = row.get('has_messages') is False
    notify = (first_contact and (attention['needed'] or review_ready)) or state != thread['state'] and state in ('awaiting_reply','delivery_review','needs_owner')
    if paused:notify=False
    text = (client_request_question(thread) if thread.get('management_data',{}).get('unanswered_request_id') else progress['notice']) if notify else ''
    if notify and first_contact and not paused and not review_ready and not thread.get('management_data',{}).get('unanswered_request_id') and not task.get('comments') and not task.get('justifications'):
        text += ' '+progress['question']
    return {'kind': 'refresh', 'task_source_version': task['source_version'], 'state': state,
            'meaningful_version': meaningful_version,
            'summary': summary, 'text': text,
            'next_review_at': review.isoformat() if review else None}
