-- Habilita Realtime para a tabela paid_campaigns
-- Isso permite que mudanças de status e outras atualizações sejam propagadas em tempo real para todos os usuários
ALTER PUBLICATION supabase_realtime ADD TABLE paid_campaigns;

COMMENT ON TABLE paid_campaigns IS 'Tabela de campanhas de tráfego pago - Realtime habilitado para atualizações em tempo real';

