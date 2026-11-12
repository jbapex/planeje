#!/usr/bin/env bash
# Aceite da Central de Tráfego — Fase 1, somente backup descartável em Docker.
# NÃO conecta em supabase.com/supabase.co. NÃO usa senha de produção.
# NÃO publica porta. NÃO aceita DSN externa.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROD_REF='slrpesefjkzoaufvogdj'
CONFIRM_NEED='planeje-fase1-disposable'
EXECUTE_NEED='I_UNDERSTAND_DISPOSABLE_ONLY'
DUMP_NEED='/root/backups/planeje/supabase-postgres-20260826-013500.dump'
SHA_NEED='ccadf2e3ce77a1165896d6f832c174b36b60bfb9c9d7bd79123f0b6414ebc078'
SERVER_IMAGE='supabase/postgres:17.6.1.166'
CLIENT_IMAGE='postgres:17-alpine'
DBNAME='planeje_fase1'

step() { echo "STEP $1"; }
ok() { echo "OK $1"; }
fail() { echo "FAIL $1"; exit 1; }

refuse_prod_env() {
  local k v
  for k in DATABASE_URL CENTRAL_FASE1_DSN SUPABASE_DB_URL SUPABASE_DB_PASSWORD POSTGRES_PASSWORD PGPASSWORD; do
    v="${!k-}"
    if [[ -n "$v" ]]; then
      case "$v" in
        *supabase.com*|*supabase.co*|*${PROD_REF}*) fail "env $k recusada (produção/supabase)" ;;
      esac
    fi
  done
  if [[ -n "${CENTRAL_FASE1_DSN:-}" ]]; then
    fail "CENTRAL_FASE1_DSN recusada; o runner cria o DSN interno"
  fi
}

cleanup() {
  local status=$?
  echo "STEP cleanup"
  if [[ -z "${RUN_ID:-}" ]]; then
    echo "OK cleanup skipped (no run id) status=$status"
    return 0
  fi
  local cid nid vid
  for cid in $(docker ps -aq --filter "label=planeje.fase1.run=${RUN_ID}" 2>/dev/null); do
    docker rm -f "$cid" >/dev/null 2>&1 || true
  done
  for nid in $(docker network ls -q --filter "label=planeje.fase1.run=${RUN_ID}" 2>/dev/null); do
    docker network rm "$nid" >/dev/null 2>&1 || true
  done
  for vid in $(docker volume ls -q --filter "label=planeje.fase1.run=${RUN_ID}" 2>/dev/null); do
    docker volume rm "$vid" >/dev/null 2>&1 || true
  done
  echo "OK cleanup run_id_present=1 status=$status"
}

if [[ "${CENTRAL_FASE1_EXECUTE:-}" != "$EXECUTE_NEED" || "${CENTRAL_FASE1_CONFIRM:-}" != "$CONFIRM_NEED" ]]; then
  echo "USAGE runner recusado (faltam CENTRAL_FASE1_EXECUTE e CENTRAL_FASE1_CONFIRM)."
  exit 2
fi

refuse_prod_env
trap cleanup EXIT INT TERM

step "0 verify dump"
[[ -f "$DUMP_NEED" ]] || fail "dump missing"
DUMP_SHA="$(sha256sum "$DUMP_NEED" | awk '{print $1}')"
[[ "$DUMP_SHA" == "$SHA_NEED" ]] || fail "dump sha256 mismatch"
ok "dump_sha256=$DUMP_SHA"

step "0b dump header"
TOC_TMP="$(mktemp)"
docker run --rm --network none \
  -v "$DUMP_NEED":/dump.dump:ro \
  "$CLIENT_IMAGE" \
  pg_restore -l /dump.dump >"$TOC_TMP"
HEADER="$(awk '/Dumped from database version:/{print; exit}' "$TOC_TMP")"
rm -f "$TOC_TMP"
echo "OK header ${HEADER#; }"
case "$HEADER" in
  *'Dumped from database version: 17.6'*) ;;
  *) fail "dump postgres version incompatível com imagens locais; não usar produção" ;;
esac

if ! docker image inspect "$SERVER_IMAGE" >/dev/null 2>&1; then
  fail "imagem de servidor $SERVER_IMAGE ausente"
fi
if ! docker image inspect "$CLIENT_IMAGE" >/dev/null 2>&1; then
  fail "imagem de cliente $CLIENT_IMAGE ausente"
fi

SERVER_DIGEST="$(docker image inspect "$SERVER_IMAGE" --format '{{index .RepoDigests 0}}')"
CLIENT_DIGEST="$(docker image inspect "$CLIENT_IMAGE" --format '{{index .RepoDigests 0}}')"
echo "OK server_image=$SERVER_IMAGE digest=$SERVER_DIGEST"
echo "OK client_image=$CLIENT_IMAGE digest=$CLIENT_DIGEST"

