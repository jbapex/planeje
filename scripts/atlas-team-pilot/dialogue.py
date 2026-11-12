"""Conversation continuity; task records remain the authority for execution."""
import copy
import datetime as dt
import re
import unicodedata
from urllib.parse import urlparse


def fold(value):
    return ''.join(c for c in unicodedata.normalize('NFKD', str(value).casefold())
                   if not unicodedata.combining(c))


def evidence(result, context):
    ref = result.get('evidence_ref')
    if ref is None:
        return None
    if not isinstance(ref, dict) or set(ref) != {'kind', 'id'}:
        raise ValueError('Referência de entrega inválida.')
    sources = {'task_attachment': 'attachments', 'task_publication': 'publications'}
    if ref['kind'] not in sources or not isinstance(ref['id'], str):
        raise ValueError('Tipo de referência inválido.')
    task = context.get('task') or {}
    row = next((a for a in task.get(sources[ref['kind']], []) if a.get('id') == ref['id']), None)
    if not row:
        raise ValueError('Referência fora desta tarefa.')
    if ref['kind'] == 'task_publication' and (row.get('status') != 'published' or row.get('after_last_rework') is not True):
        raise ValueError('A publicação não comprova a entrega desta rodada.')
    if ref['kind'] == 'task_attachment' and row.get('after_last_rework') is not True:
        raise ValueError('O anexo pertence a uma rodada anterior.')
    url = row.get('url') if ref['kind'] == 'task_attachment' else row.get('evidence_url')
    parsed = urlparse(url or '')
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password or len(url) > 2000:
        raise ValueError('A referência não tem um link utilizável.')
    if result.get('evidence_url') not in (None, url):
        raise ValueError('Link diferente do registro autorizado.')
    result['evidence_url'] = url
    return url


def context_question(message):
    text=fold(message).strip()
    return bool(re.match(r'^(?:me contextualiz[ae]|contextualiz[ae]|me (?:explic[ae]|resum[ae])|qual (?:e |é )?o contexto|o que (?:aconteceu|esta acontecendo)|por que voce (?:esta |me )?(?:perguntando|chamou))\b',text))


