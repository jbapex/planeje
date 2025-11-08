import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Building2, Save, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const CONFIG_KEY = 'company_info_for_ai';

const CompanyInfoSettings = () => {
  const { toast } = useToast();
  const [companyInfo, setCompanyInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('public_config')
        .select('key, value')
        .eq('key', CONFIG_KEY)
        .maybeSingle();
      
      if (error) throw error;
      
      if (data?.value) {
        setCompanyInfo(data.value);
      } else {
        // Valor padrão
        setCompanyInfo('');
      }
    } catch (e) {
      console.warn('Configuração não carregada:', e?.message || e);
      toast({
        title: 'Aviso',
        description: 'Não foi possível carregar as informações da empresa. Você pode criar uma nova configuração.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('public_config')
        .upsert({
          key: CONFIG_KEY,
          value: companyInfo,
        }, {
          onConflict: 'key',
        });

      if (error) throw error;

      toast({
        title: 'Informações salvas!',
        description: 'As informações sobre a JB APEX foram salvas com sucesso e serão usadas pelas IAs do sistema.',
      });
    } catch (e) {
      toast({
        title: 'Erro ao salvar',
        description: e.message || 'Verifique se a tabela public_config existe.',
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
        <h1 className="text-3xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
          <Building2 className="h-8 w-8" />
          Informações da Empresa para IA
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-2">
          Configure informações sobre a JB APEX que serão usadas pelas IAs do sistema para gerar conteúdo mais personalizado e alinhado com sua empresa.
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Essas informações serão incluídas automaticamente no contexto de todas as gerações de IA do sistema, 
          permitindo que as IAs entendam melhor quem é a JB APEX e gerem conteúdo mais alinhado com sua identidade e valores.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Sobre a JB APEX</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="company-info">
              Informações sobre a empresa
            </Label>
            <Textarea
              id="company-info"
              value={companyInfo}
              onChange={(e) => setCompanyInfo(e.target.value)}
              placeholder="Descreva a JB APEX: missão, visão, valores, histórico, serviços oferecidos, diferenciais, público-alvo, tom de voz, e qualquer outra informação relevante que as IAs devem conhecer sobre a empresa..."
              rows={12}
              className="min-h-[300px]"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Quanto mais detalhado, melhor as IAs entenderão a identidade da JB APEX e gerarão conteúdo mais personalizado.
            </p>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Salvar Informações
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CompanyInfoSettings;