RUN_ID="$(date -u +%Y%m%d%H%M%S)-$(openssl rand -hex 4)"
SERVER="planeje-fase1-pg-${RUN_ID}"
CLIENT="planeje-fase1-cli-${RUN_ID}"
NETWORK="planeje-fase1-net-${RUN_ID}"
VOLUME="planeje-fase1-vol-${RUN_ID}"
LABELS=(
  --label "planeje.fase1.run=${RUN_ID}"
  --label "planeje.fase1.disposable=true"
  --label "planeje.fase1.purpose=central-trafego-fase1"
)
PASS="$(openssl rand -hex 24)"

for n in "$SERVER" "$CLIENT"; do
  if docker inspect "$n" >/dev/null 2>&1; then
    fail "container preexistente recusado: nome em uso"
  fi
done

step "1 create disposable docker env"
docker network create --internal \
  "${LABELS[@]}" \
  "$NETWORK" >/dev/null
docker volume create \
  "${LABELS[@]}" \
  "$VOLUME" >/dev/null

docker run -d \
  --name "$SERVER" \
  "${LABELS[@]}" \
  --network "$NETWORK" \
  --network-alias "$SERVER" \
  --publish-all=false \
  --shm-size=256m \
  -e POSTGRES_PASSWORD="$PASS" \
  -v "$VOLUME":/var/lib/postgresql/data \
  -v "$ROOT":/repo:ro \
  "$SERVER_IMAGE" \
  postgres -c config_file=/etc/postgresql/postgresql.conf -c cron.database_name=planeje_fase1 >/dev/null

docker run -d \
  --name "$CLIENT" \
  "${LABELS[@]}" \
  --network "$NETWORK" \
  --network-alias "$CLIENT" \
  --publish-all=false \
  -v "$DUMP_NEED":/dump.dump:ro \
  -v "$ROOT":/repo:ro \
  "$CLIENT_IMAGE" \
  sleep infinity >/dev/null

ok "env server=$SERVER client=$CLIENT"

client_exec() {
  docker exec \
    -e PGPASSWORD="$PASS" \
    -e PGHOST="$SERVER" \
    -e PGUSER=supabase_admin \
    -e PGSSLMODE=disable \
    "$CLIENT" \
    "$@"
}

# Unix socket no servidor: evita restrição TCP do supautils em papéis reservados.
local_psql() {
  docker exec \
    -e PGPASSWORD="$PASS" \
    -e PGUSER=supabase_admin \
    -e PGHOST=/var/run/postgresql \
    -e PGSSLMODE=disable \
    "$SERVER" \
    psql -d "$DBNAME" "$@"
}

local_psql_i() {
  docker exec -i \
    -e PGPASSWORD="$PASS" \
    -e PGUSER=supabase_admin \
    -e PGHOST=/var/run/postgresql \
    -e PGSSLMODE=disable \
    "$SERVER" \
    psql -d "$DBNAME" "$@"
}

step "1b wait postgres"
READY=0
for _ in $(seq 1 90); do
  if docker exec "$CLIENT" pg_isready -h "$SERVER" -U supabase_admin -d postgres >/dev/null 2>&1; then
    READY=1
    break
  fi
  if docker exec "$SERVER" pg_isready -U postgres -h localhost >/dev/null 2>&1; then
    if docker exec "$CLIENT" pg_isready -h "$SERVER" -U supabase_admin -d postgres >/dev/null 2>&1; then
      READY=1
      break
    fi
  fi
  sleep 2
done
[[ "$READY" == "1" ]] || fail "postgres not ready"
ok "postgres ready"

step "1c create database"
client_exec psql -d postgres -v ON_ERROR_STOP=1 -q -X \
  -c "CREATE DATABASE ${DBNAME} TEMPLATE template0;" >/dev/null
ok "database=$DBNAME"

step "1d ensure dump owners"
ROLE_CREATED=0
ROLES_N=0
while read -r ROLE; do
  [[ -z "$ROLE" ]] && continue
  [[ "$ROLE" == pg_* ]] && continue
  ROLES_N=$((ROLES_N+1))
  if [[ "$(client_exec psql -d postgres -At -q -X -c "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${ROLE@Q});")" == "t" ]]; then
    continue
  fi
  client_exec psql -d postgres -v ON_ERROR_STOP=1 -q -X \
    -c "CREATE ROLE ${ROLE} NOLOGIN;" >/dev/null
  ROLE_CREATED=$((ROLE_CREATED+1))
