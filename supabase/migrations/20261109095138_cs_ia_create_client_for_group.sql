BEGIN;

CREATE FUNCTION public.cs_ia_create_client_for_group(p_client_id uuid, p_conversation_id uuid, p_wa_client_id uuid,
  p_channel_id uuid, p_group_jid text, p_client jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  allowed_fields constant text[] := ARRAY['empresa', 'nome_contato', 'cnpj_cpf', 'email', 'telefone', 'estado', 'cidade',
    'responsavel', 'tipo_contrato', 'produtos_servicos', 'instagram', 'publico_alvo', 'tom_de_voz', 'vencimento',
    'inicio_na_base', 'dia_cobranca', 'cobranca_parcelada', 'dia_cobranca_2', 'valor', 'avaliacao_treinamento', 'etiquetas',
    'nicho', 'instagram_password', 'logo_urls', 'sobre_empresa', 'objetivo_meta', 'meta_custo_mensagem', 'meta_custo_compra',
    'roas_alvo', 'tipo_servico', 'postagem_do_cliente', 'entregaveis', 'client_document'];
  company text := regexp_replace(p_client->>'empresa', '^[[:space:]]+|[[:space:]]+$', '', 'g');
  deliverable_fields constant text[] := ARRAY['carrosseis', 'posts', 'stories', 'videos', 'anuncios'];
  service_type text := coalesce(nullif(p_client->>'tipo_servico', ''), 'execucao_completa');
  deliverables jsonb := coalesce(nullif(p_client->'entregaveis', 'null'::jsonb), '{}'::jsonb);
  payload jsonb;
  fields text;
  dropped text[];
  saved_id uuid;
BEGIN
  IF coalesce(private.cs_ia_role(), '') NOT IN ('admin', 'superadmin') THEN
    RAISE insufficient_privilege USING MESSAGE = 'Sem acesso para criar clientes a partir de grupos.';
  END IF;
  IF p_client_id IS NULL OR jsonb_typeof(p_client) IS DISTINCT FROM 'object' OR company IS NULL OR company = ''
    OR jsonb_typeof(deliverables) <> 'object' OR service_type NOT IN (
      'so_midia', 'so_trafego', 'trafego_e_midia', 'execucao_completa', 'execucao_parcial', 'apenas_consultoria') THEN
    RAISE invalid_parameter_value USING MESSAGE = 'Confira os dados do novo cliente.';
  END IF;
  SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb) INTO deliverables FROM jsonb_each(deliverables)
  WHERE key = ANY(deliverable_fields) AND CASE WHEN jsonb_typeof(value) = 'number' THEN (value #>> '{}')::numeric >= 0 ELSE false END;
  IF service_type <> 'apenas_consultoria' AND (SELECT coalesce(sum((value #>> '{}')::numeric), 0) FROM jsonb_each(deliverables)) <= 0 THEN
    RAISE invalid_parameter_value USING MESSAGE = 'Informe pelo menos um entregável maior que zero.';
  END IF;
  IF NOT private.cs_ia_group_label_editable(p_conversation_id, p_wa_client_id, p_channel_id, p_group_jid) THEN
    RAISE insufficient_privilege USING MESSAGE = 'Grupo indisponível neste canal.';
  END IF;

  SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) INTO payload
  FROM jsonb_each(p_client) e WHERE e.key = ANY(allowed_fields);
  payload := payload || jsonb_build_object('id', p_client_id, 'owner_id', auth.uid(), 'etapa', 'closed', 'empresa', company,
    'tipo_servico', service_type, 'responsavel', nullif(p_client->>'responsavel', ''), 'entregaveis', deliverables);
  -- Só os campos do formulário que existem na versão do cadastro entram no INSERT.
  SELECT string_agg(format('%I', e.key), ',' ORDER BY e.key) FILTER (WHERE a.attname IS NOT NULL),
    coalesce(array_agg(e.key ORDER BY e.key) FILTER (WHERE a.attname IS NULL), ARRAY[]::text[])
  INTO fields, dropped
  FROM jsonb_object_keys(payload) e(key) LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid = 'public.clientes'::regclass
    AND a.attname::text = e.key AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = '';

  EXECUTE format('INSERT INTO public.clientes (%1$s) SELECT %1$s FROM jsonb_populate_record(NULL::public.clientes, $1)
    ON CONFLICT (id) DO NOTHING RETURNING id', fields) INTO saved_id USING payload;
  IF saved_id IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.clientes c JOIN public.cliente_whatsapp_grupo l ON l.cliente_id = c.id
      WHERE c.id = p_client_id AND c.owner_id = auth.uid() AND c.etapa = 'closed' AND l.conversation_id = p_conversation_id
        AND l.wa_cliente_id = p_wa_client_id AND l.chat_jid = p_group_jid) THEN
      RAISE serialization_failure USING MESSAGE = 'Este cadastro mudou. Volte a Grupos e confira o vínculo.';
    END IF;
  ELSE
    PERFORM public.cs_ia_set_group_binding(saved_id, p_conversation_id, p_wa_client_id, p_channel_id, p_group_jid,
      public.cs_ia_group_binding(saved_id)->>'version');
    IF NOT private.cs_ia_group_label_editable(p_conversation_id, p_wa_client_id, p_channel_id, p_group_jid) THEN
      RAISE insufficient_privilege USING MESSAGE = 'Grupo indisponível neste canal.';
    END IF;
  END IF;
  RETURN jsonb_build_object('id', p_client_id, 'dropped', dropped);
END;
$$;

REVOKE ALL ON FUNCTION public.cs_ia_create_client_for_group(uuid, uuid, uuid, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cs_ia_create_client_for_group(uuid, uuid, uuid, uuid, text, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
