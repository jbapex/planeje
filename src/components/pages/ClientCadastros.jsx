import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import {
  Loader2,
  Building,
  User,
  Target,
  Info,
  Calendar,
  Instagram,
  Palette,
  Image as ImageIcon,
  Upload,
  Trash2,
} from 'lucide-react';
import {
  CLIENT_PANEL_PRESETS,
  buildClientPanelGradient,
  emitClientPanelColor,
  emitClientPanelLogo,
  normalizeHex,
} from '@/lib/clientPanelTheme';
import { rewritePublicStorageUrl } from '@/lib/publicStorageUrl';

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

const DEFAULT_PANEL_SWATCH = '#1d4ed8';

const PanelColorCard = ({ clienteId, savedColor, onSaved }) => {
  const { toast } = useToast();
  const [draft, setDraft] = useState(savedColor);
  const [saving, setSaving] = useState(false);
  const savedRef = useRef(savedColor);

  useEffect(() => {
    savedRef.current = savedColor;
    setDraft(savedColor);
  }, [savedColor]);

  useEffect(() => () => emitClientPanelColor(savedRef.current), []);

  const pick = (color) => {
    const next = normalizeHex(color);
    setDraft(next);
    emitClientPanelColor(next);
  };

  const dirty = draft !== savedColor;
  const previewGradient =
    buildClientPanelGradient(draft) || 'linear-gradient(145deg, #0c4a6e 0%, #1d4ed8 38%, #3b82f6 72%, #60a5fa 100%)';

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('clientes').update({ painel_cor: draft }).eq('id', clienteId);
    setSaving(false);
    if (error) {
      console.error('Erro ao salvar cor do painel:', error);
      toast({ title: 'Erro ao salvar a cor', description: 'Tente novamente.', variant: 'destructive' });
      return;
    }
    savedRef.current = draft;
    onSaved(draft);
    toast({ title: 'Cor do painel salva', description: draft ? 'A lateral usa a nova cor.' : 'A lateral voltou ao azul padrão.' });
  };

  const discard = () => pick(savedColor);

  return (
    <Card className="dark:bg-gray-800/50 dark:border-gray-700/50 border border-gray-200/50 shadow-sm sm:shadow-md rounded-xl sm:rounded-2xl">
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg dark:text-white">
          <Palette className="h-4 w-4" /> Cor do painel
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm text-muted-foreground dark:text-gray-400 mt-1">
          Escolha a cor da lateral do seu sistema. Só você vê essa cor; sem escolha, fica o azul padrão.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0">
        <div className="flex flex-col gap-5 md:flex-row md:items-start">
          <div className="flex-1 space-y-4">
            <div className="flex flex-wrap gap-2">
              {CLIENT_PANEL_PRESETS.map((preset) => {
                const active = (preset.value || null) === (draft || null);
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => pick(preset.value)}
                    title={preset.label}
                    className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      active ? 'border-foreground ring-2 ring-offset-1 ring-foreground/30' : 'border-border hover:bg-muted'
                    }`}
                  >
                    <span
                      className="h-4 w-4 rounded-full border border-black/10"
                      style={{ background: preset.value || preset.swatch }}
                    />
                    {preset.label}
                  </button>
                );
              })}
            </div>
            <label className="flex items-center gap-3 text-sm text-foreground">
              <input
                type="color"
                value={draft || DEFAULT_PANEL_SWATCH}
                onChange={(e) => pick(e.target.value)}
                className="h-10 w-14 cursor-pointer rounded-md border border-border bg-transparent p-1"
                aria-label="Escolher outra cor"
              />
              <span>Outra cor</span>
              <span className="font-mono text-xs text-muted-foreground">{draft || 'padrão (azul)'}</span>
            </label>
            <div className="flex flex-wrap gap-2">
              <Button onClick={save} disabled={!dirty || saving} className="h-10">
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Salvar cor
              </Button>
              {dirty && (
                <Button variant="outline" onClick={discard} className="h-10">
                  Desfazer
                </Button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3" aria-label="Prévia da lateral">
            <div
              className="flex h-40 w-16 flex-col items-center gap-2 rounded-2xl border border-white/20 py-3 shadow-md"
              style={{ background: previewGradient }}
            >
              <div className="h-8 w-8 rounded-lg bg-white/95" />
              <div className="h-7 w-10 rounded-lg bg-white/30 ring-1 ring-white/40" />
              <div className="h-7 w-10 rounded-lg bg-white/10" />
              <div className="h-7 w-10 rounded-lg bg-white/10" />
            </div>
            <span className="text-xs text-muted-foreground">Prévia</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const LOGO_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

const PanelLogoCard = ({ clienteId, clienteNome, logoUrls, onSaved }) => {
  const { toast } = useToast();
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [busy, setBusy] = useState(false);

  const currentUrl = rewritePublicStorageUrl(logoUrls?.[0] || '') || null;
  const inicial = (clienteNome || 'J').trim().charAt(0).toUpperCase() || 'J';
  const shown = previewUrl || currentUrl;

  useEffect(() => () => previewUrl && URL.revokeObjectURL(previewUrl), [previewUrl]);

  const clearDraft = () => {
    setFile(null);
    setPreviewUrl(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const pickFile = (e) => {
    const next = e.target.files?.[0];
    if (!next) return;
    if (!LOGO_TYPES[next.type]) {
      toast({ title: 'Formato não aceito', description: 'Use PNG, JPG ou WEBP.', variant: 'destructive' });
      e.target.value = '';
      return;
    }
    if (next.size > LOGO_MAX_BYTES) {
      toast({ title: 'Arquivo grande demais', description: 'A logo pode ter até 2 MB.', variant: 'destructive' });
      e.target.value = '';
      return;
    }
    setFile(next);
    setPreviewUrl(URL.createObjectURL(next));
  };

  const persist = async (nextUrls) => {
    const { error } = await supabase.from('clientes').update({ logo_urls: nextUrls }).eq('id', clienteId);
    if (error) throw error;
    onSaved(nextUrls);
    emitClientPanelLogo(nextUrls);
  };

  const save = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const filePath = `client-logos/cliente-${clienteId}-${Date.now()}.${LOGO_TYPES[file.type]}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const url = rewritePublicStorageUrl(data.publicUrl);
      await persist([url, ...(logoUrls || []).filter((u) => u !== url)]);
      clearDraft();
      toast({ title: 'Logo salva', description: 'A lateral já mostra a sua logo.' });
    } catch (error) {
      console.error('Erro ao salvar logo:', error);
      toast({ title: 'Erro ao salvar a logo', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const removeLogo = async () => {
    if (!logoUrls?.length) return;
    setBusy(true);
    try {
      await persist(logoUrls.slice(1));
      toast({ title: 'Logo retirada', description: 'A lateral voltou a mostrar a inicial.' });
    } catch (error) {
      console.error('Erro ao tirar logo:', error);
      toast({ title: 'Erro ao tirar a logo', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="dark:bg-gray-800/50 dark:border-gray-700/50 border border-gray-200/50 shadow-sm sm:shadow-md rounded-xl sm:rounded-2xl">
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg dark:text-white">
          <ImageIcon className="h-4 w-4" /> Logo do painel
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm text-muted-foreground dark:text-gray-400 mt-1">
          A logo aparece no topo da lateral, no lugar da inicial. PNG, JPG ou WEBP de até 2 MB; imagem quadrada fica melhor.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0">
        <div className="flex flex-col gap-5 md:flex-row md:items-center">
          <div className="flex items-center gap-3" aria-label="Prévia da logo">
            <div className="rounded-2xl p-3 shadow-md" style={{ background: 'var(--jb-gradient)' }}>
              <div className="planeje-sidebar-logo overflow-hidden p-0">
                {shown ? <img src={shown} alt="" className="h-full w-full object-cover" /> : <span>{inicial}</span>}
              </div>
            </div>
            <span className="text-xs text-muted-foreground">
              {previewUrl ? 'Prévia (ainda não salva)' : currentUrl ? 'Logo atual' : 'Sem logo: usa a inicial'}
            </span>
          </div>
          <div className="flex flex-1 flex-wrap gap-2 md:justify-end">
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              id="cliente-logo-upload"
              onChange={pickFile}
            />
            <Button variant="outline" className="h-10" disabled={busy} onClick={() => inputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" /> Escolher imagem
            </Button>
            {file && (
              <>
                <Button onClick={save} disabled={busy} className="h-10">
                  {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Salvar logo
                </Button>
                <Button variant="outline" onClick={clearDraft} disabled={busy} className="h-10">
                  Desfazer
                </Button>
              </>
            )}
            {!file && currentUrl && (
              <Button variant="outline" onClick={removeLogo} disabled={busy} className="h-10">
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                Tirar logo
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

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
                className="bg-blue-600 hover:bg-blue-700 text-white h-11 sm:h-10 text-sm sm:text-base"
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

        {!loading && clienteId && (
          <PanelColorCard
            clienteId={clienteId}
            savedColor={normalizeHex(clientData?.painel_cor)}
            onSaved={(color) => setClientData((prev) => ({ ...(prev || {}), painel_cor: color }))}
          />
        )}

        {!loading && clienteId && (
          <PanelLogoCard
            clienteId={clienteId}
            clienteNome={clientData?.empresa || clientData?.nome_contato || ''}
            logoUrls={Array.isArray(clientData?.logo_urls) ? clientData.logo_urls : []}
            onSaved={(urls) => setClientData((prev) => ({ ...(prev || {}), logo_urls: urls }))}
          />
        )}

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