done < <(docker exec "$CLIENT" pg_restore -l /dump.dump \
  | awk '/^[0-9]+;/ { n=split($0,a," "); o=a[n]; if (o!="-" && o ~ /^[a-zA-Z_][a-zA-Z0-9_]*$/) print o }' \
  | sort -u)
ok "dump_owner_names=$ROLES_N created=$ROLE_CREATED"

step "2 restore dump"
set +e
client_exec pg_restore --exit-on-error -d "$DBNAME" /dump.dump >/tmp/planeje-fase1-restore.log 2>&1
RESTORE_EC=$?
set -e
if [[ "$RESTORE_EC" -ne 0 ]]; then
  echo "FAIL restore exit=$RESTORE_EC"
  tail -n 40 /tmp/planeje-fase1-restore.log
  exit 1
fi
ok "restore exit=$RESTORE_EC"

step "2b restore session privilege"
set +e
local_psql -v ON_ERROR_STOP=1 -q -X \
  -c "GRANT USAGE ON SCHEMA auth TO PUBLIC; GRANT SELECT ON TABLE auth.users TO PUBLIC; GRANT USAGE ON SCHEMA supabase_functions TO PUBLIC; GRANT ALL ON ALL TABLES IN SCHEMA supabase_functions TO PUBLIC;" \
  >/tmp/planeje-fase1-priv.log 2>&1
PRIV_EC=$?
if [[ "$PRIV_EC" -eq 0 ]]; then
  local_psql_i -v ON_ERROR_STOP=1 -q -X >/tmp/planeje-fase1-priv.log 2>&1 <<'SQL'
DO $body$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch, c.relname AS rel, t.tgname AS tg
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace np ON np.oid = p.pronamespace
    WHERE NOT t.tgisinternal
      AND np.nspname = 'supabase_functions'
      AND p.proname = 'http_request'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I DISABLE TRIGGER %I', r.sch, r.rel, r.tg);
  END LOOP;
END
$body$;
SQL
  PRIV_EC=$?
fi
set -e
if [[ "$PRIV_EC" -ne 0 ]]; then
  echo "FAIL privilege repair exit=$PRIV_EC"
  tail -n 20 /tmp/planeje-fase1-priv.log
  exit 1
fi
ok "auth schema usable"

step "3 pre fixture"
set +e
local_psql -v ON_ERROR_STOP=1 -q -X \
  -f /repo/scripts/test-central-trafego-fase1.pre.pg.sql >/tmp/planeje-fase1-pre.log 2>&1
PRE_EC=$?
set -e
if [[ "$PRE_EC" -ne 0 ]]; then
  echo "FAIL pre exit=$PRE_EC"
  tail -n 40 /tmp/planeje-fase1-pre.log
  exit 1
fi
ok "pre exit=$PRE_EC"

step "4 caixa md5 before"
HASH_BEFORE="$(local_psql -At -q -X \
  -c "SELECT md5(pg_get_functiondef('public.criar_pendencias_caixa_comentario()'::regprocedure));")"
[[ -n "$HASH_BEFORE" ]] || fail "caixa hash empty before"
ok "caixa_before_len=${#HASH_BEFORE}"

step "5 apply migration"
set +e
local_psql -v ON_ERROR_STOP=1 -q -X \
  -f /repo/supabase/migrations/20260826010000_central_trafego_fase1.sql >/tmp/planeje-fase1-mig.log 2>&1
MIG_EC=$?
set -e
if [[ "$MIG_EC" -ne 0 ]]; then
  echo "FAIL migration exit=$MIG_EC"
  tail -n 40 /tmp/planeje-fase1-mig.log
  exit 1
fi
ok "migration exit=$MIG_EC"

step "5b apply checkup migration"
set +e
local_psql -v ON_ERROR_STOP=1 -q -X \
  -f /repo/supabase/migrations/20260826220000_central_trafego_checkup.sql >/tmp/planeje-checkup-mig.log 2>&1
CHECKUP_EC=$?
set -e
if [[ "$CHECKUP_EC" -ne 0 ]]; then
  echo "FAIL checkup migration exit=$CHECKUP_EC"
  tail -n 60 /tmp/planeje-checkup-mig.log
  exit 1
fi
ok "checkup migration exit=$CHECKUP_EC"

step "5c reapply checkup migration"
set +e
local_psql -v ON_ERROR_STOP=1 -q -X \
  -f /repo/supabase/migrations/20260826220000_central_trafego_checkup.sql >/tmp/planeje-checkup-remig.log 2>&1
RECHECKUP_EC=$?
set -e
if [[ "$RECHECKUP_EC" -ne 0 ]]; then
  echo "FAIL checkup remigration exit=$RECHECKUP_EC"
  tail -n 40 /tmp/planeje-checkup-remig.log
  exit 1
