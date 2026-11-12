"""Production entrypoint. Short-lived Atlas delegation; no synthetic login or test clock."""
import base64
import datetime as dt
import hashlib
import hmac
import json
import os
from pathlib import Path
import socket
import threading
import time
from socketserver import ThreadingUnixStreamServer
from server import Engine, Handler, demand, SYSTEM, result_schema, group_source
from cs_reading import run_cs_reading
from model_context import model_context


def delegation(owner, secret, now):
    enc = lambda value: base64.urlsafe_b64encode(json.dumps(value, separators=(',', ':')).encode()).rstrip(b'=')
    body = enc({'alg': 'HS256', 'typ': 'JWT'}) + b'.' + enc({
        'sub': owner, 'role': 'authenticated', 'aud': 'authenticated', 'iss': 'supabase',
        'planeje_server_delegate': 'atlas', 'iat': now, 'exp': now + 240})
    return (body + b'.' + base64.urlsafe_b64encode(hmac.new(secret.encode(), body, hashlib.sha256).digest()).rstrip(b'=')).decode()


class ProductionEngine(Engine):
    def __init__(self):
        if socket.gethostname() != 'srv1102699' or os.environ.get('ATLAS_EVENTS_ENV') != 'production' or os.environ.get('ATLAS_DEMAND_ENV') != 'production':
            raise RuntimeError('Configuração produtiva do Atlas indisponível.')
        demand.Bridge.__init__(self)
        self.lock = threading.Lock()
        self._delegate = None
        self._delegate_at = 0
        self._owner = None
        self._issued = {}
        self.scan_client = None
        self.allow_direct_binding = False
        self.manager_enabled = True
        self._maintenance_at = 0
        self._sync_at = 0
        self.socket = Path('/run/planeje-atlas-events/events.sock')

    def owner_token(self):
        atlas = self.data('atlas_settings', {'select': 'owner_id,enabled', 'id': 'eq.atlas'})
        if not atlas or not atlas[0]['enabled']:
            raise PermissionError('Atlas desabilitado.')
        owner = atlas[0]['owner_id']
        if not self._delegate or self._owner != owner or time.time() - self._delegate_at > 90:
            self._owner = owner
            self._delegate_at = time.time()
            self._delegate = delegation(owner, os.environ['JWT_SECRET'], int(self._delegate_at))
            self._issued[self._delegate] = owner
        return self._delegate

    def data(self, table, query=None, body=None, method=None, token=None, upsert=False):
        if token in self._issued:
            prior_owner = self._issued[token]
            token = self.owner_token()
            if self._owner != prior_owner:
                raise PermissionError('Proprietário alterado durante a leitura.')
        return super().data(table, query, body, method, token, upsert)

    def identity(self, token):
        if token and token in self._issued:
            original_owner = self._issued[token]
            owner = self.rpc('atlas_event_worker_access', {}, self.owner_token())
            if owner != original_owner:
                raise PermissionError('Delegação revogada.')
            return owner
        return demand.Bridge.identity(self, token)

    def resolve_groups(self, groups, clients, owner):
        by_client = {client['id']: client for client in clients if client.get('etapa') == 'closed'}
        by_group = {group['id']: group_source(group) for group in groups}
        group_ids = list(by_group)
        resolved = {}
        for start in range(0, len(group_ids), 200):
            batch = group_ids[start:start + 200]
            links = self.rpc('atlas_event_resolve_groups', {'p_owner': owner, 'p_conversations': batch})
            if not isinstance(links, list):
                raise ValueError('Não foi possível confirmar os vínculos de grupo do Atlas.')
            for link in links:
                group_id = link['conversation_id']
                client = by_client.get(link['client_id'])
                scope = {key: link[key] for key in ('wa_client_id', 'channel_id', 'group_jid')}
                if client and group_id in batch and by_group[group_id] == scope:
                    resolved[group_id] = (client, None)
        return resolved

    def rpc(self, name, data, token=None):
        if name in ('atlas_event_sync_office','atlas_event_maintenance'):
            return self.data('rpc/'+name,body=data,method='POST',token=token)
        if name == 'atlas_event_claim':
            from token_budget import reserve_tokens
            now = dt.datetime.now(dt.timezone.utc)
            jobs = self.rows('atlas_event_jobs','id,input,state,ready_at,lease_until,attempt,created_at',{'owner_id':'eq.'+data['p_owner'],'state':'in.(queued,error,budget_wait,processing)',**({'client_id':'eq.'+self.scan_client} if self.scan_client else {})},order='ready_at,created_at')
            eligible = [j for j in jobs if j['attempt']<3 and dt.datetime.fromisoformat(j['ready_at'])<=now and (j['state']!='processing' or j['lease_until'] and dt.datetime.fromisoformat(j['lease_until'])<now)]
            # Explicit client analysis uses the newest assembled context. Background work
            # keeps oldest-first fairness; no previous input is discarded.
            if self.scan_client:
                eligible.sort(key=lambda item: dt.datetime.fromisoformat(item['created_at']), reverse=True)
            job = None
            if eligible:
                source_token = self.owner_token()
                if self._owner != data['p_owner']:
                    raise PermissionError('Proprietário alterado durante a leitura.')
                for candidate in eligible:
                    # Reclaim an expired lease through SQL so its unknown usage stays accounted.
                    # Unclaimed stale inputs never reserve tokens or consume another attempt.
                    if candidate['state'] == 'processing' or self.sources_current(candidate['input'], source_token, data['p_owner']):
                        job = candidate
                        break
                    self.patch('atlas_event_jobs', {
                        'id': 'eq.' + candidate['id'], 'owner_id': 'eq.' + data['p_owner'],
                        'state': 'eq.' + candidate['state'], 'attempt': 'eq.' + str(candidate['attempt'])
                    }, {'state': 'blocked', 'error': 'O contexto deste lote mudou; aguarde a conferência atual do cliente.'})
            data = {**data, 'p_client': self.scan_client,'p_job':job['id'] if job else '00000000-0000-0000-0000-000000000000',
                    'p_estimate': reserve_tokens(SYSTEM,model_context(job['input']),result_schema(job['input'])) if job else 1}
        if name == 'atlas_event_publish':
            saved = super().rpc(name, data, token)
            super().rpc('atlas_event_project_demands', {'p_job': data['p_job']})
            return saved
        return super().rpc(name, data, token)

    def request(self,url,data=None,token=None,content_type='application/json',timeout=55):
        if url=='https://api.openai.com/v1/chat/completions':
            data={**data,'messages':[dict(message) for message in data['messages']]}
            snapshot=json.loads(data['messages'][1]['content'])
            data['messages'][1]['content']=json.dumps(model_context(snapshot),ensure_ascii=False)
        return super().request(url,data,token,content_type,timeout)

    def scan(self, token, manual=False, now=None, client_id=None):
        if now is not None:
            raise ValueError('O relógio de produção é o horário atual.')
        result = super().scan(token, manual=manual, client_id=client_id)
        if not result.get('busy') and self._owner:
            if time.time() - self._sync_at > 60 or result.get('queued') or result.get('model_calls'):
                self.rpc('atlas_event_sync_office', {'p_owner': self._owner})
                self._sync_at = time.time()
            if time.time() - self._maintenance_at > 3600:
                self.rpc('atlas_event_maintenance', {'p_owner': self._owner})
                self._maintenance_at = time.time()
        return result


