"""Preserve source snapshots; send a task index and relevant details to the model."""
import copy
import unicodedata

def fold(value):
    return ''.join(c for c in unicodedata.normalize('NFKD',str(value or '')).casefold() if not unicodedata.combining(c))

def model_context(snapshot):
    value=copy.deepcopy(snapshot)
    value['coverage'].pop('group_source',None)
    texts=fold('\n'.join(m.get('body') or '' for m in value['messages']))
    referenced={r.get('task_id') for r in [*value.get('requests',[]),*value.get('waiting_threads',[])] if r.get('task_id')}
    detailed=set()
    for task in value['tasks']:
        title=fold(task.get('title')).split(']',1)[-1].strip()
        if not task.get('terminal') or task['id'] in texts or task['id'] in referenced or len(title)>=12 and title in texts:
            detailed.add(task['id'])
        else:
            task.pop('description',None)
            task['detail_coverage']='Índice: descrição e comentários históricos não incluídos nesta chamada.'
    all_comments=len(value.get('comments',[]))
    value['comments']=[c for c in value.get('comments',[]) if c['task_id'] in detailed]
    value['coverage']={**value['coverage'],'task_index_count':len(value['tasks']),'task_details_included':sorted(detailed),
                       'task_details_omitted':len(value['tasks'])-len(detailed),'comments_total':all_comments,'comments_included':len(value['comments'])}
    value['context_note']='Mensagens preservadas. Tarefas abertas ou citadas têm detalhes; as demais concluídas aparecem como índice. Não afirme ter lido descrições ou comentários omitidos. Um vínculo incerto exige esclarecimento.'
    if not value.get('new_ids') and not value.get('requests') and value['messages']:
        value['focus_ids']=[value['messages'][-1]['id']]
        value['context_note']+=' Primeira análise manual: avalie o acontecimento em focus_ids com o histórico completo como apoio. As mensagens anteriores não são uma lista de pedidos novos. Não proponha ações sem relação com o foco atual.'
    return value
