-- Structured editing keeps the existing knowledge row and text consumed by all readers.
BEGIN;

ALTER TABLE public.cliente_atend_ia_bases ADD COLUMN crm_ia_sections jsonb;

CREATE FUNCTION private.crm_ia_knowledge_text(p_sections jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE item jsonb;field_key text;field_label text;max_chars integer;field_text text;
 blocks text[]:='{}';parts text[]:='{}';context_text text;result text;
BEGIN
 IF jsonb_typeof(p_sections) IS DISTINCT FROM 'object' OR octet_length(p_sections::text)>300000
 THEN RAISE EXCEPTION 'Revise as seções da base de conhecimento.' USING ERRCODE='22023';END IF;
 IF ARRAY(SELECT jsonb_object_keys(p_sections) ORDER BY 1)<>ARRAY['company','context','faq','hours','policies']
  OR jsonb_typeof(p_sections->'company') IS DISTINCT FROM 'object'
  OR jsonb_typeof(p_sections->'hours') IS DISTINCT FROM 'array'
  OR jsonb_typeof(p_sections->'faq') IS DISTINCT FROM 'array'
  OR jsonb_typeof(p_sections->'policies') IS DISTINCT FROM 'array'
  OR jsonb_typeof(p_sections->'context') IS DISTINCT FROM 'string'
 THEN RAISE EXCEPTION 'Revise as seções da base de conhecimento.' USING ERRCODE='22023';END IF;
 IF ARRAY(SELECT jsonb_object_keys(p_sections->'company') ORDER BY 1)<>ARRAY['about','address','email','name','phone','sector','website']
  OR jsonb_array_length(p_sections->'hours')>30 OR jsonb_array_length(p_sections->'faq')>50 OR jsonb_array_length(p_sections->'policies')>30
 THEN RAISE EXCEPTION 'Revise os campos e a quantidade de itens da base.' USING ERRCODE='22023';END IF;
 FOR field_key,field_label,max_chars IN SELECT * FROM (VALUES
  ('name','Nome',120),('sector','Setor',120),('about','Sobre a empresa',8000),('phone','Telefone',50),
  ('email','E-mail',254),('address','Endereço',1000),('website','Site',2048)
 ) AS fields(key,label,maximum) LOOP
  IF jsonb_typeof(p_sections#>ARRAY['company',field_key]) IS DISTINCT FROM 'string'
   OR length(p_sections#>>ARRAY['company',field_key])>max_chars
  THEN RAISE EXCEPTION 'Revise o campo % da base.',field_label USING ERRCODE='22023';END IF;
  field_text:=p_sections#>>ARRAY['company',field_key];
  IF btrim(field_text,E' \t\r\n')<>'' THEN parts:=array_append(parts,field_label||': '||field_text);END IF;
 END LOOP;
 IF cardinality(parts)>0 THEN blocks:=array_append(blocks,'Empresa'||E'\n'||array_to_string(parts,E'\n'));END IF;
 parts:='{}';
 FOR item IN SELECT value FROM jsonb_array_elements(p_sections->'hours') LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Revise os horários da base.' USING ERRCODE='22023';END IF;
  IF ARRAY(SELECT jsonb_object_keys(item) ORDER BY 1)<>ARRAY['days','end','start']
   OR EXISTS(SELECT 1 FROM jsonb_each(item) f WHERE jsonb_typeof(f.value) IS DISTINCT FROM 'string')
   OR btrim(item->>'days',E' \t\r\n')='' OR length(item->>'days')>80
   OR item->>'start' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR item->>'end' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
   OR item->>'start'>=item->>'end'
  THEN RAISE EXCEPTION 'Revise os dias e horários da base.' USING ERRCODE='22023';END IF;
  parts:=array_append(parts,(item->>'days')||': '||(item->>'start')||'–'||(item->>'end'));
 END LOOP;
 IF cardinality(parts)>0 THEN blocks:=array_append(blocks,'Atendimento'||E'\n'||array_to_string(parts,E'\n'));END IF;
 parts:='{}';
 FOR item IN SELECT value FROM jsonb_array_elements(p_sections->'faq') LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Revise as perguntas da base.' USING ERRCODE='22023';END IF;
  IF ARRAY(SELECT jsonb_object_keys(item) ORDER BY 1)<>ARRAY['answer','question']
   OR EXISTS(SELECT 1 FROM jsonb_each(item) f WHERE jsonb_typeof(f.value) IS DISTINCT FROM 'string')
   OR btrim(item->>'question',E' \t\r\n')='' OR btrim(item->>'answer',E' \t\r\n')=''
   OR length(item->>'question')>300 OR length(item->>'answer')>4000
  THEN RAISE EXCEPTION 'Revise a pergunta e a resposta da base.' USING ERRCODE='22023';END IF;
  parts:=array_append(parts,'Pergunta: '||(item->>'question')||E'\nResposta: '||(item->>'answer'));
 END LOOP;
 IF cardinality(parts)>0 THEN blocks:=array_append(blocks,'Perguntas frequentes'||E'\n'||array_to_string(parts,E'\n\n'));END IF;
 parts:='{}';
 FOR item IN SELECT value FROM jsonb_array_elements(p_sections->'policies') LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Revise as políticas da base.' USING ERRCODE='22023';END IF;
  IF ARRAY(SELECT jsonb_object_keys(item) ORDER BY 1)<>ARRAY['content','title']
   OR EXISTS(SELECT 1 FROM jsonb_each(item) f WHERE jsonb_typeof(f.value) IS DISTINCT FROM 'string')
   OR btrim(item->>'title',E' \t\r\n')='' OR btrim(item->>'content',E' \t\r\n')=''
   OR length(item->>'title')>120 OR length(item->>'content')>4000
  THEN RAISE EXCEPTION 'Revise o título e a orientação da política da base.' USING ERRCODE='22023';END IF;
  parts:=array_append(parts,(item->>'title')||E'\n'||(item->>'content'));
 END LOOP;
 IF cardinality(parts)>0 THEN blocks:=array_append(blocks,'Políticas'||E'\n'||array_to_string(parts,E'\n\n'));END IF;
 context_text:=p_sections->>'context';
 IF cardinality(blocks)=0 THEN result:=context_text;
 ELSE
  IF context_text<>'' THEN blocks:=array_append(blocks,'Contexto adicional'||E'\n'||context_text);END IF;
  result:=array_to_string(blocks,E'\n\n');
 END IF;
 IF length(result)>30000 THEN RAISE EXCEPTION 'O conteúdo da base excede 30.000 caracteres.' USING ERRCODE='22023';END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION private.crm_ia_knowledge_text(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.crm_ia_knowledge_sync() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.crm_ia_sections IS NOT NULL THEN NEW.conteudo:=private.crm_ia_knowledge_text(NEW.crm_ia_sections);END IF;
 ELSIF NEW.crm_ia_sections IS DISTINCT FROM OLD.crm_ia_sections THEN
  IF NEW.crm_ia_sections IS NOT NULL THEN NEW.conteudo:=private.crm_ia_knowledge_text(NEW.crm_ia_sections);END IF;
 ELSIF NEW.conteudo IS DISTINCT FROM OLD.conteudo THEN
  NEW.crm_ia_sections:=NULL;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.crm_ia_knowledge_sync() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER cliente_atend_ia_bases_crm_knowledge BEFORE INSERT OR UPDATE OF conteudo,crm_ia_sections
 ON public.cliente_atend_ia_bases FOR EACH ROW EXECUTE FUNCTION private.crm_ia_knowledge_sync();

ALTER FUNCTION public.crm_ia_workspace(text,uuid,jsonb) RENAME TO crm_ia_workspace_pre_knowledge_sections;
CREATE FUNCTION public.crm_ia_workspace(p_action text,p_client_id uuid DEFAULT NULL,p_payload jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;content_text text;
BEGIN
 IF p_action IS DISTINCT FROM 'save_base' OR NOT coalesce(p_payload ? 'crm_ia_sections',false)
 THEN RETURN public.crm_ia_workspace_pre_knowledge_sections(p_action,p_client_id,p_payload);END IF;
 content_text:=private.crm_ia_knowledge_text(p_payload->'crm_ia_sections');
 result:=public.crm_ia_workspace_pre_knowledge_sections(p_action,p_client_id,(p_payload-'crm_ia_sections')||jsonb_build_object('conteudo',content_text));
 -- The delegated write already authorized and locked this exact base in this transaction.
 UPDATE public.cliente_atend_ia_bases SET crm_ia_sections=p_payload->'crm_ia_sections'
  WHERE id=(result->>'id')::uuid AND cliente_id=(result->>'cliente_id')::uuid
  RETURNING to_jsonb(cliente_atend_ia_bases) INTO result;
 IF result IS NULL THEN RAISE EXCEPTION 'Base de conhecimento indisponível.';END IF;
 RETURN result;
END $$;
DO $$
DECLARE owner_name text;owner_id oid;previous_acl aclitem[];grant_row record;role_name text;helper_signature text;
BEGIN
 SELECT proowner,pg_get_userbyid(proowner),coalesce(proacl,acldefault('f',proowner)) INTO owner_id,owner_name,previous_acl
  FROM pg_proc WHERE oid='public.crm_ia_workspace_pre_knowledge_sections(text,uuid,jsonb)'::regprocedure;
 EXECUTE format('ALTER FUNCTION public.crm_ia_workspace(text,uuid,jsonb) OWNER TO %I',owner_name);
 EXECUTE format('ALTER FUNCTION private.crm_ia_knowledge_text(jsonb) OWNER TO %I',owner_name);
 EXECUTE format('ALTER FUNCTION private.crm_ia_knowledge_sync() OWNER TO %I',owner_name);
 -- Inherit effective EXECUTE grants, including deployment default ACLs and grant options.
 FOR grant_row IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  WHERE p.oid='public.crm_ia_workspace(text,uuid,jsonb)'::regprocedure AND a.grantee<>owner_id LOOP
  role_name:=CASE WHEN grant_row.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(grant_row.grantee)) END;
  EXECUTE 'REVOKE ALL ON FUNCTION public.crm_ia_workspace(text,uuid,jsonb) FROM '||role_name||' CASCADE';
 END LOOP;
 FOR grant_row IN SELECT grantee,bool_or(is_grantable) AS grantable FROM aclexplode(previous_acl) WHERE privilege_type='EXECUTE' AND grantee<>owner_id GROUP BY grantee LOOP
  role_name:=CASE WHEN grant_row.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(grant_row.grantee)) END;
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.crm_ia_workspace(text,uuid,jsonb) TO '||role_name||CASE WHEN grant_row.grantable THEN ' WITH GRANT OPTION' ELSE '' END;
 END LOOP;
 FOR helper_signature IN SELECT * FROM (VALUES ('private.crm_ia_knowledge_text(jsonb)'),('private.crm_ia_knowledge_sync()'),('public.crm_ia_workspace_pre_knowledge_sections(text,uuid,jsonb)')) AS helpers(signature) LOOP
  FOR grant_row IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   WHERE p.oid=helper_signature::regprocedure AND a.grantee<>owner_id LOOP
   role_name:=CASE WHEN grant_row.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(grant_row.grantee)) END;
   EXECUTE 'REVOKE ALL ON FUNCTION '||helper_signature||' FROM '||role_name||' CASCADE';
  END LOOP;
 END LOOP;
END $$;

COMMIT;
NOTIFY pgrst,'reload schema';
