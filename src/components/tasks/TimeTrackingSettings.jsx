import React, { useState, useEffect, useCallback } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { MultiSelect } from '@/components/ui/multi-select';
import { Save } from 'lucide-react';

const TimeTrackingSettings = ({ isOpen, onClose, statusOptions }) => {
  const [startStatuses, setStartStatuses] = useState([]);
  const [pauseStatuses, setPauseStatuses] = useState([]);
  const [settingsId, setSettingsId] = useState(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const statusSelectOptions = statusOptions.map(s => ({
    value: s.value,
    label: s.label,
  }));

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('time_tracking_settings')
      .select('*')
      .limit(1)
      .single();
    
    if (error && error.code !== 'PGRST116') { // Ignore "exact one row" error if table is empty
      toast({ title: 'Erro ao buscar configurações', description: error.message, variant: 'destructive' });
    } else if (data) {
      setStartStatuses(data.start_statuses || []);
      setPauseStatuses(data.pause_statuses || []);
      setSettingsId(data.id);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    if (isOpen) {
      fetchSettings();
    }
  }, [isOpen, fetchSettings]);

  const handleSave = async () => {
    if (!settingsId) {
      toast({ title: 'Erro: ID de configuração não encontrado.', variant: 'destructive' });
      return;
    }

    const { error } = await supabase
      .from('time_tracking_settings')
      .update({ 
        start_statuses: startStatuses, 
        pause_statuses: pauseStatuses 
      })
      .eq('id', settingsId);

    if (error) {
      toast({ title: 'Erro ao salvar configurações', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Configurações do cronômetro salvas!' });
      onClose();
    }
  };

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="max-w-md mx-auto dark:bg-gray-800 dark:border-gray-700">
        <DrawerHeader>
          <DrawerTitle className="dark:text-white">Configurar Cronômetro</DrawerTitle>
          <DrawerDescription className="dark:text-gray-400">
            Defina quais status devem iniciar ou pausar a contagem de tempo das tarefas.
          </DrawerDescription>
        </DrawerHeader>
        <div className="p-4 flex-grow overflow-y-auto">
          {loading ? (
            <p className="dark:text-gray-300">Carregando configurações...</p>
          ) : (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="font-semibold dark:text-white">Status que INICIAM o cronômetro</Label>
                <p className="text-sm text-gray-500 dark:text-gray-400">O tempo começará a contar quando uma tarefa entrar em um destes status.</p>
                <MultiSelect
                  options={statusSelectOptions}
                  value={startStatuses}
                  onChange={setStartStatuses}
                  placeholder="Selecione os status..."
                />
              </div>
              <div className="space-y-2">
                <Label className="font-semibold dark:text-white">Status que PAUSAM o cronômetro</Label>
                <p className="text-sm text-gray-500 dark:text-gray-400">O tempo será pausado (sem contar) quando uma tarefa estiver em um destes status.</p>
                <MultiSelect
                  options={statusSelectOptions}
                  value={pauseStatuses}
                  onChange={setPauseStatuses}
                  placeholder="Selecione os status..."
                />
              </div>
            </div>
          )}
        </div>
        <DrawerFooter className="border-t dark:border-gray-700">
          <div className="flex justify-end gap-2">
            <DrawerClose asChild>
              <Button variant="outline" className="dark:bg-gray-700 dark:text-white dark:border-gray-600 dark:hover:bg-gray-600">Cancelar</Button>
            </DrawerClose>
            <Button onClick={handleSave} disabled={loading}>
              <Save className="mr-2 h-4 w-4" />
              Salvar
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};

export default TimeTrackingSettings;