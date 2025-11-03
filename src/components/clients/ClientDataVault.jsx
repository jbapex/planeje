import React, { useState } from 'react';
    import { motion, AnimatePresence } from 'framer-motion';
    import { X, Save, Plus, Trash2, Key, Link, Mail, AlertTriangle } from 'lucide-react';
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { Label } from '@/components/ui/label';
    import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

    const ClientDataVault = ({ client, onSave, onClose }) => {
      const [data, setData] = useState(client.additional_data || []);

      const handleAddItem = () => {
        setData([...data, { id: Date.now(), key: '', value: '' }]);
      };

      const handleRemoveItem = (id) => {
        setData(data.filter(item => item.id !== id));
      };

      const handleUpdateItem = (id, field, value) => {
        setData(data.map(item => item.id === id ? { ...item, [field]: value } : item));
      };

      const handleSubmit = () => {
        onSave(client.id, data.filter(item => item.key && item.value));
      };

      const getIcon = (key) => {
        const lowerKey = key.toLowerCase();
        if (lowerKey.includes('senha') || lowerKey.includes('password')) return <Key className="w-4 h-4 text-gray-400" />;
        if (lowerKey.includes('link') || lowerKey.includes('url')) return <Link className="w-4 h-4 text-gray-400" />;
        if (lowerKey.includes('mail')) return <Mail className="w-4 h-4 text-gray-400" />;
        return <div className="w-4 h-4" />;
      };

      return (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
            onClick={onClose}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="w-full max-w-2xl bg-gray-50 dark:bg-gray-800 rounded-lg shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center p-6 border-b dark:border-gray-700">
                <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Dados de {client.empresa}</h2>
                <Button type="button" variant="ghost" size="icon" onClick={onClose} className="dark:text-gray-300 dark:hover:bg-gray-700"><X /></Button>
              </div>
              
              <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Cuidado com Dados Sensíveis!</AlertTitle>
                  <AlertDescription>
                    Armazenar senhas e informações sensíveis aqui não é o método mais seguro. Considere usar um gerenciador de senhas dedicado para máxima segurança.
                  </AlertDescription>
                </Alert>
                
                {data.map((item) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <div className="flex-none">{getIcon(item.key)}</div>
                    <Input 
                      placeholder="Chave (ex: Senha Facebook)" 
                      value={item.key}
                      onChange={(e) => handleUpdateItem(item.id, 'key', e.target.value)}
                      className="flex-1 dark:bg-gray-700 dark:border-gray-600"
                    />
                    <Input 
                      placeholder="Valor" 
                      value={item.value}
                      onChange={(e) => handleUpdateItem(item.id, 'value', e.target.value)}
                      className="flex-1 dark:bg-gray-700 dark:border-gray-600"
                    />
                    <Button variant="ghost" size="icon" onClick={() => handleRemoveItem(item.id)} className="text-red-500 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                <Button variant="outline" onClick={handleAddItem} className="w-full dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">
                  <Plus className="mr-2 h-4 w-4" /> Adicionar Dado
                </Button>
              </div>

              <div className="p-6 border-t bg-white dark:bg-gray-800 dark:border-gray-700">
                <Button onClick={handleSubmit} className="w-full bg-gradient-to-r from-blue-500 to-teal-500 text-white">
                  <Save className="mr-2 h-4 w-4" /> Salvar Dados
                </Button>
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      );
    };

    export default ClientDataVault;