import React, { useState, useEffect, useCallback } from 'react';
    import { motion } from 'framer-motion';
    import { ArrowLeft, Save, Bot } from 'lucide-react';
    import { useNavigate } from 'react-router-dom';
    import { supabase } from '@/lib/customSupabaseClient';
    import { useToast } from '@/components/ui/use-toast';
    import { Button } from '@/components/ui/button';
    import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
    import { Input } from '@/components/ui/input';
    import { Label } from '@/components/ui/label';

    const ChatLimitsManager = () => {
      const navigate = useNavigate();
      const { toast } = useToast();
      const [clients, setClients] = useState([]);
      const [loading, setLoading] = useState(true);
      const [saving, setSaving] = useState({});

      const fetchClients = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
          .from('clientes')
          .select('id, empresa, max_chat_sessions, daily_chat_limit')
          .order('empresa', { ascending: true });

        if (error) {
          toast({ title: "Erro ao buscar clientes", description: error.message, variant: "destructive" });
        } else {
          setClients(data.map(c => ({
            ...c,
            max_chat_sessions: c.max_chat_sessions === null ? '' : c.max_chat_sessions,
            daily_chat_limit: c.daily_chat_limit === null ? '' : c.daily_chat_limit,
          })));
        }
        setLoading(false);
      }, [toast]);

      useEffect(() => {
        fetchClients();
      }, [fetchClients]);

      const handleInputChange = (clientId, field, value) => {
        const numericValue = value === '' ? '' : parseInt(value, 10);
        if (value === '' || (!isNaN(numericValue) && numericValue >= 0)) {
          setClients(clients.map(c => c.id === clientId ? { ...c, [field]: value } : c));
        }
      };

      const handleSave = async (clientId) => {
        setSaving(prev => ({...prev, [clientId]: true}));
        const client = clients.find(c => c.id === clientId);
        if (!client) return;

        const { error } = await supabase
          .from('clientes')
          .update({
            max_chat_sessions: client.max_chat_sessions === '' ? null : client.max_chat_sessions,
            daily_chat_limit: client.daily_chat_limit === '' ? null : client.daily_chat_limit,
          })
          .eq('id', clientId);
        
        if (error) {
          toast({ title: "Erro ao salvar limites", description: error.message, variant: "destructive" });
        } else {
          toast({ title: "Limites salvos!", description: `Os limites para ${client.empresa} foram atualizados.` });
        }
        setSaving(prev => ({...prev, [clientId]: false}));
      };

      return (
        <div className="space-y-6 max-w-4xl mx-auto p-4 sm:p-0">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/super-admin')}>
              <ArrowLeft className="text-gray-700 dark:text-gray-300" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Limites do Chat IA</h1>
              <p className="text-gray-500 dark:text-gray-400">Controle o uso do ApexIA por cliente. Deixe em branco para ilimitado.</p>
            </div>
          </div>

          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="dark:text-white">Configuração por Cliente</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? <p className="dark:text-gray-300">Carregando clientes...</p> : (
                <div className="space-y-4">
                  {clients.map(client => (
                    <motion.div
                      key={client.id}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 border rounded-lg dark:border-gray-700"
                    >
                      <h3 className="font-semibold text-lg mb-4 dark:text-white">{client.empresa}</h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                        <div className="space-y-2">
                          <Label htmlFor={`max-sessions-${client.id}`} className="dark:text-gray-300">Máximo de Conversas (Total)</Label>
                          <Input
                            id={`max-sessions-${client.id}`}
                            type="number"
                            placeholder="Ilimitado"
                            value={client.max_chat_sessions}
                            onChange={(e) => handleInputChange(client.id, 'max_chat_sessions', e.target.value)}
                            className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`daily-limit-${client.id}`} className="dark:text-gray-300">Novas Conversas por Dia</Label>
                          <Input
                            id={`daily-limit-${client.id}`}
                            type="number"
                            placeholder="Ilimitado"
                            value={client.daily_chat_limit}
                            onChange={(e) => handleInputChange(client.id, 'daily_chat_limit', e.target.value)}
                            className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                          />
                        </div>
                        <Button
                          onClick={() => handleSave(client.id)}
                          disabled={saving[client.id]}
                          className="w-full md:w-auto"
                        >
                          {saving[client.id] ? 'Salvando...' : <><Save className="h-4 w-4 mr-2" /> Salvar</>}
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      );
    };

    export default ChatLimitsManager;