def continuity(result, context, message, now):
    from time_rules import SP, next_work_time, work_window, parse_time
    previous = copy.deepcopy(context['thread']['management_data'].get('dialogue') or {})
    if context_question(message):
        result.update(information_only=True,executor_id=None,decision='ask',expected_at=None,review_at=None,
                      summary=context['thread'].get('summary') or result['summary'],dialogue=previous or None)
        return result
    incoming = result.get('dialogue') or {}
    if not isinstance(incoming, dict) or set(incoming) - {'waiting_on', 'next_action', 'missing_field', 'expected_on'}:
        raise ValueError('Combinado de conversa inválido.')
    waiting = incoming.get('waiting_on') or previous.get('waiting_on') or 'self'
    missing = incoming.get('missing_field')
    if waiting not in ('self', 'client', 'team', 'owner', 'none') or missing not in (None, 'executor', 'action', 'scope', 'date', 'evidence', 'record', 'progress'):
        raise ValueError('Próximo passo inválido.')
    action = incoming.get('next_action') or previous.get('next_action') or result['summary'][:400]
    if not isinstance(action, str) or not action.strip() or len(action) > 400:
        raise ValueError('Próxima ação incompleta.')
    expected_on = incoming.get('expected_on') or previous.get('expected_on')
    if expected_on:
        day = dt.date.fromisoformat(expected_on)
        # A date is a person's report, never a fabricated clock commitment.
        if incoming.get('expected_on') and not now.date() - dt.timedelta(days=90) <= day <= now.date() + dt.timedelta(days=90):
            raise ValueError('Dia informado fora do período permitido.')
    text = fold(message).strip()
    result['information_only']=False
    if re.search(r'\b(?:nao[, ]+)?(?:ja )?(?:esta|ta|ficou) agendad[oa]\b',text) and not re.search(r'\bnao (?:esta|ta|ficou) agendad',text):
        waiting,missing='self',None
        action='Conferir a publicação no horário agendado'
        result['decision']='progress'
        result['reply']='Entendi, você informou que já está agendado. Vou acompanhar o registro da publicação no horário previsto.'
    waits=list(re.finditer(r'\b(?:aguard|esper|depend)\w*\b.{0,65}\bcliente\b', text))
    for wait in waits:
        clause=re.split(r'[.;\n]',text[:wait.start()])[-1]
        if not re.search(r'\b(?:nao|nunca|nem)\b',clause):
            waiting, missing = 'client', None
    cancelled_date=bool(re.search(r'\bsem (?:previsao|prazo|data)\b|\b(?:previsao|prazo|data)\b.{0,45}\b(?:nao vale|mudou|cancelad|desconsider)',text))
    if cancelled_date and result.get('expected_at') and not incoming.get('expected_on'):
        expected_on=parse_time(result['expected_at']).date().isoformat()
    if cancelled_date and not incoming.get('expected_on') and not result.get('expected_at'):
        expected_on=None
        result['review_at']=next_work_time(now+dt.timedelta(days=1),context['hours']).isoformat()

    acknowledged = bool(re.fullmatch(r'(?:isso mesmo|sim|ok|beleza|certo|entendi|show)[.!\s]*', text))
    if acknowledged and previous:
        waiting = previous.get('waiting_on', waiting)
        missing = previous.get('missing_field')
        action = previous.get('next_action', action)
        if result['decision'] == 'ask':
            result['decision'] = 'progress'
        result['reply'] = 'Combinado. Sigo acompanhando esse próximo passo.'
    answered = copy.deepcopy(previous.get('answered') or {})
    if cancelled_date:answered.pop('date',None)
    elif expected_on and dt.date.fromisoformat(expected_on)<now.date():answered.pop('date',None)
    task = context.get('task') or {}
    stage = {'status': task.get('status_value') or task.get('status'),
             'assignee_ids': sorted(task.get('assignee_ids') or [])}
    old_stage = previous.get('observed_stage')
    if old_stage and old_stage != stage:
        answered.pop('executor', None)
        if fold(stage['status']) in ('changes', 'rework', 'alteracao'):
            answered.pop('evidence', None)
    source = {'message_id': (context.get('last_request') or {}).get('message_id'),
              'task_version': (context.get('task') or {}).get('source_version'), 'at': now.isoformat()}
    if not acknowledged:
        answered['action'] = {'value': action, **source}
    if waiting == 'client':
        answered['approval'] = {'value': action, **source}
    if re.match(r'^\s*(?:sou eu(?: mesmo)?|eu mesmo|esta pendente comigo)\b', text):
        answered['executor'] = {'value': context['actor_id'], **source}
        if missing == 'executor':
            missing = None
            result['reply'] = 'Fechado. Sigo com você nessa etapa.'
            if result['decision']=='ask':result['decision']='progress'
    if missing in answered and missing in ('executor','date','evidence'):
        missing = None
        if result['decision']=='ask':
            result['decision']='progress'
            result['reply']='Esse ponto já está registrado. Sigo acompanhando o próximo passo combinado.'
    if result.get('evidence_ref'):
        answered['evidence'] = {'value': result['evidence_ref'], **source}
    if expected_on and dt.date.fromisoformat(expected_on)>=now.date():
        answered['date'] = {'value': expected_on, **source}
    dialogue = {'waiting_on': waiting, 'next_action': action, 'missing_field': missing,
                'expected_on': expected_on, 'answered': answered,
                'last_human_at': now.isoformat(), 'last_question': previous.get('last_question'),
                'observed_stage': stage}
    if '?' in result['reply']:
        question = {'kind': missing or 'progress', 'text': fold(result['reply']),
                    'task_version': source['task_version'], 'at': now.isoformat()}
        old = previous.get('last_question') or {}
        if old.get('text') == question['text'] and old.get('task_version') == question['task_version']:
            result['reply'] = 'Recebi seu retorno. O próximo passo continua registrado no acompanhamento.'
            result['decision'] = 'progress' if result['decision'] == 'ask' else result['decision']
        else:
            dialogue['last_question'] = question
    if waiting == 'client':
        result['review_at'] = next_work_time(dt.datetime.combine(now.date() + dt.timedelta(days=1), dt.time(), SP), context['hours']).isoformat()
        result['reply'] = 'Entendi, falta o retorno do cliente. Vou acompanhar essa resposta.'
    if expected_on and dt.date.fromisoformat(expected_on) >= now.date() and not result.get('expected_at'):
        day = dt.date.fromisoformat(expected_on)
        at = dt.datetime.combine(day, dt.time(12), SP)
        _, end = work_window(at, context['hours'])
        review = end - dt.timedelta(minutes=15)
        result['review_at'] = next_work_time(max(review, now + dt.timedelta(minutes=1)), context['hours']).isoformat()
    record_question = re.search(r'\b(?:existe|ainda|cade|registrad\w*|tarefas?)\b', text)
    if context.get('task_lookup') in ('missing', 'unlinked') and (context['thread']['management_kind'] == 'followup' or record_question):
        result['reply'] = 'Não localizei a tarefa vinculada. O acompanhamento ainda guarda o título anterior.'
        result['summary'] = result['reply']
        result['decision'] = 'resolved' if context['thread']['management_kind'] == 'owner_context' else 'owner_needed'
        dialogue.update(waiting_on='owner', missing_field='record', next_action='Conferir o vínculo da tarefa')
    if re.search(r'(?:\b(?:vou|irei|ja|acabei de)\s+(?:(?:proceder|seguir) com a\s+)?(?:exclu\w*|apag\w*)|^\s*(?:eu )?(?:exclui|apaguei)\b)', fold(result['reply'])):
        result['reply'] = 'Entendi. O encerramento deste acompanhamento não exclui a tarefa.'
    result['dialogue'] = dialogue
    return result
