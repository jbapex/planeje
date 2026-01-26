import React, { useEffect, useState, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Building, User, Target, Info, DollarSign, Calendar, Instagram } from 'lucide-react';

const SECTIONS = [
  {
    id: 'basic',
    title: 'Informações Básicas',
    description: 'Dados principais da sua empresa para o time da JB APEX te conhecer melhor.',
    fields: [
      { key: 'empresa', label: 'Nome da Empresa', icon: Building, type: 'text', placeholder: 'Ex: Minha Empresa Ltda' },
      { key: 'nome_contato', label: 'Nome do Contato', icon: User, type: 'text', placeholder: 'Ex: João Silva' },
      { key: 'nicho', label: 'Nicho de Atuação', icon: Target, type: 'text', placeholder: 'Ex: Marketing Digital para Pequenas Empresas' },
      { key: 'publico_alvo', label: 'Público-Alvo e Persona', icon: Target, type: 'textarea', placeholder: 'Descreva o perfil do seu público ideal, incluindo características demográficas, comportamentais e necessidades...' },
      { key: 'tom_de_voz', label: 'Tom de Comunicação', icon: Target, type: 'textarea', placeholder: 'Descreva como sua marca se comunica: formal, descontraído, técnico, amigável, etc...' },
    ],
  },
  {
    id: 'company',
    title: 'Informações da Empresa',
    description: 'Contexto que ajuda o ApexIA a produzir mensagens alinhadas ao seu negócio.',
    fields: [
      { key: 'sobre_empresa', label: 'Sobre a Empresa', icon: Info, type: 'textarea', placeholder: 'Conte a história da sua empresa, missão, valores e o que a torna única no mercado...' },
      { key: 'produtos_servicos', label: 'Produtos / Serviços', icon: Info, type: 'textarea', placeholder: 'Descreva os principais produtos ou serviços oferecidos, suas características e benefícios...' },
      { key: 'avaliacao_treinamento', label: 'Avaliação / Treinamento', icon: Info, type: 'textarea', placeholder: 'Informe sobre processos de avaliação, treinamento ou onboarding de clientes...' },
    ],
  },
  {
    id: 'contract',
    title: 'Informações de Contrato',
    description: 'Resumo dos principais dados do contrato.',
    fields: [
      { key: 'tipo_contrato', label: 'Tipo de Contrato', icon: Info, type: 'text' },
      { key: 'valor', label: 'Valor Mensal (R$)', icon: DollarSign, type: 'number' },
      { key: 'vencimento', label: 'Vencimento do Contrato', icon: Calendar, type: 'date' },
    ],
  },
  {
    id: 'social',
    title: 'Redes Sociais',
    description: 'Informações que usamos nas campanhas e conteúdos.',
    fields: [
      { key: 'instagram', label: 'Instagram', icon: Instagram, type: 'text' },
    ],
  },
];

