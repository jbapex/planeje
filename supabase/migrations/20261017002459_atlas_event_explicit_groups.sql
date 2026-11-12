-- Production: a shop WhatsApp channel is not an agency account-group binding.
BEGIN;
CREATE OR REPLACE FUNCTION private.atlas_event_client(p_conversation uuid) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE g public.atendimento_conversas; ids uuid[];
BEGIN
 SELECT * INTO g FROM public.atendimento_conversas WHERE id=p_conversation AND is_group AND NOT bloqueada AND archived_at IS NULL;
 IF g.id IS NULL THEN RETURN NULL; END IF;
 SELECT array_agg(id) INTO ids FROM public.clientes WHERE (
 entregaveis->'whatsapp_grupo'->>'conversation_id'=g.id::text OR
 (entregaveis->'whatsapp_grupo'->>'chat_jid'=g.chat_jid AND entregaveis->'whatsapp_grupo'->>'wa_cliente_id'=g.cliente_id::text));
 IF cardinality(ids)=1 THEN RETURN CASE WHEN EXISTS(SELECT 1 FROM public.clientes WHERE id=ids[1] AND etapa='closed') THEN ids[1] ELSE NULL END;ELSIF cardinality(ids)>1 THEN RETURN NULL;END IF;
 RETURN NULL;
END $$;

UPDATE public.atlas_event_groups g SET state='out_of_scope',client_id=NULL,coverage='{}',seen='{}',reason='Grupo sem vínculo explícito; fora da leitura da agência.' WHERE private.atlas_event_client(g.conversation_id) IS NULL AND g.client_id IS NOT NULL;
NOTIFY pgrst,'reload schema';
COMMIT;
