import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Save, RefreshCw, AlertTriangle } from 'lucide-react';
import { PERSONALITY_TEMPLATES } from '@/lib/personalityTemplates';

const CONFIG_KEY = 'apexia_client_personality_templates';

const ApexIATemplatesSettings = () => {
  const { toast } = useToast();
  const [templates, setTemplates] = useState(PERSONALITY_TEMPLATES);
  const [selectedKey, setSelectedKey] = useState(Object.keys(PERSONALITY_TEMPLATES)[0] || null);
  const [rawJson, setRawJson] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('public_config')
        .select('value')
        .eq('key', CONFIG_KEY)
        .maybeSingle();

      if (error) {
        console.warn('Erro ao carregar templates do ApexIA:', error);
      }

      if (data?.value) {
        try {
          const parsed = JSON.parse(data.value);
          if (parsed && typeof parsed === 'object') {
            setTemplates(parsed);
            if (!parsed[selectedKey]) {
              const firstKey = Object.keys(parsed)[0] || null;
              setSelectedKey(firstKey);
            }
          }
        } catch (parseError) {
          console.warn('Erro ao fazer parse dos templates do ApexIA:', parseError);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [selectedKey]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    if (selectedKey && templates[selectedKey]) {
      setRawJson(JSON.stringify(templates[selectedKey], null, 2));
      setDirty(false);
    }
  }, [selectedKey, templates]);

  const handleSave = async () => {
    if (!selectedKey) return;

    try {
      setSaving(true);

      let parsedTemplate = null;
      try {
        parsedTemplate = JSON.parse(rawJson);
      } catch (err) {
        toast({
          title: 'JSON inválido',
          description: 'Verifique o conteúdo do template. O JSON precisa estar bem formatado.',
          variant: 'destructive',
        });
        return;
      }

      const newTemplates = {
        ...templates,
        [selectedKey]: parsedTemplate,
      };

      const { error } = await supabase
        .from('public_config')
        .upsert(
          {
            key: CONFIG_KEY,
            value: JSON.stringify(newTemplates),
          },
          { onConflict: 'key' }
        );

      if (error) {
        console.error('Erro ao salvar templates do ApexIA:', error);
        toast({
          title: 'Erro ao salvar',
          description: 'Não foi possível salvar as alterações dos templates. Tente novamente.',
          variant: 'destructive',
        });
        return;
      }

      setTemplates(newTemplates);
      setDirty(false);

      toast({
        title: 'Templates atualizados',
        description: 'As configurações deste template do ApexIA foram salvas com sucesso.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefault = () => {
    if (!selectedKey || !PERSONALITY_TEMPLATES[selectedKey]) return;

    setTemplates(prev => ({
      ...prev,
      [selectedKey]: PERSONALITY_TEMPLATES[selectedKey],
    }));
    setRawJson(JSON.stringify(PERSONALITY_TEMPLATES[selectedKey], null, 2));
    setDirty(true);

    toast({
      title: 'Template restaurado',
      description: 'Este template foi restaurado para o padrão original do sistema.',
    });
  };

  const selectedTemplate = selectedKey ? templates[selectedKey] : null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Templates do ApexIA (Cliente)</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Aqui você pode personalizar os templates de personalidade que aparecem para o cliente em
            &quot;Como o ApexIA responde&quot;. Essas configurações impactam diretamente o estilo de resposta,
            o modelo de IA utilizado e o acesso aos dados do cliente.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Templates disponíveis</CardTitle>
          <CardDescription>
            Selecione um template para editar. Cada template representa um estilo de atendimento diferente.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Object.entries(templates).map(([key, value]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedKey(key)}
              className={`flex flex-col items-start rounded-lg border p-3 text-left text-sm transition-colors ${
                selectedKey === key
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-muted/50'
              }`}
            >
              <span className="font-medium">{value?.name || key}</span>
              {value?.description && (
                <span className="mt-1 text-xs text-muted-foreground">{value.description}</span>
              )}
              {value?.config?.ai_model && (
                <span className="mt-2 text-[11px] uppercase tracking-wide text-primary font-medium">
                  Modelo: {value.config.ai_model}
                </span>
              )}
            </button>
          ))}
        </CardContent>
      </Card>

      {selectedTemplate ? (
        <Card>
          <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Edição avançada do template: {selectedTemplate.name || selectedKey}</CardTitle>
              <CardDescription>
                Edite o JSON completo deste template. Use com cuidado: alterações aqui afetam diretamente
                como o ApexIA responderá para todos os clientes que escolherem este estilo.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetToDefault}
                disabled={!PERSONALITY_TEMPLATES[selectedKey]}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Restaurar padrão
              </Button>
              <Button type="button" onClick={handleSave} disabled={saving || !dirty}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Salvar alterações
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
              <AlertTriangle className="h-4 w-4 mt-0.5" />
              <p>
                Esta é uma edição avançada em formato JSON. Não altere a estrutura principal se não tiver
                certeza do que está fazendo. Campos importantes: <code>config.ai_model</code>,{' '}
                <code>config.personality</code>, <code>config.behavior</code>,{' '}
                <code>config.custom_rules</code>, <code>config.response_guidelines</code> e{' '}
                <code>config.client_data_access</code>.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="template-json">JSON do template</Label>
              <ScrollArea className="h-[420px] w-full rounded-md border bg-muted/40">
                <Textarea
                  id="template-json"
                  className="min-h-[400px] border-0 bg-transparent font-mono text-xs"
                  value={rawJson}
                  onChange={e => {
                    setRawJson(e.target.value);
                    setDirty(true);
                  }}
                  spellCheck={false}
                />
              </ScrollArea>
              <p className="text-xs text-muted-foreground">
                Dica: copie o conteúdo para um editor de código se quiser validar o JSON com mais
                facilidade.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {loading ? 'Carregando templates...' : 'Selecione um template para começar a editar.'}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ApexIATemplatesSettings;


