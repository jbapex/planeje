import { ACTOR, literal } from './db.mjs';

const tables = new Set(['profiles', 'module_settings', 'user_module_permissions', 'user_module_access', 'clientes',
  'traffic_client_ops', 'cliente_meta_accounts', 'cliente_google_ads_accounts', 'paid_campaigns', 'tarefas',
  'traffic_weekly_reviews', 'traffic_weekly_history', 'cliente_whatsapp_contact']);
const procedures = {
  gestor_ia_routine_mcp: { p_actor: 'uuid', p_action: 'text', p_client: 'uuid', p_week: 'date', p_payload: 'jsonb' },
  save_traffic_weekly_review: { p_review: 'uuid', p_revision: 'integer', p_data: 'jsonb', p_finalize: 'boolean' },
  start_traffic_week_record: { p_client: 'uuid', p_week: 'date', p_kind: 'text' },
  central_trafego_can_access_client: { p_cliente_id: 'uuid' },
  gestor_ia_routine_leads_data: { p_client: 'uuid', p_week: 'date', p_actor: 'uuid', p_mode: 'text' },
  traffic_weekly_board: {},
  traffic_routine_client_history: { p_client: 'uuid', p_kind: 'text', p_before: 'date', p_limit: 'integer' },
};
const identifier = (name) => {
  if (!/^[a-z_][a-z_0-9]*$/i.test(name)) throw new Error('Invalid preview identifier');
  return `"${name}"`;
};
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', ...headers } });

function selectTable(db, table, url, role, wantsObject) {
  const conditions = [];
  for (const [key, filter] of url.searchParams) {
    if (['select', 'order', 'limit', 'offset'].includes(key)) continue;
    const column = `t.${identifier(key)}`;
    const dot = filter.indexOf('.');
    const op = filter.slice(0, dot); const value = filter.slice(dot + 1);
    if (op === 'in' && value.startsWith('(') && value.endsWith(')')) {
      const members = value.slice(1, -1).split(',').filter(Boolean).map((item) => literal(item.replaceAll('"', '')));
      conditions.push(members.length ? `${column} IN (${members.join(',')})` : 'false');
    } else if (op === 'is' && value === 'null') conditions.push(`${column} IS NULL`);
    else {
      const operator = { eq: '=', gt: '>', gte: '>=', lt: '<', lte: '<=' }[op];
      if (!operator) throw new Error('Unsupported preview filter');
      conditions.push(`${column} ${operator} ${literal(value)}`);
    }
  }
  const fields = (url.searchParams.get('select') || '*').split(',');
  const projection = fields.length === 1 && fields[0] === '*' ? 'to_jsonb(t)' : `jsonb_build_object(${fields.map((field) => {
    if (field === 'actor:profiles!actor_id(full_name)') return `'actor',(SELECT jsonb_build_object('full_name',p.full_name) FROM public.profiles p WHERE p.id=t.actor_id)`;
    return `${literal(field)},t.${identifier(field)}`;
  }).join(',')})`;
  const order = (url.searchParams.get('order') || '').split(',').filter(Boolean).map((part) => {
    const [key, direction = 'asc'] = part.split('.');
    return `t.${identifier(key)} ${direction === 'desc' ? 'DESC' : 'ASC'}`;
  });
  const limit = Math.min(1000, Math.max(0, Number(url.searchParams.get('limit') || 1000)));
  const offset = Math.max(0, Number(url.searchParams.get('offset') || 0));
  if (!Number.isSafeInteger(limit) || !Number.isSafeInteger(offset)) throw new Error('Invalid preview range');
  const rows = db.json(`SELECT coalesce(jsonb_agg(row),'[]') FROM (SELECT ${projection} AS row FROM public.${identifier(table)} t
    ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''} ${order.length ? `ORDER BY ${order.join(',')}` : ''} LIMIT ${limit} OFFSET ${offset}) selected`, role);
  return wantsObject ? rows[0] || null : rows;
}

/** Allowlisted PostgREST transport; all writes execute real SQL inside the owned cluster. */
export function createPreviewFetch(db, role = 'authenticated') {
  return async (input, init = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (url.hostname !== '127.0.0.1') throw new Error('External network blocked in Neuro preview');
    const headers = new Headers(init.headers);
    const method = (init.method || 'GET').toUpperCase();
    const wantsObject = headers.get('accept')?.includes('vnd.pgrst.object');
    try {
      if (url.pathname === `/auth/v1/admin/users/${ACTOR}` && role === 'service_role') {
        return json(db.json(`SELECT to_jsonb(u) FROM auth.users u WHERE u.id=${literal(ACTOR)}::uuid`, role));
      }
      if (url.pathname.startsWith('/rest/v1/rpc/') && method === 'POST') {
        const name = url.pathname.split('/').at(-1);
        const allowed = procedures[name];
        if (!allowed) return json({ code: '42501', message: 'RPC indisponível na prévia isolada.' }, 403);
        const body = JSON.parse(String(init.body || '{}'));
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid preview RPC body');
        const args = Object.entries(body).map(([key, value]) => {
          const type = allowed[key];
          if (!type) throw new Error('Unsupported preview RPC argument');
          return `${identifier(key)} => ${literal(type === 'jsonb' ? JSON.stringify(value) : value)}::${type}`;
        });
        return json(db.json(`public.${identifier(name)}(${args.join(',')})`, role));
      }
      const table = url.pathname.replace('/rest/v1/', '');
      if (tables.has(table) && method === 'GET') return json(selectTable(db, table, url, role, wantsObject));
      return json({ code: '42501', message: 'Operação indisponível na prévia isolada.' }, 403);
    } catch (error) {
      return json({ code: error.code || '22023', message: error.message }, error.code === '42501' ? 403 : 409);
    }
  };
}

export function previewMiddleware(db) {
  const fetch = createPreviewFetch(db);
  return async (req, res, next) => {
    if (!req.url?.startsWith('/rest/v1/') && !req.url?.startsWith('/auth/v1/')) return next();
    const origin = req.headers.origin;
    const host = req.headers.host;
    if (!/^127\.0\.0\.1:(4393|4394|4395|4396)$/.test(host || '') || origin && origin !== `http://${host}`) {
      res.writeHead(403); res.end('Local preview only'); return;
    }
    if (req.headers.authorization !== 'Bearer fixture-human-only') {
      res.writeHead(401); res.end('Synthetic session required'); return;
    }
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 200000) { res.writeHead(413); res.end(); return; }
    }
    const response = await fetch(`http://${host}${req.url}`, { method: req.method, headers: req.headers, body });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(await response.text());
  };
}

export function previewBridge(db) {
  return {
    name: 'neuro-disposable-database',
    configureServer(server) {
      server.middlewares.use(previewMiddleware(db));
    },
  };
}
