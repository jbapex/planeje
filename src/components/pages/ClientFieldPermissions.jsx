import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { motion } from 'framer-motion';

const CLIENT_FIELDS = [
  { name: 'valor', label: 'Valor Mensal' },
  { name: 'vencimento', label: 'Vencimento do Contrato' },
  { name: 'tipo_contrato', label: 'Tipo de Contrato' },
  { name: 'instagram', label: 'Instagram' },
  { name: 'publico_alvo', label: 'Público Alvo' },
  { name: 'tom_de_voz', label: 'Tom de Voz' },
  { name: 'avaliacao_treinamento', label: 'Avaliação/Treinamento' },
  { name: 'produtos_servicos', label: 'Produtos/Serviços' },
];

const ROLES = ['admin', 'colaborador'];

const ClientFieldPermissions = () => {
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchPermissions = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('client_field_permissions').select('*');
    if (error) {
      toast({ title: 'Erro ao buscar permissões', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    const perms = {};
    ROLES.forEach(role => {
      perms[role] = {};
      CLIENT_FIELDS.forEach(field => {
        const p = data.find(item => item.role === role && item.field_name === field.name);
        perms[role][field.name] = p ? p.can_view : true;
      });
    });

    setPermissions(perms);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  const handlePermissionChange = async (role, fieldName, canView) => {
    const updatedPermissions = {
      ...permissions,
      [role]: { ...permissions[role], [fieldName]: canView }
    };
    setPermissions(updatedPermissions);

    const { error } = await supabase.from('client_field_permissions')
      .upsert({ role, field_name: fieldName, can_view: canView }, { onConflict: 'role,field_name' });

    if (error) {
      toast({ title: 'Erro ao salvar permissão', description: error.message, variant: 'destructive' });
      // Revert UI change
      fetchPermissions();
    } else {
      toast({ title: 'Permissão atualizada!', description: `Campo '${CLIENT_FIELDS.find(f => f.name === fieldName)?.label}' para '${role}' agora é ${canView ? 'visível' : 'oculto'}.` });
    }
  };

  if (loading) {
    return <div className="text-center p-10">Carregando permissões...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-white">Permissões de Campos de Clientes</h1>
        <p className="text-gray-500 dark:text-gray-400">Controle a visibilidade de campos para diferentes funções de usuário.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {ROLES.map(role => (
          <motion.div
            key={role}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: ROLES.indexOf(role) * 0.1 }}
          >
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader>
                <CardTitle className="capitalize dark:text-white">{role}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {CLIENT_FIELDS.map(field => (
                  <div key={field.name} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <Label htmlFor={`${role}-${field.name}`} className="dark:text-gray-300">{field.label}</Label>
                    <Switch
                      id={`${role}-${field.name}`}
                      checked={permissions[role]?.[field.name] ?? true}
                      onCheckedChange={checked => handlePermissionChange(role, field.name, checked)}
                      className="data-[state=checked]:bg-green-500"
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default ClientFieldPermissions;