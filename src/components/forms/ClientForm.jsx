import React, { useState, useEffect, useCallback } from 'react';
    import { motion, AnimatePresence } from 'framer-motion';
    import { X, Save, User, Building, Phone, Mail, Instagram, Briefcase, Tags, DollarSign, Calendar, Star, Mic, Target, Lock, Upload, Trash2, Download, Info } from 'lucide-react';
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { Textarea } from '@/components/ui/textarea';
    import { Label } from '@/components/ui/label';
    import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
    import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
    import { useAuth } from '@/contexts/SupabaseAuthContext';
    import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
    import { supabase } from '@/lib/customSupabaseClient';
    import { useToast } from '@/components/ui/use-toast';
    import { useSessionFormState } from '@/hooks/useSessionFormState';

const ETAPAS = [
  { value: 'prospect', label: 'Prospect' },
  { value: 'qualification', label: 'Qualificação' },
  { value: 'proposal', label: 'Proposta' },
  { value: 'negotiation', label: 'Negociação' },
  { value: 'closed', label: 'Fechado' },
  { value: 'lost', label: 'Perdido' }
];

const ETIQUETAS = [
  { value: 'vip', label: 'VIP' },
  { value: 'inativo', label: 'Inativo' },
  { value: 'novo', label: 'Novo' },
];

