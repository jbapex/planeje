import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const CONFIG_KEY = 'dashboard_status_config';

const DashboardSettings = () => {
  const { toast } = useToast();
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Configuração de cada box do dashboard
  const [config, setConfig] = useState({
    executed: [], // Status que contam como "Executadas"
    overdueExclude: [], // Status que NÃO devem ser contados como atrasadas
    today: [], // Status que contam como "Hoje" (vazio = todos)
    upcoming: [], // Status que contam como "Próximas" (vazio = todos)
  });

  const loadStatuses = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('task_statuses')
        .select('*')
        .order('sort_order');
      
      if (error) throw error;
      setStatuses(data || []);
    } catch (e) {
      toast({
        title: 'Erro ao carregar status',
        description: e.message,
        variant: 'destructive',
      });
    }
  }, [toast]);

  const loadConfig = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('public_config')
        .select('key, value')
        .eq('key', CONFIG_KEY)
        .maybeSingle();
      
      if (error) throw error;
      
      if (data?.value) {
        const savedConfig = JSON.parse(data.value);
        setConfig(savedConfig);
      } else {
        // Valores padrão
        setConfig({
          executed: ['published'],
          overdueExclude: ['published', 'scheduled', 'concluido'],
          today: [],
          upcoming: [],
        });
      }
    } catch (e) {
      console.warn('Configuração não carregada:', e?.message || e);
      // Valores padrão em caso de erro
      setConfig({
        executed: ['published'],
        overdueExclude: ['published', 'scheduled', 'concluido'],
        today: [],
        upcoming: [],
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      await Promise.all([loadStatuses(), loadConfig()]);
      setLoading(false);
    };
    fetchData();
  }, [loadStatuses, loadConfig]);

  const handleToggleStatus = (boxType, statusValue) => {
    setConfig(prev => {
      const currentList = prev[boxType] || [];
      const isSelected = currentList.includes(statusValue);
      
      if (isSelected) {
        return {
          ...prev,
          [boxType]: currentList.filter(v => v !== statusValue),
        };
      } else {
        return {
          ...prev,
          [boxType]: [...currentList, statusValue],
        };
      }
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('public_config')
        .upsert({
          key: CONFIG_KEY,
          value: JSON.stringify(config),
        }, {
          onConflict: 'key',
        });

      if (error) throw error;

      toast({
        title: 'Configuração salva!',
        description: 'As configurações do dashboard foram atualizadas com sucesso.',
      });
    } catch (e) {
      toast({
        title: 'Erro ao salvar',
        description: e.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Configuração do Dashboard</h2>
        <p className="text-muted-foreground">
          Configure quais status de tarefas devem ser considerados em cada métrica do dashboard.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Executadas</CardTitle>
          <CardDescription>
            Status que contam como tarefas executadas (publicadas) nesta semana.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {statuses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum status disponível. Configure os status em Tarefas primeiro.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {statuses.map(status => (
                <div key={status.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`executed-${status.value}`}
                    checked={config.executed.includes(status.value)}
                    onCheckedChange={() => handleToggleStatus('executed', status.value)}
                  />
                  <Label
                    htmlFor={`executed-${status.value}`}
                    className="flex items-center gap-2 cursor-pointer flex-1"
                  >
                    <Badge
                      style={{ backgroundColor: status.color || '#6B7280' }}
                      className="text-xs"
                    >
                      {status.label}
                    </Badge>
                  </Label>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Atrasadas - Status a Excluir</CardTitle>
          <CardDescription>
            Status que NÃO devem ser contados como atrasadas. Tarefas com esses status não aparecerão no contador de atrasadas, mesmo que tenham data de vencimento no passado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {statuses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum status disponível.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {statuses.map(status => (
                <div key={status.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`overdue-${status.value}`}
                    checked={config.overdueExclude.includes(status.value)}
                    onCheckedChange={() => handleToggleStatus('overdueExclude', status.value)}
                  />
                  <Label
                    htmlFor={`overdue-${status.value}`}
                    className="flex items-center gap-2 cursor-pointer flex-1"
                  >
                    <Badge
                      style={{ backgroundColor: status.color || '#6B7280' }}
                      className="text-xs"
                    >
                      {status.label}
                    </Badge>
                  </Label>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hoje</CardTitle>
          <CardDescription>
            Status que contam como tarefas de hoje. Deixe vazio para contar todos os status.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {statuses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum status disponível.</p>
          ) : (
            <>
              <div className="mb-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfig(prev => ({ ...prev, today: [] }))}
                >
                  Limpar seleção (todos os status)
                </Button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {statuses.map(status => (
                  <div key={status.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`today-${status.value}`}
                      checked={config.today.includes(status.value)}
                      onCheckedChange={() => handleToggleStatus('today', status.value)}
                    />
                    <Label
                      htmlFor={`today-${status.value}`}
                      className="flex items-center gap-2 cursor-pointer flex-1"
                    >
                      <Badge
                        style={{ backgroundColor: status.color || '#6B7280' }}
                        className="text-xs"
                      >
                        {status.label}
                      </Badge>
                    </Label>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Próximas</CardTitle>
          <CardDescription>
            Status que contam como tarefas próximas (próximos 7 dias). Deixe vazio para contar todos os status.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {statuses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum status disponível.</p>
          ) : (
            <>
              <div className="mb-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfig(prev => ({ ...prev, upcoming: [] }))}
                >
                  Limpar seleção (todos os status)
                </Button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {statuses.map(status => (
                  <div key={status.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`upcoming-${status.value}`}
                      checked={config.upcoming.includes(status.value)}
                      onCheckedChange={() => handleToggleStatus('upcoming', status.value)}
                    />
                    <Label
                      htmlFor={`upcoming-${status.value}`}
                      className="flex items-center gap-2 cursor-pointer flex-1"
                    >
                      <Badge
                        style={{ backgroundColor: status.color || '#6B7280' }}
                        className="text-xs"
                      >
                        {status.label}
                      </Badge>
                    </Label>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Salvar Configurações
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default DashboardSettings;

