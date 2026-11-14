BEGIN;
ALTER TABLE public.atlas_execution_items DROP CONSTRAINT atlas_execution_items_state_check;
ALTER TABLE public.atlas_execution_items ADD CONSTRAINT atlas_execution_items_state_check
  CHECK(state IN('awaiting_input','proposed','executing','completed','rejected','cancelled','conflict','failed','uncertain'));

CREATE TABLE private.atlas_executor_external_approvals (
  item_id uuid PRIMARY KEY REFERENCES public.atlas_execution_items(id),
  source_session_id uuid NOT NULL,
  payload jsonb NOT NULL,
  before jsonb,
  action text NOT NULL CHECK(action IN('update_meta','create_meta_campaign')),
  account_id text NOT NULL CHECK(account_id ~ '^act_[0-9]{1,32}$'),
  approved_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE private.atlas_executor_external_steps (
  item_id uuid NOT NULL REFERENCES private.atlas_executor_external_approvals(item_id),
  step text NOT NULL CHECK(step IN('update','campaign','adset','creative','ad')),
  request jsonb NOT NULL CHECK(jsonb_typeof(request)='object'),
  state text NOT NULL CHECK(state IN('reserved','completed','failed','uncertain','conflict')),
  lease uuid NOT NULL DEFAULT gen_random_uuid(),
  expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '3 minutes',
  receipt jsonb,
  error jsonb,
  reserved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  finished_at timestamptz,
  PRIMARY KEY(item_id,step)
);
ALTER TABLE private.atlas_executor_external_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.atlas_executor_external_steps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.atlas_executor_external_approvals,private.atlas_executor_external_steps FROM PUBLIC,anon,authenticated,service_role;

-- Mirrors the current Tráfego actor predicate without changing JWT claims or using a service client as that actor.
CREATE FUNCTION private.atlas_executor_external_permission(p_item public.atlas_execution_items,p_session uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE account text;staff text;field text;spend boolean;
BEGIN
  account:=CASE p_item.action WHEN 'update_meta' THEN p_item.payload->>'adAccountId' WHEN 'create_meta_campaign' THEN p_item.payload#>>'{plan,account_id}' END;
  spend:=p_item.action='create_meta_campaign' OR p_item.payload ?| ARRAY['daily_budget','lifetime_budget'];
  SELECT p.role::text INTO staff FROM public.profiles p WHERE p.id=p_item.owner_id AND p.status='active';
  IF p_item.app<>'gestor' OR p_item.kind<>'proposal' OR staff IS NULL OR staff NOT IN('superadmin','admin','colaborador')
    OR p_item.client_id IS NULL OR coalesce(account,'') !~ '^act_[0-9]{1,32}$'
    OR NOT EXISTS(SELECT 1 FROM auth.users u JOIN auth.sessions s ON s.user_id=u.id WHERE u.id=p_item.owner_id AND s.id=p_session
      AND (u.banned_until IS NULL OR u.banned_until<clock_timestamp()) AND (s.not_after IS NULL OR s.not_after>clock_timestamp()))
    OR NOT EXISTS(SELECT 1 FROM public.atlas_settings a WHERE a.id='atlas' AND a.owner_id=p_item.owner_id AND a.enabled)
    OR NOT EXISTS(SELECT 1 FROM public.clientes c WHERE c.id=p_item.client_id AND c.etapa='closed')
    OR NOT (staff IN('superadmin','admin') OR EXISTS(SELECT 1 FROM public.traffic_client_ops o WHERE o.client_id=p_item.client_id AND o.primary_assignee_id=p_item.owner_id)
      OR EXISTS(SELECT 1 FROM public.traffic_client_access a WHERE a.client_id=p_item.client_id AND a.profile_id=p_item.owner_id))
    OR EXISTS(SELECT 1 FROM unnest(ARRAY['assistant','paid_traffic']) m(name) WHERE NOT coalesce(
      (SELECT u.is_enabled FROM public.user_module_permissions u WHERE u.user_id=p_item.owner_id AND u.module_name::text=m.name),
      (SELECT g.is_enabled FROM public.module_settings g WHERE g.module_name::text=m.name),true))
    OR NOT EXISTS(SELECT 1 FROM public.cliente_meta_accounts a WHERE a.cliente_id=p_item.client_id AND a.is_active
      AND 'act_'||regexp_replace(a.meta_account_id::text,'^act_','')=account)
  THEN RETURN false;END IF;
  IF staff<>'superadmin' THEN
    FOREACH field IN ARRAY CASE WHEN spend THEN ARRAY['meta_resumo','valor'] ELSE ARRAY['meta_resumo'] END LOOP
      IF NOT coalesce((SELECT u.can_view IS TRUE FROM public.user_client_field_permissions u WHERE u.user_id=p_item.owner_id AND u.field_name::text=field),
        (SELECT r.can_view IS TRUE FROM public.client_field_permissions r WHERE r.role::text=staff AND r.field_name::text=field),true)
      THEN RETURN false;END IF;
    END LOOP;
  END IF;
  RETURN true;
END $$;

CREATE FUNCTION private.atlas_executor_external_validate(p_item public.atlas_execution_items) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE p jsonb:=p_item.payload;account text;budget text;changes integer:=0;
BEGIN
  IF p_item.action='update_meta' THEN
    account:=p->>'adAccountId';
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(p) k WHERE k NOT IN('adAccountId','objectId','level','status','daily_budget','lifetime_budget'))
      OR coalesce(p->>'objectId','') !~ '^[0-9]{5,30}$' OR coalesce(p->>'level','') NOT IN('campaign','adset','ad')
      OR jsonb_typeof(p_item.before) IS DISTINCT FROM 'object' OR p_item.before->>'api_version' IS DISTINCT FROM 'v25.0'
      OR p_item.before->>'object_id' IS DISTINCT FROM p->>'objectId' OR p_item.before->>'account_id' IS DISTINCT FROM account
      OR p_item.before->>'level' IS DISTINCT FROM p->>'level' OR jsonb_typeof(p_item.before->'configured_status') IS DISTINCT FROM 'string'
      OR coalesce(p_item.before->>'currency','') !~ '^[A-Z]{3}$'
    THEN RAISE invalid_parameter_value USING MESSAGE='Proposta Meta sem fotografia e escopo exatos.';END IF;
    IF p ? 'status' THEN
      IF p->>'status' NOT IN('ACTIVE','PAUSED') OR jsonb_typeof(p->'status')<>'string' THEN RAISE invalid_parameter_value USING MESSAGE='Status Meta inválido.';END IF;
      changes:=changes+1;
    END IF;
    FOREACH budget IN ARRAY ARRAY['daily_budget','lifetime_budget'] LOOP
      IF p ? budget THEN
        IF p->>'level'<>'adset' OR jsonb_typeof(p->budget) IS DISTINCT FROM 'number' OR (p->>budget)::numeric NOT BETWEEN 100 AND 100000000
          OR trunc((p->>budget)::numeric)<>(p->>budget)::numeric OR jsonb_typeof(p_item.before->budget) IS DISTINCT FROM 'number'
        THEN RAISE invalid_parameter_value USING MESSAGE='Verba Meta inválida ou sem fotografia.';END IF;
        changes:=changes+1;
      END IF;
    END LOOP;
    IF changes=0 OR p ?& ARRAY['daily_budget','lifetime_budget'] THEN RAISE invalid_parameter_value USING MESSAGE='Alteração Meta vazia ou ambígua.';END IF;
  ELSIF p_item.action='create_meta_campaign' THEN
    account:=p#>>'{plan,account_id}';
    IF (SELECT count(*) FROM jsonb_object_keys(p))<>1 OR p#>>'{plan,kind}' IS DISTINCT FROM 'meta_campaign_v1'
      OR p#>>'{plan,api_version}' IS DISTINCT FROM 'v25.0' THEN RAISE invalid_parameter_value USING MESSAGE='Plano Meta inválido.';END IF;
  ELSE RAISE invalid_parameter_value USING MESSAGE='Operação externa não permitida.';END IF;
  IF coalesce(account,'') !~ '^act_[0-9]{1,32}$' THEN RAISE invalid_parameter_value USING MESSAGE='Conta Meta explícita necessária.';END IF;
  RETURN account;
END $$;

CREATE FUNCTION private.atlas_executor_external_check(p_item public.atlas_execution_items,p_session uuid,p_service boolean) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE a private.atlas_executor_external_approvals;r public.atlas_runs;
BEGIN
  IF p_item.id IS NULL THEN RAISE insufficient_privilege USING MESSAGE='Operação indisponível.';END IF;
  IF p_service AND (auth.role() IS DISTINCT FROM 'service_role' OR auth.uid() IS NOT NULL) THEN RAISE insufficient_privilege USING MESSAGE='Ledger reservado ao serviço.';END IF;
  IF NOT p_service AND (private.atlas_executor_user() IS DISTINCT FROM p_item.owner_id OR nullif(auth.jwt()->>'session_id','')::uuid IS DISTINCT FROM p_session) THEN
    RAISE insufficient_privilege USING MESSAGE='A sessão atual não é a sessão desta aprovação.';END IF;
  SELECT * INTO r FROM public.atlas_runs WHERE id=p_item.run_id AND owner_id=p_item.owner_id AND conversation_id=p_item.conversation_id;
  IF r.id IS NULL OR r.source_session_id IS DISTINCT FROM p_session OR r.request_client_id IS DISTINCT FROM p_item.client_id
    OR left(r.request_message,length('[Executor Planeje]')) IS DISTINCT FROM '[Executor Planeje]'
    OR NOT EXISTS(SELECT 1 FROM public.atlas_conversations c WHERE c.id=p_item.conversation_id AND c.owner_id=p_item.owner_id AND c.client_id=p_item.client_id)
    OR NOT private.atlas_executor_external_permission(p_item,p_session)
  THEN RAISE insufficient_privilege USING MESSAGE='Usuário, sessão, módulos, cliente ou conta da operação mudaram.';END IF;
  SELECT * INTO a FROM private.atlas_executor_external_approvals WHERE item_id=p_item.id;
  IF a.item_id IS NOT NULL AND (a.source_session_id IS DISTINCT FROM p_session OR a.payload IS DISTINCT FROM p_item.payload OR a.before IS DISTINCT FROM p_item.before OR a.action IS DISTINCT FROM p_item.action) THEN
    RAISE insufficient_privilege USING MESSAGE='A especificação aprovada mudou.';END IF;
END $$;

CREATE FUNCTION private.atlas_executor_external_refresh(p_id uuid) RETURNS public.atlas_execution_items
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE i public.atlas_execution_items;next_state text;steps jsonb;completed integer;
BEGIN
  SELECT * INTO i FROM public.atlas_execution_items WHERE id=p_id FOR UPDATE;
  UPDATE private.atlas_executor_external_steps SET state='uncertain',error='{"code":"LEASE_EXPIRED","message":"A tentativa perdeu a confirmação. Apenas a conferência pode continuar."}',finished_at=clock_timestamp()
    WHERE item_id=p_id AND state='reserved' AND expires_at<=clock_timestamp();
  SELECT coalesce(jsonb_agg(jsonb_build_object('step',s.step,'state',s.state,'receipt',s.receipt,'error',s.error) ORDER BY s.reserved_at,s.step),'[]'::jsonb),count(*) FILTER(WHERE state='completed')
    INTO steps,completed FROM private.atlas_executor_external_steps s WHERE item_id=p_id;
  next_state:=CASE WHEN EXISTS(SELECT 1 FROM private.atlas_executor_external_steps WHERE item_id=p_id AND state='conflict') THEN 'conflict'
    WHEN EXISTS(SELECT 1 FROM private.atlas_executor_external_steps WHERE item_id=p_id AND state='failed') THEN 'failed'
    WHEN EXISTS(SELECT 1 FROM private.atlas_executor_external_steps WHERE item_id=p_id AND state='uncertain') THEN 'uncertain'
    WHEN completed=CASE WHEN i.action='update_meta' THEN 1 ELSE 4 END THEN 'completed' ELSE 'executing' END;
  IF i.state IS DISTINCT FROM next_state OR i.result IS DISTINCT FROM jsonb_build_object('external',true,'steps',steps) THEN
    UPDATE public.atlas_execution_items SET state=next_state,result=jsonb_build_object('external',true,'steps',steps),revision=revision+1,updated_at=clock_timestamp()
      WHERE id=p_id RETURNING * INTO i;
  END IF;
  RETURN i;
END $$;

CREATE FUNCTION public.atlas_executor_external_approve(p_id uuid,p_revision integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.atlas_executor_user();i public.atlas_execution_items;s uuid:=nullif(auth.jwt()->>'session_id','')::uuid;account text;
BEGIN
  SELECT * INTO i FROM public.atlas_execution_items WHERE id=p_id AND owner_id=actor FOR UPDATE;
  IF i.id IS NULL THEN RAISE insufficient_privilege USING MESSAGE='Proposta indisponível.';END IF;
  PERFORM private.atlas_executor_external_check(i,s,false);account:=private.atlas_executor_external_validate(i);
  IF i.state<>'proposed' THEN
    IF i.decision IS DISTINCT FROM 'approve' OR NOT EXISTS(SELECT 1 FROM private.atlas_executor_external_approvals WHERE item_id=i.id) THEN RAISE serialization_failure USING MESSAGE='O item já recebeu outra decisão.';END IF;
    RETURN jsonb_build_object('item',to_jsonb(i)-'specification'-'decision_data','source_session_id',s);
  END IF;
  IF p_revision IS NULL OR i.revision<>p_revision THEN RAISE serialization_failure USING MESSAGE='A revisão da proposta mudou.';END IF;
  INSERT INTO private.atlas_executor_external_approvals(item_id,source_session_id,payload,before,action,account_id) VALUES(i.id,s,i.payload,i.before,i.action,account);
  UPDATE public.atlas_execution_items SET state='executing',decision='approve',decision_data='{"answers":{},"text":null}',revision=revision+1,decided_at=clock_timestamp(),updated_at=clock_timestamp()
    WHERE id=i.id RETURNING * INTO i;
  RETURN jsonb_build_object('item',to_jsonb(i)-'specification'-'decision_data','source_session_id',s);
END $$;

CREATE FUNCTION public.atlas_executor_external_status(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid:=private.atlas_executor_user();i public.atlas_execution_items;s uuid:=nullif(auth.jwt()->>'session_id','')::uuid;
BEGIN
  SELECT * INTO i FROM public.atlas_execution_items WHERE id=p_id AND owner_id=actor FOR UPDATE;
  IF i.id IS NULL THEN RAISE insufficient_privilege USING MESSAGE='Operação indisponível.';END IF;
  PERFORM private.atlas_executor_external_check(i,s,false);
  IF i.decision='approve' THEN i:=private.atlas_executor_external_refresh(i.id);END IF;
  RETURN jsonb_build_object('item',to_jsonb(i)-'specification'-'decision_data','source_session_id',s);
END $$;

-- Fixed request builder. The service can reserve only the exact approved plan and prior receipt IDs.
CREATE FUNCTION private.atlas_executor_external_campaign_request(p_item public.atlas_execution_items,p_step text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE plan jsonb:=p_item.payload->'plan';input jsonb:=plan->'input';c jsonb:=input->'creative';body jsonb;targeting jsonb;parent text;creative text;edge text;
BEGIN
  edge:=CASE p_step WHEN 'campaign' THEN 'campaigns' WHEN 'adset' THEN 'adsets' WHEN 'creative' THEN 'adcreatives' WHEN 'ad' THEN 'ads' END;
  IF edge IS NULL THEN RAISE invalid_parameter_value USING MESSAGE='Etapa Meta inválida.';END IF;
  IF p_step='campaign' THEN
    body:=jsonb_build_object('name',input->'campaign_name','objective','OUTCOME_TRAFFIC','buying_type','AUCTION','special_ad_categories','[]'::jsonb,'is_adset_budget_sharing_enabled',false,'status','PAUSED');
  ELSIF p_step='adset' THEN
    SELECT s.receipt->>'id' INTO parent FROM private.atlas_executor_external_steps s WHERE s.item_id=p_item.id AND s.step='campaign' AND s.state='completed';
    IF parent IS NULL THEN RAISE invalid_parameter_value USING MESSAGE='Campanha sem recibo comprovado.';END IF;
    targeting:=jsonb_build_object('geo_locations',jsonb_build_object('countries',input->'countries'),'age_min',input->'age_min','age_max',input->'age_max',
      'publisher_platforms','["facebook"]'::jsonb,'facebook_positions','["feed"]'::jsonb,'targeting_automation','{"advantage_audience":0}'::jsonb);
    IF input->>'gender'<>'all' THEN targeting:=targeting||jsonb_build_object('genders',jsonb_build_array(CASE input->>'gender' WHEN 'men' THEN 1 ELSE 2 END));END IF;
    body:=jsonb_build_object('name',input->'adset_name','campaign_id',parent,CASE input#>>'{budget,type}' WHEN 'daily' THEN 'daily_budget' ELSE 'lifetime_budget' END,plan->'budget_minor',
      'optimization_goal','LINK_CLICKS','billing_event','IMPRESSIONS','bid_strategy','LOWEST_COST_WITHOUT_CAP','destination_type','WEBSITE','targeting',targeting,'start_time',input->'start_time','status','PAUSED');
    IF input ? 'end_time' THEN body:=body||jsonb_build_object('end_time',input->'end_time');END IF;
  ELSIF p_step='creative' THEN
    body:=jsonb_build_object('name',input->'creative_name');
    IF c->>'mode'='post' THEN body:=body||jsonb_build_object('object_story_id',c->'post_id');
    ELSE body:=body||jsonb_build_object('object_story_spec',jsonb_build_object('page_id',c->'page_id','link_data',
      jsonb_build_object('image_hash',c->'image_hash','link',c->'url','message',c->'message','name',c->'headline',
        'call_to_action',jsonb_build_object('type',c->'call_to_action','value',jsonb_build_object('link',c->'url')))
        ||CASE WHEN c ? 'description' THEN jsonb_build_object('description',c->'description') ELSE '{}'::jsonb END));END IF;
  ELSE
    SELECT s.receipt->>'id' INTO parent FROM private.atlas_executor_external_steps s WHERE s.item_id=p_item.id AND s.step='adset' AND s.state='completed';
    SELECT s.receipt->>'id' INTO creative FROM private.atlas_executor_external_steps s WHERE s.item_id=p_item.id AND s.step='creative' AND s.state='completed';
    IF parent IS NULL OR creative IS NULL THEN RAISE invalid_parameter_value USING MESSAGE='Conjunto ou criativo sem recibo comprovado.';END IF;
    body:=jsonb_build_object('name',input->'ad_name','adset_id',parent,'creative',jsonb_build_object('creative_id',creative),'status','PAUSED');
  END IF;
  RETURN jsonb_build_object('method','POST','path','/v25.0/'||(plan->>'account_id')||'/'||edge,'body',body);
END $$;

CREATE FUNCTION public.atlas_executor_external_reserve(p_item uuid,p_source_session uuid,p_step text,p_request jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE i public.atlas_execution_items;a private.atlas_executor_external_approvals;v_step private.atlas_executor_external_steps;
BEGIN
  SELECT * INTO i FROM public.atlas_execution_items WHERE id=p_item FOR UPDATE;
  PERFORM private.atlas_executor_external_check(i,p_source_session,true);
  SELECT * INTO a FROM private.atlas_executor_external_approvals WHERE item_id=i.id;
  IF a.item_id IS NULL OR i.decision<>'approve' THEN RAISE insufficient_privilege USING MESSAGE='Aprovação humana necessária.';END IF;
  IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR length(p_request::text)>60000 OR p_request->>'method' IS DISTINCT FROM 'POST'
    OR jsonb_typeof(p_request->'body') IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_request) k WHERE k NOT IN('method','path','body'))
  THEN RAISE invalid_parameter_value USING MESSAGE='Requisição externa inválida.';END IF;
  IF i.action='update_meta' THEN
    IF p_step<>'update' OR p_request->>'path' IS DISTINCT FROM '/v25.0/'||(i.payload->>'objectId')
      OR p_request->'body' IS DISTINCT FROM i.payload-ARRAY['adAccountId','objectId','level']
    THEN RAISE invalid_parameter_value USING MESSAGE='A requisição diverge da alteração aprovada.';END IF;
  ELSE
    IF p_request IS DISTINCT FROM private.atlas_executor_external_campaign_request(i,p_step)
    THEN RAISE invalid_parameter_value USING MESSAGE='Etapa Meta diverge do plano pausado e dos recibos anteriores.';END IF;
  END IF;
  i:=private.atlas_executor_external_refresh(i.id);
  SELECT * INTO v_step FROM private.atlas_executor_external_steps WHERE item_id=i.id AND step=p_step;
  IF v_step.item_id IS NOT NULL THEN
    IF v_step.request IS DISTINCT FROM p_request THEN RAISE serialization_failure USING MESSAGE='A etapa já possui outra requisição.';END IF;
    RETURN (to_jsonb(v_step)-'request')||jsonb_build_object('claimed',false);
  END IF;
  IF i.state<>'executing' THEN RAISE serialization_failure USING MESSAGE='Resolva o estado anterior antes de continuar.';END IF;
  INSERT INTO private.atlas_executor_external_steps(item_id,step,request,state) VALUES(i.id,p_step,p_request,'reserved') RETURNING * INTO v_step;
  RETURN (to_jsonb(v_step)-'request')||jsonb_build_object('claimed',true);
END $$;

CREATE FUNCTION public.atlas_executor_external_finish(p_item uuid,p_source_session uuid,p_step text,p_lease uuid,p_state text,p_receipt jsonb DEFAULT NULL,p_error jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE i public.atlas_execution_items;a private.atlas_executor_external_approvals;v_step private.atlas_executor_external_steps;v_error jsonb;key text;
BEGIN
  SELECT * INTO i FROM public.atlas_execution_items WHERE id=p_item FOR UPDATE;PERFORM private.atlas_executor_external_check(i,p_source_session,true);
  SELECT * INTO a FROM private.atlas_executor_external_approvals WHERE item_id=i.id;
  SELECT * INTO v_step FROM private.atlas_executor_external_steps WHERE item_id=i.id AND step=p_step FOR UPDATE;
  IF v_step.item_id IS NULL OR p_lease IS DISTINCT FROM v_step.lease THEN RAISE insufficient_privilege USING MESSAGE='Reserva externa não corresponde à etapa.';END IF;
  IF p_state IS NULL OR p_state NOT IN('completed','failed','uncertain','conflict') THEN RAISE invalid_parameter_value USING MESSAGE='Estado externo inválido.';END IF;
  IF p_receipt IS NOT NULL AND p_receipt<>'null'::jsonb AND (jsonb_typeof(p_receipt)<>'object' OR length(p_receipt::text)>12000
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_receipt) k WHERE k NOT IN('id','account_id','step','verified','snapshot','verification'))
    OR coalesce(p_receipt->>'id','') !~ '^[0-9]{5,30}$' OR p_receipt->>'account_id' IS DISTINCT FROM a.account_id OR p_receipt->>'step' IS DISTINCT FROM p_step)
  THEN RAISE invalid_parameter_value USING MESSAGE='Recibo externo sem identidade comprovada.';END IF;
  IF p_state='completed' THEN
    IF p_receipt IS NULL OR p_receipt->'verified' IS DISTINCT FROM 'true'::jsonb THEN RAISE invalid_parameter_value USING MESSAGE='Recibo confirmado necessário.';END IF;
    IF i.action='update_meta' THEN
      IF p_receipt->>'id' IS DISTINCT FROM i.payload->>'objectId' OR p_receipt#>>'{snapshot,account_id}' IS DISTINCT FROM a.account_id
        OR p_receipt#>>'{snapshot,object_id}' IS DISTINCT FROM i.payload->>'objectId' OR p_receipt#>>'{snapshot,level}' IS DISTINCT FROM i.payload->>'level'
        OR p_receipt#>>'{snapshot,api_version}' IS DISTINCT FROM 'v25.0'
        OR p_receipt#>>'{snapshot,currency}' IS DISTINCT FROM i.before->>'currency' OR p_receipt#>'{snapshot,currency_offset}' IS DISTINCT FROM i.before->'currency_offset'
        OR i.payload ? 'status' AND p_receipt#>>'{snapshot,configured_status}' IS DISTINCT FROM i.payload->>'status'
      THEN RAISE invalid_parameter_value USING MESSAGE='Estado observado não confirma o pedido.';END IF;
      FOREACH key IN ARRAY ARRAY['daily_budget','lifetime_budget'] LOOP
        IF i.payload ? key AND (p_receipt->'snapshot'->key IS DISTINCT FROM i.payload->key) THEN RAISE invalid_parameter_value USING MESSAGE='Verba observada não confirma o pedido.';END IF;
      END LOOP;
    END IF;
  END IF;
  v_error:=CASE WHEN p_state='completed' THEN NULL ELSE jsonb_build_object('code',CASE WHEN coalesce(p_error->>'code','') ~ '^[A-Z0-9_]{1,80}$' THEN p_error->>'code' ELSE 'EXTERNAL_UNCONFIRMED' END,
    'message',CASE p_state WHEN 'failed' THEN 'A etapa externa foi recusada ou parou antes do envio.' WHEN 'conflict' THEN 'O objeto mudou após a revisão.' ELSE 'A etapa externa está sem confirmação. Confira antes de continuar.' END) END;
  IF v_step.state IN('completed','failed','conflict') THEN
    IF v_step.state IS DISTINCT FROM p_state OR coalesce(v_step.receipt,'null'::jsonb) IS DISTINCT FROM coalesce(p_receipt,'null'::jsonb) OR v_step.error IS DISTINCT FROM v_error THEN
      RAISE serialization_failure USING MESSAGE='A etapa já possui outro recibo terminal.';END IF;
  ELSE
    UPDATE private.atlas_executor_external_steps SET state=p_state,receipt=nullif(p_receipt,'null'::jsonb),error=v_error,finished_at=clock_timestamp()
      WHERE item_id=i.id AND step=p_step RETURNING * INTO v_step;
  END IF;
  i:=private.atlas_executor_external_refresh(i.id);
  RETURN (to_jsonb(v_step)-'request')||jsonb_build_object('item',to_jsonb(i)-'specification'-'decision_data');
END $$;

CREATE FUNCTION public.atlas_executor_external_get(p_item uuid,p_source_session uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE i public.atlas_execution_items;steps jsonb;
BEGIN
  SELECT * INTO i FROM public.atlas_execution_items WHERE id=p_item FOR UPDATE;PERFORM private.atlas_executor_external_check(i,p_source_session,true);
  IF NOT EXISTS(SELECT 1 FROM private.atlas_executor_external_approvals WHERE item_id=i.id) THEN RAISE insufficient_privilege USING MESSAGE='Aprovação externa não localizada.';END IF;
  i:=private.atlas_executor_external_refresh(i.id);
  SELECT coalesce(jsonb_agg(to_jsonb(s)-'request' ORDER BY s.reserved_at,s.step),'[]'::jsonb) INTO steps FROM private.atlas_executor_external_steps s WHERE item_id=i.id;
  RETURN jsonb_build_object('item',to_jsonb(i)-'specification'-'decision_data','steps',steps);
END $$;

REVOKE ALL ON FUNCTION private.atlas_executor_external_permission(public.atlas_execution_items,uuid),private.atlas_executor_external_validate(public.atlas_execution_items),
  private.atlas_executor_external_campaign_request(public.atlas_execution_items,text),
  private.atlas_executor_external_check(public.atlas_execution_items,uuid,boolean),private.atlas_executor_external_refresh(uuid),
  public.atlas_executor_external_approve(uuid,integer),public.atlas_executor_external_status(uuid),public.atlas_executor_external_reserve(uuid,uuid,text,jsonb),
  public.atlas_executor_external_finish(uuid,uuid,text,uuid,text,jsonb,jsonb),public.atlas_executor_external_get(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.atlas_executor_external_approve(uuid,integer),public.atlas_executor_external_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_executor_external_reserve(uuid,uuid,text,jsonb),public.atlas_executor_external_finish(uuid,uuid,text,uuid,text,jsonb,jsonb),public.atlas_executor_external_get(uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
