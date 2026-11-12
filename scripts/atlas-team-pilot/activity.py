"""Closed operational telemetry; never copy prompts, responses or tool payloads."""
AGENTS = frozenset(('central','clientes','operacao','estrategia','trafego','resultados'))


def record(bridge, request, lease, code, status='running', *, section=None, agent=None, reference=None):
    if not lease:
        return False
    args={'p_request':request,'p_lease':lease,'p_code':code,'p_status':status}
    for key,value in (('p_section',section),('p_agent',agent),('p_reference',reference)):
        if value is not None:
            args[key]=value
    try:
        return bridge.rpc('atlas_team_record_activity',args) is True
    except Exception:
        # Observability must not consume a retry or stop the saved conversation.
        return False


def specialist_step(bridge, request, lease, step):
    if step.get('kind') not in ('coordination','delegation','answer') or step.get('agent') not in AGENTS:
        return False
    status={'running':'running','completed':'completed','failed':'failed','partial':'partial'}.get(step.get('status'))
    return record(bridge,request,lease,'agent',status,agent=step['agent']) if status else False
