"""Facts from the linked task; no inference of external delivery or campaign linkage."""
import datetime as dt
import unicodedata
from zoneinfo import ZoneInfo


def normalized(value):
    return ''.join(c for c in unicodedata.normalize('NFKD', str(value or '').lower()) if not unicodedata.combining(c)).replace('_', ' ').replace('-', ' ').strip()


def record_time(value):
    try:
        at = dt.datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        return at if at.tzinfo is not None else None
    except (ValueError, TypeError):
        return None


def display_time(value):
    at = record_time(value)
    return at.astimezone(ZoneInfo('America/Sao_Paulo')).strftime('%d/%m, %H:%M') if at else str(value or 'data não informada')[:35]


def publication_in_cycle(publication, task):
    if 'after_last_rework' in publication:
        return publication['after_last_rework'] is True
    rework = [h for h in task.get('status_history', []) if isinstance(h, dict) and normalized(h.get('status')) in ('alteracao','changes','rework')]
    dates = [record_time(h.get('timestamp')) for h in rework]
    if not dates:
        return True
    if any(at is None for at in dates):
        return False
    latest = max(dates)
    if str(publication.get('published_on') or '') < latest.astimezone(ZoneInfo('America/Sao_Paulo')).date().isoformat():
        return False
    created = record_time(publication.get('created_at'))
    if created and created >= latest:
        return True
    return any(h.get('to_status') == 'published' and h.get('from_status') != 'published' and
               (at := record_time(h.get('at'))) is not None and at >= latest
               for h in publication.get('history', []) if isinstance(h, dict))


