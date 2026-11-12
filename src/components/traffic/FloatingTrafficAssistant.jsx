import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Bot } from 'lucide-react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import TrafficChatDrawer from './TrafficChatDrawer';
import { supabase } from '@/lib/customSupabaseClient';

const FloatingTrafficAssistant = () => {
  const [metaConnectionStatus, setMetaConnectionStatus] = useState('disconnected');
  const [dockOpen, setDockOpen] = useState(false);
  const [routineClientName, setRoutineClientName] = useState('');
  const [sheetRows, setSheetRows] = useState([]);
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const conversationId = searchParams.get('assistant');
  // Estado local: a Rotina regrava a URL e antes apagava ?assistant=
  const showChat = dockOpen || (!!conversationId && conversationId.length > 0);

  const path = location.pathname || window.location.hash.replace('#', '');
  const isTrafficPage = path.includes('/paid-traffic') || path === '/paid-traffic';

  useEffect(() => {
    if (conversationId) setDockOpen(true);
  }, [conversationId]);

  const routineClientId = searchParams.get('cliente') || '';
  const routineWeek = searchParams.get('semana') || '';
  const onRoutine = path.includes('/paid-traffic/rotina');
  const routineContext = onRoutine && routineClientId
    ? { clientId: routineClientId, weekStart: routineWeek, clientName: routineClientName, resultLabel: 'Agendamentos', sheetRows }
    : null;

  useEffect(() => {
    setSheetRows([]);
    const onSheet = (event) => {
      const detail = event.detail || {};
      if (detail.clientId !== routineClientId || detail.weekStart !== routineWeek) return;
      setSheetRows(Array.isArray(detail.rows) ? detail.rows : []);
    };
    window.addEventListener('planeje-routine-sheet', onSheet);
    return () => window.removeEventListener('planeje-routine-sheet', onSheet);
  }, [routineClientId, routineWeek]);

  useEffect(() => {
    if (!onRoutine || !routineClientId) {
      setRoutineClientName('');
      return undefined;
    }
    let cancelled = false;
    supabase.from('clientes').select('empresa').eq('id', routineClientId).maybeSingle()
      .then(({ data }) => { if (!cancelled) setRoutineClientName(data?.empresa || ''); })
      .catch(() => { if (!cancelled) setRoutineClientName(''); });
    return () => { cancelled = true; };
  }, [onRoutine, routineClientId]);

  useEffect(() => {
    if (!isTrafficPage) return;

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

    checkConnection();
  }, [isTrafficPage]);

  if (!isTrafficPage) return null;

  const openAssistant = () => {
    setDockOpen(true);
    const newParams = new URLSearchParams(searchParams);
    if (!newParams.get('assistant')) newParams.set('assistant', 'new');
    setSearchParams(newParams, { replace: true });
  };

  const closeAssistant = () => {
    setDockOpen(false);
    if (searchParams.has('assistant')) {
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('assistant');
      setSearchParams(newParams, { replace: true });
    }
  };

  const fab = (
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
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Button
              onClick={openAssistant}
              size="lg"
              className="h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 bg-primary hover:bg-primary/90 relative flex items-center justify-center p-0"
              aria-label="Abrir Assistente de Tráfego"
            >
              <Bot className="h-7 w-7 text-primary-foreground flex-shrink-0" strokeWidth={2} />
              <motion.span
                className="absolute -top-1 -right-1 h-3 w-3 bg-green-500 rounded-full border-2 border-background"
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [1, 0.7, 1],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      {typeof document !== 'undefined' ? createPortal(fab, document.body) : null}
      {showChat ? (
        <TrafficChatDrawer
          open={showChat}
          onOpenChange={(open) => {
            if (!open) closeAssistant();
          }}
          campaigns={[]}
          metaConnectionStatus={metaConnectionStatus}
          conversationId={conversationId && conversationId !== 'new' ? conversationId : null}
          routineContext={routineContext}
        />
      ) : null}
    </>
  );
};

export default FloatingTrafficAssistant;
