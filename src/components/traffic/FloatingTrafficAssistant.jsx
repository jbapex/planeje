import React, { useState, useEffect } from 'react';
import { Bot } from 'lucide-react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import TrafficChatDrawer from './TrafficChatDrawer';
import { supabase } from '@/lib/customSupabaseClient';

const FloatingTrafficAssistant = () => {
  const [campaigns, setCampaigns] = useState([]);
  const [metaConnectionStatus, setMetaConnectionStatus] = useState('disconnected');
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Verifica se o assistente deve estar aberto baseado na URL
  const conversationId = searchParams.get('assistant');
  const showChat = !!conversationId || searchParams.get('assistant') === 'new';

  // Só mostra na página de Gestão de Tráfego
  // Suporta tanto HashRouter quanto BrowserRouter
  const path = location.pathname || window.location.hash.replace('#', '');
  const isTrafficPage = path.includes('/paid-traffic') || path === '/paid-traffic';

  // Buscar campanhas
  useEffect(() => {
    if (!isTrafficPage) return;

    const fetchCampaigns = async () => {
      try {
        const { data: campaignsData, error: campaignsError } = await supabase
          .from('paid_campaigns')
          .select('*, clientes(id, empresa), profiles!assignee_id(id, full_name, avatar_url)')
          .order('created_at', { ascending: false })
          .limit(100);
        
        if (campaignsError) throw campaignsError;
        setCampaigns(campaignsData || []);
      } catch (error) {
        console.error('Erro ao buscar campanhas:', error);
      }
    };

    // Verificar conexão Meta
    const checkConnection = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('meta-ads-api', {
          body: { action: 'check-connection' },
        });
        if (!error && data?.connected) {
          setMetaConnectionStatus('connected');
        } else {
          setMetaConnectionStatus('disconnected');
        }
      } catch (error) {
        setMetaConnectionStatus('disconnected');
      }
    };

    fetchCampaigns();
    checkConnection();
  }, [isTrafficPage]);

  if (!isTrafficPage) return null;

  return (
    <>
      <AnimatePresence>
        {!showChat && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            className="fixed bottom-6 right-6 z-50"
          >
            <motion.div
              animate={{
                scale: [1, 1.1, 1],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <Button
                onClick={() => {
                  // Abre o assistente adicionando query param
                  const newParams = new URLSearchParams(searchParams);
                  newParams.set('assistant', 'new');
                  setSearchParams(newParams);
                }}
                size="lg"
                className="h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 bg-primary hover:bg-primary/90 relative flex items-center justify-center p-0"
                aria-label="Abrir Assistente de Tráfego"
              >
                <Bot className="h-7 w-7 text-primary-foreground flex-shrink-0" strokeWidth={2} />
                {/* Indicador de notificação (opcional) */}
                <motion.span
                  className="absolute -top-1 -right-1 h-3 w-3 bg-green-500 rounded-full border-2 border-background"
                  animate={{
                    scale: [1, 1.2, 1],
                    opacity: [1, 0.7, 1],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <TrafficChatDrawer
        open={showChat}
        onOpenChange={(open) => {
          // Remove query param quando fechar
          if (!open) {
            const newParams = new URLSearchParams(searchParams);
            newParams.delete('assistant');
            setSearchParams(newParams, { replace: true });
          }
        }}
        campaigns={campaigns}
        metaConnectionStatus={metaConnectionStatus}
        conversationId={conversationId && conversationId !== 'new' ? conversationId : null}
      />
    </>
  );
};

export default FloatingTrafficAssistant;
