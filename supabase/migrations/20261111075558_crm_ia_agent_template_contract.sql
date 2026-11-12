BEGIN;
-- One contract for new agent writes and template copies. This function never writes source configuration.
CREATE FUNCTION private.crm_ia_agent_schedule_config(p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE source jsonb:=coalesce(p_data,'{}');result jsonb:='{}';key text;legacy text;value jsonb;part jsonb;reminders jsonb;number numeric;minimum numeric;maximum numeric;
BEGIN
  IF source='null'::jsonb THEN RETURN '{}'; END IF;
  IF jsonb_typeof(source)<>'object' THEN RAISE EXCEPTION 'Configuração de agendamento inválida.' USING ERRCODE='22023'; END IF;
  FOR key,legacy IN SELECT * FROM (VALUES('title','assunto'),('instructions','instrucoes'),('max_future_days','horizon_days'),('daily_limit','max_per_day')) aliases(canonical,legacy_key) LOOP
    IF NOT source ? key AND source ? legacy THEN source:=source||jsonb_build_object(key,source->legacy); END IF;
  END LOOP;
  IF NOT source ? 'location_type' AND NOT source ? 'location' AND source ? 'local' AND source->'local'<>'null'::jsonb THEN
    source:=source||jsonb_build_object(CASE WHEN source->>'local' IN ('','presencial','online','telefone') THEN 'location_type' ELSE 'location' END,source->'local');
  END IF;
  FOR key,value IN SELECT k,v FROM jsonb_each(source) e(k,v) WHERE k IN ('title','instructions','location_type','location','duration_minutes','interval_minutes',
    'buffer_before','buffer_after','min_notice_hours','max_future_days','daily_limit','reminders') LOOP
    IF value='null'::jsonb AND key<>'reminders' THEN result:=result||jsonb_build_object(key,value);CONTINUE; END IF;
    IF key IN ('title','instructions','location_type','location') THEN
      IF jsonb_typeof(value)<>'string' OR length(value#>>'{}')>(CASE key WHEN 'title' THEN 200 WHEN 'instructions' THEN 4000 WHEN 'location' THEN 500 ELSE 20 END)
        OR (key='location_type' AND value#>>'{}' NOT IN ('','presencial','online','telefone')) THEN RAISE EXCEPTION 'Texto ou local do agendamento inválido.' USING ERRCODE='22023'; END IF;
    ELSIF key='reminders' THEN
      IF jsonb_typeof(value)<>'array' THEN RAISE EXCEPTION 'Os lembretes do agendamento devem ser uma lista.' USING ERRCODE='22023'; END IF;
      reminders:='[]';
      FOR part IN SELECT x FROM jsonb_array_elements(value) a(x) LOOP
        IF jsonb_typeof(part)<>'object' OR jsonb_typeof(part->'valor') IS DISTINCT FROM 'number' OR jsonb_typeof(part->'unidade') IS DISTINCT FROM 'string'
          OR part->>'unidade' NOT IN ('horas','dias') THEN RAISE EXCEPTION 'Lembrete do agendamento inválido.' USING ERRCODE='22023'; END IF;
        number:=(part->>'valor')::numeric;
        IF number<=0 OR number*(CASE WHEN part->>'unidade'='dias' THEN 24 ELSE 1 END)>8760 THEN RAISE EXCEPTION 'Antecedência do lembrete do agendamento inválida.' USING ERRCODE='22023'; END IF;
        reminders:=reminders||jsonb_build_array(jsonb_build_object('valor',part->'valor','unidade',part->'unidade'));
      END LOOP;
      value:=reminders;
    ELSE
      IF jsonb_typeof(value)<>'number' THEN RAISE EXCEPTION 'Parâmetro numérico do agendamento inválido.' USING ERRCODE='22023'; END IF;
      number:=(value#>>'{}')::numeric;
      minimum:=CASE WHEN key IN ('duration_minutes','interval_minutes') THEN 5 WHEN key IN ('max_future_days','daily_limit') THEN 1 ELSE 0 END;
      maximum:=CASE WHEN key IN ('buffer_before','buffer_after') THEN 240 WHEN key='max_future_days' THEN 366 WHEN key='daily_limit' THEN 200 ELSE 720 END;
      IF number<minimum OR number>maximum OR (key<>'min_notice_hours' AND number<>trunc(number)) THEN RAISE EXCEPTION 'Disponibilidade do agendamento inválida: %.',key USING ERRCODE='22023'; END IF;
    END IF;
    result:=result||jsonb_build_object(key,value);
  END LOOP;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION private.crm_ia_agent_schedule_config(jsonb) FROM PUBLIC,anon,authenticated;

-- Validate before both the legacy save and its voice update; do not change NEW, timestamps, ACL or proof.
CREATE FUNCTION private.crm_ia_agent_schedule_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF jsonb_typeof(NEW.funil->'crm_ia')='object' THEN PERFORM private.crm_ia_agent_schedule_config(NEW.funil#>'{crm_ia,agendamento}'); END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.crm_ia_agent_schedule_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER crm_ia_agent_schedule_guard BEFORE INSERT OR UPDATE OF funil ON public.cliente_atend_ia_agentes
  FOR EACH ROW EXECUTE FUNCTION private.crm_ia_agent_schedule_guard();

-- Keep the function OID, owner and existing caller grants. Existing agents/templates are never rewritten.
CREATE OR REPLACE FUNCTION private.crm_ia_template(p_type text,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE result jsonb;rules jsonb;source jsonb;key text;part jsonb;items jsonb;audio jsonb;destination jsonb;
BEGIN
  IF p_type='base' THEN
    RETURN jsonb_build_object('nome',left(coalesce(p_data->>'nome','Base do modelo'),80),'conteudo',left(coalesce(p_data->>'conteudo',''),30000));
  ELSIF p_type='pipeline' THEN
    SELECT jsonb_build_object('nome',left(coalesce(p_data->>'nome','Funil do modelo'),100),'stages',coalesce(jsonb_agg(jsonb_build_object(
      'nome',left(value->>'nome',100),'color',coalesce(value->>'color','#6366f1'),'tipo',coalesce(value->>'tipo','intermediaria'),
      'ordem',ordinality-1,'icon',value->>'icon') ORDER BY ordinality),'[]')) INTO result
      FROM jsonb_array_elements(coalesce(p_data->'stages','[]')) WITH ORDINALITY;
    IF jsonb_array_length(result->'stages') NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'O modelo precisa de 1 a 30 etapas.'; END IF;
    RETURN result;
  ELSIF p_type='agent' THEN
    source:=coalesce(p_data#>'{funil,crm_ia}','{}');
    IF jsonb_typeof(source)<>'object' OR coalesce(source->>'tipo','qualificacao') NOT IN ('qualificacao','followup','agendamento') THEN RAISE EXCEPTION 'Tipo de agente do modelo inválido.'; END IF;
    FOR key IN SELECT unnest(ARRAY['idiomas','variaveis','gatilhos','janelas','cadencia']) LOOP
      IF source ? key AND jsonb_typeof(source->key)<>'array' THEN RAISE EXCEPTION 'Lista do modelo de agente inválida: %.',key; END IF;
    END LOOP;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(source->'idiomas','[]')) x WHERE jsonb_typeof(x)<>'string')
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(source->'gatilhos','[]')) x WHERE jsonb_typeof(x)<>'string') THEN RAISE EXCEPTION 'Idiomas ou gatilhos do modelo inválidos.'; END IF;
    audio:=private.crm_ia_voice_config(source->'audio')||'{"enabled":false,"input_enabled":false}'::jsonb;
    destination:=jsonb_build_object('tipo',CASE WHEN source#>>'{destino,tipo}'='encerrar' THEN 'encerrar' ELSE 'humano' END);
    IF coalesce(source->'destino','{}') ? 'message' THEN
      IF jsonb_typeof(source#>'{destino,message}') NOT IN ('string','null') OR length(source#>>'{destino,message}')>4000 THEN RAISE EXCEPTION 'Mensagem de destino do modelo inválida.'; END IF;
      destination:=destination||jsonb_build_object('message',source#>'{destino,message}');
    END IF;
    rules:=jsonb_build_object('tipo',coalesce(source->>'tipo','qualificacao'),'pipeline_id',NULL,'stage_ids','[]'::jsonb,
      'idiomas',coalesce(source->'idiomas','["pt-BR"]'),'audio',audio,'gatilhos',coalesce(source->'gatilhos','[]'),'destino',destination,
      'agendamento',private.crm_ia_agent_schedule_config(source->'agendamento'));
    items:='[]';
    FOR part IN SELECT value FROM jsonb_array_elements(coalesce(source->'variaveis','[]')) LOOP
      IF jsonb_typeof(part)<>'object' OR (part ? 'nome' AND jsonb_typeof(part->'nome') NOT IN ('string','null'))
        OR (part ? 'pergunta' AND jsonb_typeof(part->'pergunta') NOT IN ('string','null')) THEN RAISE EXCEPTION 'Variável do modelo inválida.'; END IF;
      items:=items||jsonb_build_array(jsonb_build_object('nome',part->'nome','pergunta',part->'pergunta'));
    END LOOP;
    rules:=rules||jsonb_build_object('variaveis',items);
    items:='[]';
    FOR part IN SELECT value FROM jsonb_array_elements(coalesce(source->'janelas','[]')) LOOP
      IF jsonb_typeof(part)<>'object' OR jsonb_typeof(part->'dias') IS DISTINCT FROM 'array' OR jsonb_typeof(part->'inicio') IS DISTINCT FROM 'string' OR jsonb_typeof(part->'fim') IS DISTINCT FROM 'string'
        OR EXISTS(SELECT 1 FROM jsonb_array_elements(part->'dias') d WHERE jsonb_typeof(d)<>'number' OR (d#>>'{}')::numeric NOT BETWEEN 0 AND 6 OR (d#>>'{}')::numeric<>trunc((d#>>'{}')::numeric)) THEN RAISE EXCEPTION 'Janela do modelo inválida.'; END IF;
      items:=items||jsonb_build_array(jsonb_build_object('dias',part->'dias','inicio',part->'inicio','fim',part->'fim'));
    END LOOP;
    rules:=rules||jsonb_build_object('janelas',items);
    items:=private.crm_ia_agent_schedule_config(jsonb_build_object('reminders',coalesce(source->'cadencia','[]')))->'reminders';
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(items) x WHERE (x->>'valor')::numeric>365) THEN RAISE EXCEPTION 'Cadência do modelo inválida.'; END IF;
    rules:=rules||jsonb_build_object('cadencia',items);
    IF source ? 'mensagem_fora_horario' THEN
      IF jsonb_typeof(source->'mensagem_fora_horario') NOT IN ('string','null') OR length(source->>'mensagem_fora_horario')>4000 THEN RAISE EXCEPTION 'Mensagem fora do horário inválida.'; END IF;
      rules:=rules||jsonb_build_object('mensagem_fora_horario',source->'mensagem_fora_horario');
    END IF;
    IF source ? 'desinteresse' THEN
      IF jsonb_typeof(source->'desinteresse') NOT IN ('string','null') OR source->>'desinteresse' NOT IN ('humano','encerrar') THEN RAISE EXCEPTION 'Regra de desinteresse inválida.'; END IF;
      rules:=rules||jsonb_build_object('desinteresse',source->'desinteresse');
    END IF;
    IF jsonb_array_length(rules->'variaveis')>30 OR jsonb_array_length(rules->'cadencia')>10 OR length(rules::text)>30000 THEN RAISE EXCEPTION 'Configuração do modelo de agente excede o limite.'; END IF;
    RETURN jsonb_build_object('nome',left(coalesce(p_data->>'nome','Agente do modelo'),60),'objetivo',left(coalesce(p_data->>'objetivo',''),500),
      'instrucoes',left(coalesce(p_data->>'instrucoes',''),8000),'tom',coalesce(p_data->>'tom','cordial'),'modelo',coalesce(p_data->>'modelo','openai/gpt-4o-mini'),
      'ativo',false,'auto_responder',false,'base_ids','[]'::jsonb,'funil',jsonb_build_object('crm_ia',rules));
  END IF;
  RAISE EXCEPTION 'Tipo de modelo inválido.';
END $$;
REVOKE ALL ON FUNCTION private.crm_ia_template(text,jsonb) FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