def main():
    engine = ProductionEngine()
    path = engine.socket
    path.parent.mkdir(exist_ok=True, parents=True)
    path.unlink(missing_ok=True)
    server = ThreadingUnixStreamServer(str(path), Handler)
    server.bridge = engine
    os.chown(path, -1, engine.socket_gid)
    os.chmod(path, 0o660)
    def cycle():
        while True:
            try:
                result = engine.scan(engine.owner_token())
                if result.get('queued') or result.get('model_calls'):
                    print(json.dumps({'event': 'atlas_events_scan', **result}), flush=True)
            except Exception:
                print(json.dumps({'event': 'atlas_events_scan_failed'}), flush=True)
            time.sleep(15)

    def cs_cycle():
        try:
            reading_engine = ProductionEngine()
        except Exception:
            print(json.dumps({'event': 'cs_ia_reading_failed'}), flush=True)
            return

        def complete(payload):
            return demand.Bridge.request(reading_engine, 'https://api.openai.com/v1/chat/completions', payload, timeout=35)

        while True:
            try:
                if run_cs_reading(reading_engine, complete) == 'failed':
                    print(json.dumps({'event': 'cs_ia_reading_failed'}), flush=True)
            except Exception:
                print(json.dumps({'event': 'cs_ia_reading_failed'}), flush=True)
            time.sleep(60)

    threading.Thread(target=cycle, daemon=True).start()
    threading.Thread(target=cs_cycle, daemon=True).start()
    server.serve_forever()


if __name__ == '__main__':
    main()
