BEGIN;
ALTER TABLE public.traffic_weekly_settings
  ADD COLUMN IF NOT EXISTS sheet_metrics jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.traffic_weekly_settings
  DROP CONSTRAINT IF EXISTS traffic_weekly_settings_sheet_metrics_array;
ALTER TABLE public.traffic_weekly_settings
  ADD CONSTRAINT traffic_weekly_settings_sheet_metrics_array CHECK(jsonb_typeof(sheet_metrics)='array');

CREATE OR REPLACE FUNCTION planeje_private.traffic_routine_campaign_metrics(p_client uuid,p_rows jsonb,p_finalize boolean,p_context_only boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE row jsonb; account jsonb; out_rows jsonb:='[]'; identity text; seen text[]:='{}'; ids uuid[]:='{}'; row_id uuid; val numeric; field text; v_label text; v_metrics jsonb;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)>50 THEN RAISE EXCEPTION 'Confira os dados das campanhas (até 50 por revisão).'; END IF;
  SELECT result_label, sheet_metrics INTO v_label, v_metrics FROM public.traffic_weekly_settings WHERE client_id=p_client;
  v_label:=coalesce(nullif(btrim(v_label),''),'Agendamentos');
  v_metrics:=coalesce(v_metrics,'[]'::jsonb);
  FOR row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    IF jsonb_typeof(row)<>'object' THEN RAISE EXCEPTION 'Campanha inválida.'; END IF;
    row_id:=nullif(row->>'id','')::uuid;
    IF row_id IS NULL OR row_id=ANY(ids) THEN RAISE EXCEPTION 'Identificador da linha ausente ou duplicado.'; END IF;
    ids:=array_append(ids,row_id);
    IF nullif(row->>'account_link_id','') IS NOT NULL THEN
      SELECT a INTO account FROM jsonb_array_elements(planeje_private.traffic_routine_accounts(p_client)) a WHERE a->>'id'=row->>'account_link_id';
      IF account IS NULL THEN RAISE EXCEPTION 'Escolha uma conta ativa deste cliente ou registre a conta manualmente.'; END IF;
      row:=row||account||jsonb_build_object('id',row_id,'account_link_id',account->>'id','account_name',coalesce(nullif(account->>'account_name',''),account->>'account_id'));
    ELSE
      IF coalesce(row->>'platform','') NOT IN ('meta','google','other') OR nullif(btrim(row->>'account_id'),'') IS NULL
        OR nullif(btrim(row->>'account_name'),'') IS NULL THEN RAISE EXCEPTION 'Informe plataforma, nome e ID da conta de anúncios.'; END IF;
    END IF;
    IF nullif(btrim(row->>'conversion_label'),'') IS NULL THEN row:=jsonb_set(row,'{conversion_label}',to_jsonb(v_label)); END IF;
    IF nullif(btrim(row->>'campaign_name'),'') IS NULL OR (NOT p_context_only AND nullif(btrim(row->>'conversion_label'),'') IS NULL) THEN RAISE EXCEPTION 'Informe campanha e o resultado que esta conta acompanha.'; END IF;
    FOREACH field IN ARRAY ARRAY['account_id','account_name','campaign_id','campaign_name','conversion_label','adset_id','adset_name'] LOOP
      IF length(coalesce(row->>field,''))>200 THEN RAISE EXCEPTION 'Nome ou identificador da campanha muito longo.'; END IF;
    END LOOP;
    identity:=lower(btrim(row->>'platform'))||':'||lower(btrim(row->>'account_id'))||':'||lower(btrim(coalesce(nullif(row->>'campaign_id',''),row->>'campaign_name')));
    identity:=identity||':'||lower(btrim(coalesce(nullif(row->>'adset_id',''),row->>'adset_name','')));
    IF identity=ANY(seen) THEN RAISE EXCEPTION 'Esta campanha já foi incluída na revisão. Não repita o investimento.'; END IF;
    seen:=array_append(seen,identity);
    FOREACH field IN ARRAY ARRAY['spend','conversions','calls','daily_budget','cpc','messages','appointments','target_message_cost','conversion_value'] LOOP
      val:=CASE WHEN p_context_only THEN NULL ELSE nullif(row->>field,'')::numeric END;
      IF val<0 OR val>999999999999.99 OR val::text IN ('NaN','Infinity','-Infinity') OR (field IN ('calls','messages','appointments') AND val<>trunc(val)) THEN RAISE EXCEPTION 'Confira os números da campanha.'; END IF;
      IF p_finalize AND NOT p_context_only AND field='spend' AND val IS NULL THEN RAISE EXCEPTION 'Confira o gasto de cada campanha. Zero significa conferido.'; END IF;
      IF p_finalize AND NOT p_context_only AND field IN ('messages','appointments','conversions','calls') AND v_metrics ? field AND val IS NULL THEN RAISE EXCEPTION 'Confira os resultados visíveis desta planilha. Zero significa conferido.'; END IF;
      row:=jsonb_set(row,ARRAY[field],coalesce(to_jsonb(val),'null'::jsonb));
    END LOOP;
    out_rows:=out_rows||jsonb_build_array(jsonb_build_object('id',row_id,'platform',btrim(row->>'platform'),'account_link_id',nullif(row->>'account_link_id',''),
      'account_id',btrim(row->>'account_id'),'account_name',btrim(row->>'account_name'),'campaign_id',btrim(coalesce(row->>'campaign_id','')),
      'campaign_name',btrim(row->>'campaign_name'),'conversion_label',btrim(row->>'conversion_label'),
      'adset_id',btrim(coalesce(row->>'adset_id','')),'adset_name',btrim(coalesce(row->>'adset_name','')),
      'messages',row->'messages','appointments',row->'appointments','target_message_cost',row->'target_message_cost','conversion_value',row->'conversion_value',
      'spend',row->'spend','conversions',row->'conversions','calls',row->'calls','daily_budget',row->'daily_budget','cpc',row->'cpc'));
  END LOOP;
  IF p_finalize AND jsonb_array_length(out_rows)=0 THEN RAISE EXCEPTION 'Adicione pelo menos uma campanha, ou use o resumo do cliente.'; END IF;
  RETURN out_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_traffic_sheet_metrics(p_client uuid, p_sheet_metrics jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE allowed text[] := ARRAY['spend','messages','appointments','conversions','calls','conversion_value','daily_budget','target_message_cost','cpc'];
DECLARE item text; cleaned jsonb := '[]'::jsonb;
BEGIN
  IF NOT planeje_private.traffic_weekly_manager() THEN RAISE insufficient_privilege USING MESSAGE='Somente gestores podem configurar a planilha do cliente.'; END IF;
  IF p_sheet_metrics IS NULL OR jsonb_typeof(p_sheet_metrics)<>'array' OR jsonb_array_length(p_sheet_metrics)>12 THEN
    RAISE EXCEPTION 'Confira as colunas da planilha deste cliente.';
  END IF;
  FOR item IN SELECT jsonb_array_elements_text(p_sheet_metrics) LOOP
    IF item=ANY(allowed) AND NOT cleaned ? item THEN cleaned:=cleaned||to_jsonb(item); END IF;
  END LOOP;
  IF jsonb_array_length(cleaned)>0 AND NOT cleaned ? 'spend' THEN cleaned:=jsonb_build_array('spend')||cleaned; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('traffic-weekly-settings:'||p_client::text,0));
  UPDATE public.traffic_weekly_settings SET sheet_metrics=cleaned, updated_at=now() WHERE client_id=p_client;
  IF NOT FOUND THEN RAISE EXCEPTION 'Configure a rotina deste cliente antes de escolher as colunas.'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.save_traffic_sheet_metrics(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_traffic_sheet_metrics(uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