const ClientCadastros = () => {
  const { profile } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [clientData, setClientData] = useState(null);

  const clienteId = profile?.cliente_id;

  useEffect(() => {
    const fetchClient = async () => {
      if (!clienteId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .eq('id', clienteId)
        .maybeSingle();

      if (error) {
        console.error('Erro ao carregar dados do cliente:', error);
        toast({
          title: 'Erro ao carregar dados',
          description: 'Não foi possível carregar seus dados cadastrais.',
          variant: 'destructive',
        });
      } else {
        setClientData(data || null);
      }

      setLoading(false);
    };

    fetchClient();
  }, [clienteId, toast]);

  const initialFormState = useMemo(() => {
    const base = {};
    SECTIONS.forEach((section) => {
      section.fields.forEach((field) => {
        base[field.key] = '';
      });
    });

    if (!clientData) return base;

    const filled = { ...base };
    Object.keys(filled).forEach((key) => {
      const value = clientData[key];
      if (key === 'vencimento' && value) {
        filled[key] = value.split('T')[0];
      } else {
        filled[key] = value || '';
      }
    });
    return filled;
  }, [clientData]);

  const [formState, setFormState] = useState(initialFormState);

  useEffect(() => {
    setFormState(initialFormState);
  }, [initialFormState]);

  const handleChange = (key, value) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
  };

  const handleToggleEdit = () => {
    setEditing((prev) => !prev);
    if (!editing) {
      setFormState(initialFormState);
    }
  };

  const handleSave = async () => {
    if (!clienteId) return;

    setSaving(true);
    const payload = {};

    SECTIONS.forEach((section) => {
      section.fields.forEach((field) => {
        payload[field.key] = formState[field.key] || null;
      });
    });

    const { error } = await supabase
      .from('clientes')
      .update(payload)
      .eq('id', clienteId);

    if (error) {
      console.error('Erro ao salvar dados do cliente:', error);
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível atualizar seus dados. Tente novamente.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Dados atualizados!',
        description: 'Suas informações foram salvas com sucesso.',
      });
      setClientData((prev) => ({ ...(prev || {}), ...payload }));
      setEditing(false);
    }

    setSaving(false);
  };

  const renderFieldValue = (field) => {
    const value = clientData?.[field.key];
    if (!value) return <span className="text-sm text-muted-foreground">Não informado</span>;

    if (field.key === 'valor') {
      const number = parseFloat(value);
      if (isNaN(number)) return <span className="text-sm text-foreground">{value}</span>;
      return (
        <span className="text-sm text-foreground">
          R$ {number.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      );
    }

    if (field.key === 'vencimento') {
      const date = typeof value === 'string' ? value.split('T')[0] : value;
      return <span className="text-sm text-foreground">{date}</span>;
    }

    return <span className="text-sm text-foreground whitespace-pre-line">{value}</span>;
  };

  return (
    <>
      <Helmet>
        <title>Cadastros do Cliente - JB APEX</title>
      </Helmet>

      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between items-center gap-3 sm:gap-4 text-center md:text-left">
          <div className="w-full md:w-auto">
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Cadastros do Cliente</h1>
            <p className="text-xs sm:text-sm md:text-base text-muted-foreground mt-1">
              Revise e mantenha atualizadas as informações que usamos nas suas estratégias e no ApexIA.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full md:w-auto justify-center md:justify-end">
            <Button
              variant="outline"
              onClick={handleToggleEdit}
              className="h-11 sm:h-10 text-sm sm:text-base"
            >
              {editing ? 'Cancelar' : 'Editar informações'}
            </Button>
            {editing && (
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-emerald-500 hover:bg-emerald-600 text-white h-11 sm:h-10 text-sm sm:text-base"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar alterações'
                )}
              </Button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {SECTIONS.map((section) => (
              <Card
                key={section.id}
                className="dark:bg-gray-800/50 dark:border-gray-700/50 border border-gray-200/50 shadow-sm sm:shadow-md rounded-xl sm:rounded-2xl"
              >
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="text-base sm:text-lg dark:text-white">{section.title}</CardTitle>
                  <CardDescription className="text-xs sm:text-sm text-muted-foreground dark:text-gray-400 mt-1">
                    {section.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6 pt-0">
                  {section.fields.map((field) => {
                    const Icon = field.icon;
                    return (
                      <div key={field.key} className="space-y-1.5 sm:space-y-2">
                        <div className="flex items-center gap-2 text-xs sm:text-sm font-medium text-foreground dark:text-gray-300">
                          <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          <span>{field.label}</span>
                        </div>
                        {editing ? (
                          field.type === 'textarea' ? (
                            <Textarea
                              rows={3}
                              value={formState[field.key] ?? ''}
                              onChange={(e) => handleChange(field.key, e.target.value)}
                              className="dark:bg-gray-900/50 dark:border-gray-700 dark:text-gray-100 placeholder:text-muted-foreground text-sm sm:text-base h-11 sm:h-auto"
                              placeholder={field.placeholder || "Preencha aqui..."}
                            />
                          ) : (
                            <Input
                              type={field.type}
                              value={formState[field.key] ?? ''}
                              onChange={(e) => handleChange(field.key, e.target.value)}
                              className="dark:bg-gray-900/50 dark:border-gray-700 dark:text-gray-100 placeholder:text-muted-foreground h-11 sm:h-10 text-sm sm:text-base"
                              placeholder={field.placeholder || "Preencha aqui..."}
                            />
                          )
                        ) : (
                          <div className="rounded-md border border-border bg-muted/50 px-3 py-2 min-h-[2.75rem] sm:min-h-[2.5rem] flex items-center">
                            {renderFieldValue(field)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default ClientCadastros;