fi
ok "checkup remigration exit=$RECHECKUP_EC"

step "6 caixa md5 after"
HASH_AFTER="$(local_psql -At -q -X \
  -c "SELECT md5(pg_get_functiondef('public.criar_pendencias_caixa_comentario()'::regprocedure));")"
if [[ "$HASH_BEFORE" == "$HASH_AFTER" ]]; then
  ok "caixa_hash=equal"
else
  fail "caixa_hash=different"
fi

step "7 post tests"
set +e
local_psql -v ON_ERROR_STOP=1 -q -X \
  -f /repo/scripts/test-central-trafego-fase1.pg.sql >/tmp/planeje-fase1-post.log 2>&1
POST_EC=$?
set -e
if [[ "$POST_EC" -ne 0 ]]; then
  echo "FAIL post-sql exit=$POST_EC"
  tail -n 60 /tmp/planeje-fase1-post.log
  exit 1
fi
ok "post-sql exit=$POST_EC"

step "7b checkup post tests"
set +e
local_psql -v ON_ERROR_STOP=1 -q -X \
  -f /repo/scripts/test-central-trafego-checkup.pg.sql >/tmp/planeje-checkup-post.log 2>&1
CHECKUP_POST_EC=$?
set -e
if [[ "$CHECKUP_POST_EC" -ne 0 ]]; then
  echo "FAIL checkup post-sql exit=$CHECKUP_POST_EC"
  tail -n 80 /tmp/planeje-checkup-post.log
  exit 1
fi
ok "checkup post-sql exit=$CHECKUP_POST_EC"

step "8 backfill assertions"
ASSERT_JSON="$(local_psql -At -q -X -c "
SELECT json_build_object(
  'invalid_uuid_links', (
    SELECT count(*) FROM public.paid_campaign_task_links l
    JOIN public.paid_campaigns pc ON pc.id = l.paid_campaign_id
    WHERE pc.name = '__ct_fase1_camp_uuid_invalido'
  ),
  'legacy_links', (
    SELECT count(*) FROM public.paid_campaign_task_links l
    JOIN public.paid_campaigns pc ON pc.id = l.paid_campaign_id
    JOIN public.tarefas t ON t.id = l.task_id
    WHERE pc.name = '__ct_fase1_camp_legacy_ok'
      AND t.title = '__ct_fase1_task_legacy'
      AND l.relation_type = 'legacy'
  ),
  'prio_alta_high', (SELECT count(*) FROM public.tarefas WHERE title = '__ct_fase1_task_alta' AND priority = 'high'),
  'prio_media_medium', (SELECT count(*) FROM public.tarefas WHERE title = '__ct_fase1_task_media' AND priority = 'medium'),
  'prio_null_medium', (SELECT count(*) FROM public.tarefas WHERE title = '__ct_fase1_task_nullprio' AND priority = 'medium'),
  'ops_needs_review_null_gestor', (
    SELECT count(*) FROM public.traffic_client_ops o
    JOIN public.clientes c ON c.id = o.client_id
    WHERE c.empresa = '__ct_fase1_client_a'
      AND o.situation = 'needs_review'
      AND o.primary_assignee_id IS NULL
  )
);
")"
echo "OK assertions $ASSERT_JSON"
python3 - "$ASSERT_JSON" <<'PY'
import json,sys
j=json.loads(sys.argv[1])
expect={
  'invalid_uuid_links':0,
  'legacy_links':1,
  'prio_alta_high':1,
  'prio_media_medium':1,
  'prio_null_medium':1,
  'ops_needs_review_null_gestor':1,
}
bad=[k for k,v in expect.items() if j.get(k)!=v]
if bad:
    raise SystemExit('assertions failed: '+','.join(bad))
PY
ok "backfill assertions passed"

step "9 migration committed"
COMMITTED="$(local_psql -At -q -X -c "
SELECT count(*) FROM information_schema.tables
WHERE table_schema='public'
  AND table_name IN (
    'traffic_task_details',
    'paid_campaign_task_links',
    'traffic_completion_evidence',
    'traffic_client_ops',
    'traffic_checkup_settings',
    'traffic_checkup_runs',
    'traffic_checkup_items'
  );
")"
[[ "$COMMITTED" == "7" ]] || fail "migration objects not visible in new session count=$COMMITTED"
ok "migration committed tables=7"

echo "DONE restore=$RESTORE_EC migration=$MIG_EC checkup=$CHECKUP_EC post_sql=$POST_EC checkup_post=$CHECKUP_POST_EC caixa_hash=equal"
exit 0
