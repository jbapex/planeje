import React, { useState, useEffect, useCallback, useMemo } from 'react';
    import { motion, AnimatePresence } from 'framer-motion';
    import { X, Save, User, Building, Phone, Mail, Instagram, Briefcase, Tags, DollarSign, Calendar, Star, Mic, Target, Lock, Upload, Trash2, Download, Info, Link2, MapPin, FileText } from 'lucide-react';
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { Textarea } from '@/components/ui/textarea';
    import { Label } from '@/components/ui/label';
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
    import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from '@/lib/customSupabaseClient';
import { fetchEtiquetaRows, mergeEtiquetaCatalog, saveEtiqueta } from '@/lib/clienteEtiquetas';
import { EtiquetaCreateRow } from '@/components/clients/ClienteEtiquetas';
import { rewritePublicStorageUrl, rewritePublicStorageUrls } from '@/lib/publicStorageUrl';
import { useToast } from '@/components/ui/use-toast';
import { useSessionFormState } from '@/hooks/useSessionFormState';
import ClientMetaAccountsManager from './ClientMetaAccountsManager';
import ClientSocialAccountsManager from './ClientSocialAccountsManager';
import ClientGoogleAdsAccountsManager from './ClientGoogleAdsAccountsManager';
import ClientGoogleDataLinksManager from './ClientGoogleDataLinksManager';
import ClientWhatsappGrupoCard from './ClientWhatsappGrupoCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ClienteBriefing from '@/components/clients/ClienteBriefing';
import CidadeSelect from '@/components/forms/CidadeSelect';
import { BRASIL_UFS } from '@/lib/brasilUfs';
import { matchCidade } from '@/lib/brasilMunicipios';
import { formatCnpjCpf, isValidCnpjCpf } from '@/lib/cnpjCpf';
import { loadClienteGrupo } from '@/lib/clienteWhatsappGrupo';
import { CLIENT_TRAFFIC_GOAL_FIELDS } from '@/lib/clienteSave';
import { DayField } from '@/components/pages/MiniCrmFollowUp';
import { Checkbox } from '@/components/ui/checkbox';

const ETAPAS = [
  { value: 'prospect', label: 'Prospect' },
  { value: 'qualification', label: 'Qualificação' },
  { value: 'proposal', label: 'Proposta' },
  { value: 'negotiation', label: 'Negociação' },
  { value: 'closed', label: 'Fechado' },
  { value: 'lost', label: 'Perdido' }
];