def task_progress(task, now):
    stage = normalized(task.get('status_value') or task.get('status'))
    stages = {stage, normalized(task.get('status'))}
    rework = bool(stages & {'alteracao', 'changes', 'rework'})
    publications = task.get('publications') or []
    published = {p['channel'] for p in publications if p.get('status') == 'published' and p.get('channel') and publication_in_cycle(p,task)}
    old_publications = {p['channel'] for p in publications if p.get('status') == 'published' and p.get('channel') and not publication_in_cycle(p,task)}-published
    raw_planned = task.get('planned_channels') or []
    planned = {p for p in raw_planned if isinstance(p, str) and p} if isinstance(raw_planned, list) else set()
    complete = (task.get('coverage') or {}).get('publications_total', len(publications)) == len(publications) and len(planned) == len(raw_planned)
    publication_stage = bool(stages & {'agendar', 'agendado', 'publicado', 'publicacao', 'youtube'})
    pending_occurrence = any(p.get('status') not in ('published','cancelled') for p in publications)
    publication_complete = task.get('publication_ready') is True if 'publication_ready' in task else bool(planned and planned <= published and complete and not pending_occurrence and not rework and publication_stage)
    review_ready = bool(task.get('terminal') or publication_complete)
    facts = ['A tarefa está em '+str(task.get('status') or 'etapa não informada')+'.']
    names = [str(p['name'])[:100] for p in task.get('assignees', []) if p.get('name')]
    if names:
        facts.append('Responsável na tarefa: '+', '.join(names)+'.')
    if published:
        facts.append('Publicação registrada em '+', '.join(sorted(published))+'. A rede social não foi consultada novamente.')
    if old_publications:
        facts.append('Publicação anterior à alteração em '+', '.join(sorted(old_publications))+'. Falta registro de publicação do ciclo atual.')
    comments = task.get('comments') or []
    if comments:
        c = comments[-1]
        facts.append('Último comentário na tarefa, de '+str(c.get('author') or 'autor não informado')[:100]+
                     ' ('+display_time(c.get('at'))+'): “'+str(c.get('body') or '')[:400]+'”.')
    justifications = task.get('justifications') or []
    if justifications:
        j = justifications[-1]
        facts.append('Última justificativa registrada, de '+str(j.get('author') or 'autor não informado')[:100]+
                     ': “'+str(j.get('details') or j.get('reason_code') or '')[:300]+'”.')
    traffic = task.get('traffic') or {}
    if traffic:
        stamp = traffic.get('syncedAt')
        fresh = False
        try:
            at = dt.datetime.fromisoformat(str(stamp).replace('Z', '+00:00'))
            period = traffic.get('period')
            fresh = at.tzinfo is not None and dt.timedelta(0) <= now-at <= dt.timedelta(minutes=10) and isinstance(period, dict) and period.get('since') == now.date().replace(day=1).isoformat()
        except (TypeError, ValueError):
            pass
        issue = any(traffic.get(k) for k in ('permError', 'rateLimited', 'errorMessage', 'has_error'))
        if fresh and not issue:
            running = [str(c['name'])[:100] for c in traffic.get('running', []) if c.get('name')]
            facts.append('Snapshot da Meta de '+str(stamp)+': '+str(traffic.get('activeCount', 'quantidade desconhecida'))+
                         ' campanha(s) ativa(s) registrada(s)'+(' — '+', '.join(running[:3]) if running else '')+
                         '. Esse total do cliente não comprova a execução desta tarefa.')
        else:
            facts.append('Snapshot da Meta de '+str(stamp or 'data desconhecida')+' antigo, indisponível ou com erro; não confirma campanhas ativas agora.')
    if review_ready:
        step = ('A tarefa consta concluída. ' if task.get('terminal') else 'Os canais previstos têm publicação registrada; a etapa oficial da tarefa ainda precisa ser atualizada. ')
        step += 'Falta a conta conferir a entrega; não há verificação externa ou de qualidade automática.'
        question = ''
    elif rework:
        step = 'O próximo passo é a versão corrigida conforme a revisão registrada; uma publicação anterior não encerra esta alteração.'
        question = 'Há alguma mudança no andamento ou impedimento da correção que ainda não está na tarefa?'
    elif stages & {'em revisao', 'aguardando aprovacao', 'aprovar roteiro'}:
        step = 'O próximo passo é a revisão/aprovação; a produção anterior já avançou.'
        question = 'Há um retorno dessa revisão que ainda não foi registrado?'
    elif published and planned-published:
        step = 'Falta registro de publicação em '+', '.join(sorted(planned-published))+'.'
        question = 'Esses canais pendentes já têm publicação ou algum impedimento ainda não registrado?'
    elif 'agendado' in stages:
        step = 'O conteúdo consta agendado; o próximo passo é o registro da publicação.'
        question = 'Após o horário agendado, falta algum registro de publicação ou de falha?'
    else:
        step = 'Vou acompanhar a etapa atual e os registros de execução.'
        question = 'Há algum avanço ou impedimento novo que ainda não está registrado?'
    history = task.get('status_history') or []
    observed_stage = {'status':task.get('status_value') or task.get('status'), 'assignee_ids':sorted(task.get('assignee_ids') or []),
                      'timestamp':history[-1].get('timestamp') if history else None}
    notice = facts[0]+' '+('A entrega aguarda conferência da conta.' if review_ready else
                          'Os ajustes registrados orientam a versão corrigida.' if rework else
                          'A produção já avançou e aguarda revisão.' if stages & {'em revisao', 'aguardando aprovacao', 'aprovar roteiro'} else
                          'O próximo passo está no acompanhamento.')
    prompt = facts[0]+' '+('Há uma versão corrigida para conferir ou algum impedimento novo?' if rework else
                          'Falta alguma decisão para concluir essa revisão?' if stages & {'em revisao', 'aguardando aprovacao', 'aprovar roteiro'} else
                          'O horário agendado passou; houve publicação ou falha?' if 'agendado' in stages else
                          'Houve mudança no impedimento registrado?' if justifications else
                          'O que falta para concluir essa etapa?')
    return {'summary': ' '.join(facts)[:1800], 'next_step': step, 'question': question, 'notice': notice,
            'prompt': prompt, 'review_ready': review_ready, 'stage':observed_stage, 'publication_stage':publication_stage and not rework}