const ClientForm = ({ client, users = [], onSave, onClose }) => {
  const { canViewField } = useAuth();
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const formKey = `client_${client?.id || 'new'}`;
  
  // Função para obter dados iniciais
  const getInitialData = () => {
    if (client) {
      return {
        empresa: client.empresa || '',
        nome_contato: client.nome_contato || '',
        responsavel: client.responsavel || '',
        tipo_contrato: client.tipo_contrato || '',
        etapa: client.etapa || 'prospect',
        produtos_servicos: client.produtos_servicos || '',
        instagram: client.instagram || '',
        publico_alvo: client.publico_alvo || '',
        tom_de_voz: client.tom_de_voz || '',
        vencimento: client.vencimento ? client.vencimento.split('T')[0] : '',
        valor: client.valor || '',
        avaliacao_treinamento: client.avaliacao_treinamento || '',
        etiquetas: client.etiquetas || [],
        nicho: client.nicho || '',
        instagram_password: client.instagram_password || '',
        logo_urls: client.logo_urls || [],
        sobre_empresa: client.sobre_empresa || '',
      };
    }
    return {
      empresa: '',
      nome_contato: '',
      responsavel: '',
      tipo_contrato: '',
      etapa: 'prospect',
      produtos_servicos: '',
      instagram: '',
      publico_alvo: '',
      tom_de_voz: '',
      vencimento: '',
      valor: '',
      avaliacao_treinamento: '',
      etiquetas: [],
      nicho: '',
      instagram_password: '',
      logo_urls: [],
      sobre_empresa: '',
    };
  };

  // Hook que persiste estado em sessionStorage - sempre inicia com dados do cliente
  const initialData = getInitialData();
  const [formData, setFormData, clearFormData] = useSessionFormState(formKey, initialData);

  // Atualiza quando cliente muda - SEMPRE usa dados do cliente primeiro
  useEffect(() => {
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
  }, [client?.id, formKey]); // Quando ID do cliente ou formKey muda

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleTagToggle = (tag) => {
    handleChange('etiquetas', formData.etiquetas.includes(tag)
      ? formData.etiquetas.filter(t => t !== tag)
      : [...formData.etiquetas, tag]);
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
      return publicUrl;
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

  const handleSubmit = (e) => {
    e.preventDefault();
    // Limpa o estado salvo após salvar com sucesso
    clearFormData();
    onSave(formData, !client);
  };

  const formFields = [
    { id: 'empresa', label: 'Nome da Empresa', icon: Building, type: 'text' },
    { id: 'nome_contato', label: 'Nome do Contato', icon: User, type: 'text' },
    { id: 'responsavel', label: 'Responsável', icon: User, type: 'select', options: users.map(u => ({ value: u.id, label: u.full_name, avatar: u.avatar_url })) },
    { id: 'etapa', label: 'Etapa do Funil', icon: Briefcase, type: 'select', options: ETAPAS },
    { id: 'instagram', label: 'Instagram', icon: Instagram, type: 'text', placeholder: '@usuario' },
    { id: 'instagram_password', label: 'Senha do Instagram', icon: Lock, type: 'password' },
    { id: 'nicho', label: 'Nicho de mercado', icon: Target, type: 'text' },
    { id: 'vencimento', label: 'Vencimento do Contrato', icon: Calendar, type: 'date' },
    { id: 'valor', label: 'Valor Mensal (R$)', icon: DollarSign, type: 'number', placeholder: '1500.00' },
    { id: 'tipo_contrato', label: 'Tipo de Contrato', icon: Briefcase, type: 'text', placeholder: 'Ex: Social Media' },
    { id: 'sobre_empresa', label: 'Sobre a Empresa', icon: Info, type: 'textarea' },
    { id: 'publico_alvo', label: 'Público Alvo', icon: Target, type: 'textarea' },
    { id: 'tom_de_voz', label: 'Tom de Voz', icon: Mic, type: 'textarea' },
    { id: 'produtos_servicos', label: 'Produtos/Serviços', icon: Briefcase, type: 'textarea' },
    { id: 'avaliacao_treinamento', label: 'Avaliação/Treinamento', icon: Star, type: 'textarea' },
  ];

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
          className="w-full max-w-2xl bg-gray-50 dark:bg-gray-800 h-full shadow-2xl"
        >
          <form onSubmit={handleSubmit} className="h-full flex flex-col">
            <div className="flex justify-between items-center p-6 border-b bg-white dark:bg-gray-800 dark:border-gray-700">
              <h2 className="text-2xl font-bold text-gray-800 dark:text-white">{client ? 'Editar Cliente' : 'Novo Cliente'}</h2>
              <Button type="button" variant="ghost" size="icon" onClick={onClose} className="dark:text-gray-300 dark:hover:bg-gray-700"><X /></Button>
            </div>
            
            <div className="flex-grow p-6 overflow-y-auto space-y-6">
              
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
                        <img src={url} alt={`Logo ${index + 1}`} className="h-20 w-20 object-contain rounded-md bg-gray-100 dark:bg-gray-700" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-opacity">
                            <a href={url} download target="_blank" rel="noopener noreferrer">
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
              {formFields.map(field => (
                <div key={field.id} className="space-y-2">
                  <Label htmlFor={field.id} className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                    <field.icon className="w-4 h-4" /> {field.label}
                  </Label>
                  {field.type === 'textarea' ? (
                    <Textarea id={field.id} value={formData[field.id]} onChange={e => handleChange(field.id, e.target.value)} placeholder={field.placeholder || ''} className="dark:bg-gray-700 dark:text-white dark:border-gray-600" />
                  ) : field.type === 'select' ? (
                    <Select value={formData[field.id] || ''} onValueChange={value => handleChange(field.id, value)}>
                      <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600">
                        <SelectValue placeholder={`Selecione ${field.label.toLowerCase()}`} />
                      </SelectTrigger>
                      <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                        {field.options.map(option => (
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
                  ) : (
                    <Input id={field.id} type={field.type} value={formData[field.id]} onChange={e => handleChange(field.id, e.target.value)} placeholder={field.placeholder || ''} className="dark:bg-gray-700 dark:text-white dark:border-gray-600" />
                  )}
                </div>
              ))}
              <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                    <Tags className="w-4 h-4" /> Etiquetas
                  </Label>
                  <div className="flex flex-wrap gap-2">
                      {ETIQUETAS.map(tag => (
                          <Button 
                              key={tag.value} 
                              type="button" 
                              variant={formData.etiquetas.includes(tag.value) ? "default" : "outline"}
                              onClick={() => handleTagToggle(tag.value)}
                              className="dark:border-gray-600 dark:text-white dark:data-[state=checked]:bg-blue-600"
                          >
                              {tag.label}
                          </Button>
                      ))}
                  </div>
              </div>
            </div>

            <div className="p-6 border-t bg-white dark:bg-gray-800 dark:border-gray-700">
              <Button type="submit" className="w-full bg-gradient-to-r from-orange-500 to-purple-600 text-white" disabled={isUploading}>
                <Save className="mr-2 h-4 w-4" /> {isUploading ? 'Enviando...' : (client ? 'Salvar Alterações' : 'Criar Cliente')}
              </Button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ClientForm;