const ClientForm = ({ client, users = [], etiquetaCatalog, onCreateEtiqueta, onSave, onClose, trafficGoalFields, groupDraft, initialStage = 'prospect' }) => {
  const { canViewField, user } = useAuth();
  const { toast } = useToast();
  const focusTrafficGoals = Boolean(trafficGoalFields);
  const newActiveClient = !client && initialStage === 'closed' && !groupDraft;
  const [isUploading, setIsUploading] = useState(false);
  const [savingNewActiveClient, setSavingNewActiveClient] = useState(false);
  const [savingTrafficGoals, setSavingTrafficGoals] = useState(false);
  const [groupValidation, setGroupValidation] = useState('');
  const [ownEtiquetaRows, setOwnEtiquetaRows] = useState([]);
  const formKey = groupDraft || newActiveClient ? null : `client_${client?.id || 'new'}${focusTrafficGoals ? '_metas' : ''}`;
  const catalog = useMemo(
    () => etiquetaCatalog || mergeEtiquetaCatalog(ownEtiquetaRows, client ? [client] : []),
    [etiquetaCatalog, ownEtiquetaRows, client],
  );

  useEffect(() => {
    if (etiquetaCatalog || focusTrafficGoals) return undefined;
    let active = true;
    fetchEtiquetaRows(supabase).then(({ rows, error }) => {
      if (active && !error) setOwnEtiquetaRows(rows);
    });
    return () => { active = false; };
  }, [etiquetaCatalog, focusTrafficGoals]);
  
  // Função para obter dados iniciais
  const getInitialData = () => {
    if (client) {
      return {
        empresa: client.empresa || '',
        nome_contato: client.nome_contato || '',
        cnpj_cpf: formatCnpjCpf(client.cnpj_cpf || ''),
        email: client.email || '',
        telefone: client.telefone || '',
        estado: client.estado || '',
        cidade: matchCidade(client.estado, client.cidade) || client.cidade || '',
        responsavel: client.responsavel || '',
        tipo_contrato: client.tipo_contrato || '',
        etapa: client.etapa || 'prospect',
        produtos_servicos: client.produtos_servicos || '',
        instagram: client.instagram || '',
        publico_alvo: client.publico_alvo || '',
        tom_de_voz: client.tom_de_voz || '',
        vencimento: client.vencimento ? client.vencimento.split('T')[0] : '',
        inicio_na_base: client.inicio_na_base ? String(client.inicio_na_base).slice(0, 10) : '',
        dia_cobranca: client.dia_cobranca ?? '',
        cobranca_parcelada: Boolean(client.cobranca_parcelada),
        dia_cobranca_2: client.dia_cobranca_2 ?? '',
        valor: client.valor || '',
        avaliacao_treinamento: client.avaliacao_treinamento || '',
        etiquetas: client.etiquetas || [],
        nicho: client.nicho || '',
        instagram_password: client.instagram_password || '',
        logo_urls: client.logo_urls || [],
        sobre_empresa: client.sobre_empresa || '',
        objetivo_meta: client.objetivo_meta || '',
        meta_custo_mensagem: client.meta_custo_mensagem || '',
        meta_custo_compra: client.meta_custo_compra || '',
        roas_alvo: client.roas_alvo || '',
        tipo_servico: client.tipo_servico || 'execucao_completa',
        postagem_do_cliente: Boolean(client.postagem_do_cliente),
        entregaveis: client.entregaveis || { carrosseis: 0, posts: 0, stories: 0, videos: 0, anuncios: 0 },
      };
    }
    return {
      empresa: groupDraft?.suggestedName || '',
      nome_contato: '',
      cnpj_cpf: '',
      email: '',
      telefone: '',
      estado: '',
      cidade: '',
      responsavel: '',
      tipo_contrato: '',
      etapa: groupDraft ? 'closed' : initialStage,
      produtos_servicos: '',
      instagram: '',
      publico_alvo: '',
      tom_de_voz: '',
      vencimento: '',
      inicio_na_base: '',
      dia_cobranca: '',
      cobranca_parcelada: false,
      dia_cobranca_2: '',
      valor: '',
      avaliacao_treinamento: '',
      etiquetas: [],
      nicho: '',
      instagram_password: '',
      logo_urls: [],
      sobre_empresa: '',
      objetivo_meta: '',
      meta_custo_mensagem: '',
      meta_custo_compra: '',
      roas_alvo: '',
      tipo_servico: 'execucao_completa',
      postagem_do_cliente: false,
      entregaveis: { carrosseis: 0, posts: 0, stories: 0, videos: 0, anuncios: 0 },
    };
  };

  // Hook que persiste estado em sessionStorage - sempre inicia com dados do cliente
  const initialData = focusTrafficGoals
    ? Object.fromEntries(trafficGoalFields.map((field) => [field, client[field] ?? '']))
    : getInitialData();
  const [formData, setFormData, clearFormData] = useSessionFormState(formKey, initialData);

  // Atualiza quando cliente muda - SEMPRE usa dados do cliente primeiro
  useEffect(() => {
    if (focusTrafficGoals) return;
    const initial = getInitialData();
    
    if (!client) {
      // Se não há cliente (novo cliente), reseta para dados vazios
      setFormData(initial);
      return;
    }

    // Sempre preenche primeiro com dados do cliente (garante que dados aparecem)
    setFormData(initial);
    
    // Depois verifica se há edições não salvas do mesmo cliente para restaurar
    const saved = sessionStorage.getItem(`form_state_${formKey}`);
    
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const clientEmpresa = initial.empresa || '';
        
        // Se tem dados salvos válidos, recentes e do mesmo cliente, restaura após um pequeno delay
        if (parsed.data && 
            parsed.timestamp && 
            Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000 &&
            parsed.data.empresa === clientEmpresa &&
            clientEmpresa !== '') {
          // Verifica se há diferenças (edição em progresso)
          const hasUnsavedChanges = JSON.stringify(parsed.data) !== JSON.stringify(initial);
          if (hasUnsavedChanges) {
            // Restaura edições não salvas após um pequeno delay para não piscar
            const timeoutId = setTimeout(() => {
              setFormData(parsed.data);
            }, 150);
            return () => clearTimeout(timeoutId);
          }
        }
      } catch (error) {
        console.error('Error parsing saved form state:', error);
      }
    }
  }, [client?.id, formKey, focusTrafficGoals, initialStage]); // Quando ID do cliente ou formKey muda

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleTagToggle = (tag) => {
    handleChange('etiquetas', formData.etiquetas.includes(tag)
      ? formData.etiquetas.filter(t => t !== tag)
      : [...formData.etiquetas, tag]);
  };

  const createTag = async (nome) => {
    const created = onCreateEtiqueta
      ? await onCreateEtiqueta(nome)
      : await (async () => {
        const result = await saveEtiqueta(supabase, nome, catalog, user?.id);
        if (!result.ok) {
          toast({ title: 'Não foi possível criar a etiqueta', description: result.error, variant: 'destructive' });
          return null;
        }
        if (!result.existing) setOwnEtiquetaRows((prev) => [...prev, result.etiqueta]);
        return result.etiqueta;
      })();
    if (created) {
      setFormData((prev) => (
        (prev.etiquetas || []).includes(created.chave)
          ? prev
          : { ...prev, etiquetas: [...(prev.etiquetas || []), created.chave] }
      ));
    }
    return created;
  };
    
  const handleFileDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileUpload(files);
    }
  };
    
  const handleFileSelect = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files);
    }
  };

  const handleFileUpload = async (files) => {
    setIsUploading(true);
    const uploadPromises = Array.from(files).map(async (file) => {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `client-logos/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);

      if (uploadError) {
        throw uploadError;
      }
      
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);
      return rewritePublicStorageUrl(publicUrl);
    });

    try {
      const newUrls = await Promise.all(uploadPromises);
      setFormData(prev => ({ ...prev, logo_urls: [...(prev.logo_urls || []), ...newUrls] }));
      toast({ title: 'Upload concluído!', description: `${files.length} logo(s) enviado(s) com sucesso.` });
    } catch (error) {
      toast({ title: 'Erro no upload', description: error.message, variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveLogo = (urlToRemove) => {
    setFormData(prev => ({ ...prev, logo_urls: prev.logo_urls.filter(url => url !== urlToRemove) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (focusTrafficGoals) {
      if (savingTrafficGoals) return;
      setSavingTrafficGoals(true);
      try {
        await onSave(formData, false);
      } finally {
        setSavingTrafficGoals(false);
      }
      return;
    }
    if (groupDraft?.saving || savingNewActiveClient) return;
    if (groupDraft) setGroupValidation('');
    else console.log('📝 Salvando cliente com objetivo_meta:', formData.objetivo_meta);
    const reject = (title, description) => groupDraft
      ? setGroupValidation(description) : toast({ title, description, variant: 'destructive' });
    if ((groupDraft || newActiveClient) && !formData.empresa.trim()) {
      reject('Nome obrigatório', 'Informe o nome da empresa.');
      return;
    }
    if (!isValidCnpjCpf(formData.cnpj_cpf)) {
      reject('CNPJ/CPF inválido', 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido, ou deixe em branco.');
      return;
    }
    if (formData.tipo_servico !== 'apenas_consultoria') {
      const ent = formData.entregaveis || {};
      const total =
        Number(ent.carrosseis || 0) +
        Number(ent.posts || 0) +
        Number(ent.stories || 0) +
        Number(ent.videos || 0) +
        Number(ent.anuncios || 0);
      if (total <= 0) {
        reject('Entregáveis inválidos', 'Para execução completa/parcial, informe pelo menos um entregável maior que zero.');
        return;
      }
    }
    const entregaveis = { ...(formData.entregaveis || {}) };
    if (client?.id) {
      try {
        const grupo = await loadClienteGrupo(client.id);
        if (grupo?.chat_jid) {
          entregaveis.whatsapp_grupo = {
            chat_jid: grupo.chat_jid,
            display_name: grupo.display_name,
            conversation_id: grupo.conversation_id,
            wa_cliente_id: grupo.wa_cliente_id,
          };
        } else {
          delete entregaveis.whatsapp_grupo;
        }
      } catch {
        /* mantém o que já está no form */
      }
    }
    const payload = { ...formData, entregaveis, logo_urls: rewritePublicStorageUrls(formData.logo_urls) };
    if (groupDraft) {
      await onSave(payload, true);
      return;
    }
    if (newActiveClient) {
      setSavingNewActiveClient(true);
      try {
        await onSave(payload, true);
      } finally {
        setSavingNewActiveClient(false);
      }
      return;
    }
    clearFormData();
    onSave(payload, !client);
  };

  const formFields = [
    { id: 'empresa', label: 'Nome da Empresa', icon: Building, type: 'text' },
    { id: 'cnpj_cpf', label: 'CNPJ / CPF', icon: FileText, type: 'cnpj', placeholder: '00.000.000/0000-00 ou 000.000.000-00' },
    { id: 'nome_contato', label: 'Nome do Contato', icon: User, type: 'text' },
    { id: 'email', label: 'E-mail', icon: Mail, type: 'email', placeholder: 'contato@empresa.com' },
    { id: 'telefone', label: 'Telefone / WhatsApp', icon: Phone, type: 'tel', placeholder: '(00) 00000-0000' },
    {
      id: 'estado',
      label: 'Estado (UF)',
      icon: MapPin,
      type: 'select',
      options: [
        { value: '__none__', label: 'Não informado' },
        ...BRASIL_UFS.map((uf) => ({ value: uf.uf, label: `${uf.uf} — ${uf.nome}` })),
      ],
    },
    { id: 'cidade', label: 'Cidade', icon: MapPin, type: 'cidade' },
    { id: 'responsavel', label: 'Responsável', icon: User, type: 'select', options: users.map(u => ({ value: u.id, label: u.full_name, avatar: u.avatar_url })) },
    { id: 'etapa', label: 'Etapa do Funil', icon: Briefcase, type: 'select', options: ETAPAS },
    { id: 'instagram', label: 'Instagram', icon: Instagram, type: 'text', placeholder: '@usuario' },
    { id: 'instagram_password', label: 'Senha do Instagram', icon: Lock, type: 'password' },
    { id: 'nicho', label: 'Nicho de mercado', icon: Target, type: 'text' },
    { 
      id: 'objetivo_meta', 
      label: 'Objetivo de Tráfego (Meta Ads)', 
      icon: Target, 
      type: 'select', 
      options: [
        { value: 'mensagens', label: 'Mensagens / Leads' },
        { value: 'compras', label: 'Compras / E-commerce' },
        { value: 'misto', label: 'Misto (Mensagens + Compras)' },
      ],
    },
    { 
      id: 'meta_custo_mensagem', 
      label: 'Meta Custo por Mensagem (R$)', 
      icon: DollarSign, 
      type: 'number', 
      placeholder: 'Ex: 4.00' 
    },
    { 
      id: 'meta_custo_compra', 
      label: 'Meta Custo por Compra (R$)', 
      icon: DollarSign, 
      type: 'number', 
      placeholder: 'Ex: 25.00' 
    },
    { 
      id: 'roas_alvo', 
      label: 'ROAS Alvo (ex: 3 = 3x)', 
      icon: Target, 
      type: 'number', 
      placeholder: 'Ex: 3' 
    },
    { id: 'limite_meta', label: 'Limite de gasto Meta (R$)', icon: DollarSign, type: 'number' },
    { id: 'tipo_contrato', label: 'Tipo de Contrato', icon: Briefcase, type: 'text', placeholder: 'Ex: Social Media' },
    { id: 'sobre_empresa', label: 'Sobre a Empresa', icon: Info, type: 'textarea' },
    { id: 'publico_alvo', label: 'Público Alvo', icon: Target, type: 'textarea' },
    { id: 'tom_de_voz', label: 'Tom de Voz', icon: Mic, type: 'textarea' },
    { id: 'produtos_servicos', label: 'Produtos/Serviços', icon: Briefcase, type: 'textarea' },
    { id: 'avaliacao_treinamento', label: 'Avaliação/Treinamento', icon: Star, type: 'textarea' },
  ];

  const CORE_FIELD_IDS = ['empresa', 'cnpj_cpf', 'nome_contato', 'email', 'telefone', 'estado', 'cidade', 'responsavel', ...(groupDraft ? [] : ['etapa'])];
  const REDE_FIELD_IDS = ['instagram', 'instagram_password', 'nicho'];
  const META_FIELD_IDS = [...CLIENT_TRAFFIC_GOAL_FIELDS.filter((field) => field !== 'limite_meta'), 'tipo_contrato'];
  const MARCA_FIELD_IDS = ['sobre_empresa', 'publico_alvo', 'tom_de_voz', 'produtos_servicos', 'avaliacao_treinamento'];

  const fieldsById = Object.fromEntries(formFields.map((f) => [f.id, f]));
  const pickFields = (ids) => ids.map((id) => fieldsById[id]).filter(Boolean);

  const renderField = (field) => (
    <div key={field.id} className="space-y-2">
      <Label htmlFor={field.id} className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
        <field.icon className="w-4 h-4" /> {field.label}
      </Label>
      {field.type === 'textarea' ? (
        <Textarea id={field.id} value={formData[field.id]} onChange={(e) => handleChange(field.id, e.target.value)} placeholder={field.placeholder || ''} className="dark:bg-gray-700 dark:text-white dark:border-gray-600" />
      ) : field.type === 'select' ? (
        <Select
          value={field.id === 'estado' ? (formData[field.id] || '__none__') : (formData[field.id] || '')}
          onValueChange={(value) => {
            if (field.id === 'estado') {
              const uf = value === '__none__' ? '' : value;
              setFormData((prev) => ({
                ...prev,
                estado: uf,
                cidade: uf === prev.estado ? prev.cidade : '',
              }));
              return;
            }
            handleChange(field.id, value);
          }}
        >
          <SelectTrigger id={focusTrafficGoals || groupDraft ? field.id : undefined} className="dark:bg-gray-700 dark:text-white dark:border-gray-600">
            <SelectValue placeholder={`Selecione ${field.label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
            {field.options.map((option) => (
              <SelectItem key={option.value} value={option.value} className="dark:text-white dark:hover:bg-gray-600">
                {field.id === 'responsavel' ? (
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={option.avatar} />
                      <AvatarFallback className="dark:bg-gray-600">{option.label ? option.label.charAt(0) : '?'}</AvatarFallback>
                    </Avatar>
                    <span>{option.label}</span>
                  </div>
                ) : (
                  option.label
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : field.type === 'cidade' ? (
        <CidadeSelect uf={formData.estado} value={formData.cidade} onChange={(cidade) => handleChange('cidade', cidade)} />
      ) : field.type === 'cnpj' ? (
        <Input
          id={field.id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={formData[field.id]}
          onChange={(e) => handleChange(field.id, formatCnpjCpf(e.target.value))}
          placeholder={field.placeholder || ''}
          className="dark:bg-gray-700 dark:text-white dark:border-gray-600"
        />
      ) : (
        <Input
          id={field.id}
          type={field.type}
          min={focusTrafficGoals ? 0 : undefined}
          step={focusTrafficGoals ? 'any' : undefined}
          required={(Boolean(groupDraft) || newActiveClient) && field.id === 'empresa'}
          value={formData[field.id]}
          onChange={(e) => handleChange(field.id, e.target.value)}
          placeholder={field.placeholder || ''}
          className="dark:bg-gray-700 dark:text-white dark:border-gray-600"
        />
      )}
    </div>
  );

  const focusHeading = useCallback((node) => node?.focus({ preventScroll: true }), []);
  const fieldSection = (title, subtitle, ids, headingRef) => (
    <div className="rounded-lg border border-border bg-background p-4 space-y-4">
      <div>
        <h3 ref={headingRef} tabIndex={headingRef ? -1 : undefined} className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</h3>
        {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      <div className="space-y-4">{pickFields(ids).map(renderField)}</div>
    </div>
  );

  const trafficGoalsSection = fieldSection(
    'Metas de tráfego',
    'Metas usadas no cockpit e nos relatórios de Meta.',
    trafficGoalFields ?? META_FIELD_IDS,
    focusTrafficGoals ? focusHeading : undefined,
  );
  const mainFields = focusTrafficGoals ? (
    <fieldset disabled={savingTrafficGoals}>{trafficGoalsSection}</fieldset>
  ) : (
    <>
               <div className="space-y-2">
                <Label className="flex items-center gap-2 text-gray-700 dark:text-gray-300">Logos da Empresa</Label>
                <div
                    onDrop={handleFileDrop}
                    onDragOver={(e) => e.preventDefault()}
                    className="relative border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center"
                >
                    <input type="file" multiple className="hidden" id="logo-upload" onChange={handleFileSelect} accept="image/*" />
                    <Upload className="mx-auto h-12 w-12 text-gray-400" />
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                        Arraste e solte os arquivos ou{' '}
                        <label htmlFor="logo-upload" className="font-medium text-blue-600 hover:text-blue-500 cursor-pointer">
                            procure no seu computador
                        </label>
                    </p>
                    {isUploading && <p className="text-sm text-blue-500 mt-2">Enviando...</p>}
                </div>
                {formData.logo_urls && formData.logo_urls.length > 0 && (
                  <div className="mt-4 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
                    {formData.logo_urls.map((url, index) => (
                      <div key={index} className="relative group">
                        <img src={rewritePublicStorageUrl(url)} alt={`Logo ${index + 1}`} className="h-20 w-20 object-contain rounded-md bg-gray-100 dark:bg-gray-700" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-opacity">
                            <a href={rewritePublicStorageUrl(url)} download target="_blank" rel="noopener noreferrer">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-white hover:bg-white/20"
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                            </a>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-white hover:bg-white/20"
                              onClick={() => handleRemoveLogo(url)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded-lg border border-border bg-background p-4 space-y-4">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Identificação</h3>
                <div className="space-y-4">{pickFields(CORE_FIELD_IDS).map(renderField)}</div>
              </div>

              <div className="rounded-lg border border-border bg-background p-4 space-y-4">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Início e cobrança</h3>
                <p className="text-xs text-muted-foreground">
                  A data de início entra no gráfico de clientes do Financeiro. O dia do pagamento alimenta Cobranças; em duas parcelas, informe os dois dias do mês.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                      <Calendar className="h-4 w-4" /> Início na base
                    </Label>
                    <DayField
                      ariaLabel="Início na base"
                      value={formData.inicio_na_base || ''}
                      onChange={(iso) => handleChange('inicio_na_base', iso)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm tabular-nums dark:bg-gray-700 dark:text-white dark:border-gray-600"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                      <Calendar className="h-4 w-4" /> Vencimento do contrato
                    </Label>
                    <DayField
                      ariaLabel="Vencimento do contrato"
                      value={formData.vencimento || ''}
                      onChange={(iso) => handleChange('vencimento', iso)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm tabular-nums dark:bg-gray-700 dark:text-white dark:border-gray-600"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="valor" className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                      <DollarSign className="h-4 w-4" /> Valor mensal (R$)
                    </Label>
                    <Input
                      id="valor"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.valor}
                      onChange={(e) => handleChange('valor', e.target.value)}
                      placeholder="1500.00"
                      className="dark:bg-gray-700 dark:text-white dark:border-gray-600"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dia_cobranca" className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                      <Calendar className="h-4 w-4" /> Dia do 1º pagamento (1–28)
                    </Label>
                    <Input
                      id="dia_cobranca"
                      type="number"
                      min="1"
                      max="28"
                      value={formData.dia_cobranca}
                      onChange={(e) => handleChange('dia_cobranca', e.target.value)}
                      placeholder="Ex: 10"
                      className="dark:bg-gray-700 dark:text-white dark:border-gray-600"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dia_cobranca_2" className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                      <Calendar className="h-4 w-4" /> Dia do 2º pagamento (1–28)
                    </Label>
                    <Input
                      id="dia_cobranca_2"
                      type="number"
                      min="1"
                      max="28"
                      value={formData.dia_cobranca_2}
                      onChange={(e) => handleChange('dia_cobranca_2', e.target.value)}
                      placeholder="Ex: 25"
                      disabled={!formData.cobranca_parcelada}
                      className="dark:bg-gray-700 dark:text-white dark:border-gray-600 disabled:opacity-50"
                    />
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-md border border-dashed border-border px-3 py-2.5">
                  <Checkbox
                    id="cobranca_parcelada"
                    checked={Boolean(formData.cobranca_parcelada)}
                    onCheckedChange={(checked) => {
                      const on = checked === true;
                      setFormData((prev) => ({
                        ...prev,
                        cobranca_parcelada: on,
                        dia_cobranca_2: on ? prev.dia_cobranca_2 : '',
                      }));
                    }}
                  />
                  <div className="space-y-0.5">
                    <Label htmlFor="cobranca_parcelada" className="cursor-pointer font-medium text-gray-800 dark:text-gray-100">
                      Mensalidade em duas parcelas no mês
                    </Label>
                    <p className="text-xs text-muted-foreground">O valor mensal é o total; Cobranças gera duas linhas (metade cada) com Gerar mensalidades do mês.</p>
                  </div>
                </div>
              </div>

              {fieldSection('Redes e nicho', null, REDE_FIELD_IDS)}
              {trafficGoalsSection}

              <div className="rounded-lg border border-border bg-background p-4 space-y-4">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Tipo de Serviço e Entregáveis</h3>
                <div className="space-y-2">
                  <Label htmlFor="tipo_servico" className="text-gray-700 dark:text-gray-300">Tipo de serviço</Label>
                  <Select value={formData.tipo_servico || 'execucao_completa'} onValueChange={(value) => handleChange('tipo_servico', value)}>
                    <SelectTrigger id="tipo_servico" className="dark:bg-gray-700 dark:text-white dark:border-gray-600">
                      <SelectValue placeholder="Selecione o tipo de serviço" />
                    </SelectTrigger>
                      <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                      <SelectItem value="so_midia" className="dark:text-white dark:hover:bg-gray-600">Só mídia</SelectItem>
                      <SelectItem value="so_trafego" className="dark:text-white dark:hover:bg-gray-600">Só tráfego</SelectItem>
                      <SelectItem value="trafego_e_midia" className="dark:text-white dark:hover:bg-gray-600">Tráfego e mídia</SelectItem>
                      <SelectItem value="execucao_completa" className="dark:text-white dark:hover:bg-gray-600">Execução completa</SelectItem>
                      <SelectItem value="execucao_parcial" className="dark:text-white dark:hover:bg-gray-600">Execução parcial</SelectItem>
                      <SelectItem value="apenas_consultoria" className="dark:text-white dark:hover:bg-gray-600">Apenas consultoria</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-start gap-3 rounded-md border border-dashed border-border px-3 py-2.5">
                  <Checkbox
                    id="postagem_do_cliente"
                    checked={Boolean(formData.postagem_do_cliente)}
                    onCheckedChange={(checked) => handleChange('postagem_do_cliente', checked === true)}
                  />
                  <div className="space-y-0.5">
                    <Label htmlFor="postagem_do_cliente" className="cursor-pointer font-medium text-gray-800 dark:text-gray-100">
                      O cliente publica
                    </Label>
                    <p className="text-xs text-muted-foreground">A agência entrega o material. A postagem é do cliente, sem link. Concluir a tarefa vai para Redes Sociais.</p>
                  </div>
                </div>

                {formData.tipo_servico !== 'apenas_consultoria' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="entregaveis_carrosseis">Carrosséis</Label>
                      <Input
                        id="entregaveis_carrosseis"
                        type="number"
                        min="0"
                        value={formData.entregaveis?.carrosseis ?? 0}
                        onChange={(e) =>
                          handleChange('entregaveis', {
                            ...(formData.entregaveis || {}),
                            carrosseis: Math.max(0, Number(e.target.value || 0)),
                          })
                        }
                        className="dark:bg-gray-700 dark:text-white dark:border-gray-600"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="entregaveis_posts">Posts (feed único)</Label>
                      <Input
                        id="entregaveis_posts"
                        type="number"
                        min="0"
                        value={formData.entregaveis?.posts ?? 0}
                        onChange={(e) =>
                          handleChange('entregaveis', {
                            ...(formData.entregaveis || {}),
                            posts: Math.max(0, Number(e.target.value || 0)),
                          })
                        }
                        className="dark:bg-gray-700 dark:text-white dark:border-gray-600"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="entregaveis_stories">Stories</Label>
                      <Input
                        id="entregaveis_stories"
                        type="number"
                        min="0"
                        value={formData.entregaveis?.stories ?? 0}
                        onChange={(e) =>
                          handleChange('entregaveis', {
                            ...(formData.entregaveis || {}),
                            stories: Math.max(0, Number(e.target.value || 0)),
                          })
                        }
                        className="dark:bg-gray-700 dark:text-white dark:border-gray-600"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="entregaveis_videos">Vídeos</Label>
                      <Input
                        id="entregaveis_videos"
                        type="number"
                        min="0"
                        value={formData.entregaveis?.videos ?? 0}
                        onChange={(e) =>
                          handleChange('entregaveis', {
                            ...(formData.entregaveis || {}),
                            videos: Math.max(0, Number(e.target.value || 0)),
                          })
                        }
                        className="dark:bg-gray-700 dark:text-white dark:border-gray-600"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="entregaveis_anuncios">Anúncios</Label>
                      <Input
                        id="entregaveis_anuncios"
                        type="number"
                        min="0"
                        value={formData.entregaveis?.anuncios ?? 0}
                        onChange={(e) =>
                          handleChange('entregaveis', {
                            ...(formData.entregaveis || {}),
                            anuncios: Math.max(0, Number(e.target.value || 0)),
                          })
                        }
                        className="dark:bg-gray-700 dark:text-white dark:border-gray-600"
                      />
                    </div>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Esses números definem o pacote mensal contratado. A IA vai respeitar essa cota ao gerar o plano de campanha.
                </p>
              </div>
              <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                    <Tags className="w-4 h-4" /> Etiquetas
                  </Label>
                  <div className="flex flex-wrap gap-2">
                      {catalog.map(tag => (
                          <Button 
                              key={tag.chave} 
                              type="button" 
                              variant={formData.etiquetas.includes(tag.chave) ? "default" : "outline"}
                              onClick={() => handleTagToggle(tag.chave)}
                              className="dark:border-gray-600 dark:text-white"
                          >
                              {tag.nome}
                          </Button>
                      ))}
                  </div>
                  <EtiquetaCreateRow onCreate={createTag} />
              </div>

              <details className="rounded-lg border border-border bg-background p-4 group">
                <summary className="cursor-pointer text-sm font-semibold text-gray-800 dark:text-gray-100 list-none [&::-webkit-details-marker]:hidden">
                  Marca e operação
                  <span className="ml-2 text-xs font-normal text-muted-foreground">textos para IA e equipe</span>
                </summary>
                <div className="mt-4 space-y-4 border-t border-border pt-4">{pickFields(MARCA_FIELD_IDS).map(renderField)}</div>
              </details>

              <details className="rounded-lg border border-border bg-background p-4 group" open={Boolean(client?.id)}>
                <summary className="cursor-pointer text-sm font-semibold text-gray-800 dark:text-gray-100 list-none [&::-webkit-details-marker]:hidden">
                  Integrações e canais
                  <span className="ml-2 text-xs font-normal text-muted-foreground">WhatsApp, Meta, Google</span>
                </summary>
                <div className="mt-4 space-y-6 border-t border-border pt-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <Link2 className="w-4 h-4" /> Grupo de WhatsApp (equipe + cliente)
                </Label>
                {client?.id ? (
                  <ClientWhatsappGrupoCard
                    clientId={client.id}
                    clientName={formData.empresa || client.empresa}
                  />
                ) : (
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      Salve o cliente primeiro para vincular o grupo de WhatsApp da conta.
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <Link2 className="w-4 h-4" /> Página e Instagram
                </Label>
                {client?.id ? (
                  <ClientSocialAccountsManager
                    clientId={client.id}
                    clientName={formData.empresa || client.empresa}
                  />
                ) : (
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      Salve o cliente primeiro para vincular a página do Facebook e o Instagram.
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <Link2 className="w-4 h-4" /> Contas de Anúncios Meta
                </Label>
                {client?.id ? (
                  <ClientMetaAccountsManager 
                    clientId={client.id} 
                    clientName={formData.empresa || client.empresa}
                  />
                ) : (
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      💡 <strong>Dica:</strong> Salve o cliente primeiro para vincular contas de anúncios do Meta.
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <Link2 className="w-4 h-4" /> Contas Google Ads
                </Label>
                {client?.id ? (
                  <ClientGoogleAdsAccountsManager
                    clientId={client.id}
                    clientName={formData.empresa || client.empresa}
                  />
                ) : (
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      Salve o cliente primeiro para vincular contas Google Ads.
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                  <Link2 className="w-4 h-4" /> Analytics, Meu Negócio e Tag Manager
                </Label>
                {client?.id ? (
                  <ClientGoogleDataLinksManager
                    clientId={client.id}
                    clientName={formData.empresa || client.empresa}
                  />
                ) : (
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      Salve o cliente primeiro para vincular Analytics, Meu Negócio e Tag Manager.
                    </p>
                  </div>
                )}
              </div>
                </div>
              </details>
    </>
  );

  const saving = savingTrafficGoals || savingNewActiveClient || groupDraft?.saving;
  const submitButton = <Button type="submit" className={`${groupDraft ? 'flex-1' : 'w-full'} bg-gradient-to-r from-orange-500 to-purple-600 text-white`}
    disabled={isUploading || saving}>
    <Save className="mr-2 h-4 w-4" /> {isUploading ? 'Enviando...' : saving ? 'Salvando...'
      : groupDraft ? 'Criar cliente e vincular' : client ? 'Salvar Alterações' : 'Criar Cliente'}
  </Button>;
  const form = <form onSubmit={handleSubmit} className={groupDraft ? 'min-h-0 flex flex-col' : 'h-full flex flex-col'}>
    {!groupDraft && <div className="flex justify-between items-center p-6 border-b bg-white dark:bg-gray-800 dark:border-gray-700">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-white">{client ? 'Editar Cliente' : 'Novo Cliente'}</h2>
      <Button type="button" variant="ghost" size="icon" aria-label="Fechar cadastro" onClick={onClose} disabled={savingNewActiveClient} className="dark:text-gray-300 dark:hover:bg-gray-700"><X /></Button>
    </div>}
    <div className="flex-grow p-6 overflow-y-auto space-y-6">
      {client?.id && !focusTrafficGoals ? (
        <Tabs defaultValue="dados" className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-md dark:bg-gray-700/50">
            <TabsTrigger value="dados">Dados do cliente</TabsTrigger>
            <TabsTrigger value="briefing">Briefing</TabsTrigger>
          </TabsList>
          <TabsContent value="dados" className="space-y-6 mt-4 focus-visible:outline-none">{mainFields}</TabsContent>
          <TabsContent value="briefing" className="mt-4 focus-visible:outline-none">
            <ClienteBriefing clienteId={client.id} ownerId={client.owner_id} />
          </TabsContent>
        </Tabs>
      ) : groupDraft ? <fieldset className="space-y-6" disabled={saving}>{mainFields}</fieldset> : mainFields}
    </div>
    <div className="p-6 border-t bg-white dark:bg-gray-800 dark:border-gray-700">
      {groupDraft ? <>
        {(groupValidation || groupDraft.error) && <p role="alert" className="mb-3 text-sm text-destructive">{groupValidation || groupDraft.error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          {submitButton}
        </div>
      </> : submitButton}
    </div>
  </form>;
  if (groupDraft) return form;
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 z-50 flex justify-end"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => e.preventDefault()}
      >
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: '0%' }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="w-full max-w-3xl bg-gray-50 dark:bg-gray-800 h-full shadow-2xl"
        >
          {form}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ClientForm;
