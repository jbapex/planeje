import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Upload, Loader2 } from 'lucide-react';

const CONFIG_KEY = 'diagnostic_welcome_image_url';

const DiagnosticSettings = () => {
  const { toast } = useToast();
  const [imageUrl, setImageUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');

  const loadConfig = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('public_config')
        .select('key, value')
        .eq('key', CONFIG_KEY)
        .maybeSingle();
      if (error) throw error;
      if (data?.value) {
        const url = String(data.value);
        setImageUrl(url);
        setPreviewUrl(url);
      }
    } catch (e) {
      // Tabela pode não existir ainda; apenas informa
      console.warn('Configuração não carregada:', e?.message || e);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleUpload = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Erro', description: 'Por favor, selecione um arquivo de imagem.', variant: 'destructive' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Erro', description: 'Arquivo muito grande. Máximo: 5MB.', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `diagnostic-welcome-${Date.now()}.${fileExt}`;
      const filePath = `diagnostic/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from('diagnostic-images')
        .upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage
        .from('diagnostic-images')
        .getPublicUrl(filePath);
      setImageUrl(publicUrl);
      setPreviewUrl(publicUrl);
      toast({ title: 'Upload concluído', description: 'Imagem enviada com sucesso. Clique em Salvar para confirmar.' });
    } catch (e) {
      toast({ title: 'Erro no upload', description: e.message || 'Verifique se o bucket "diagnostic-images" existe e está configurado.', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('public_config')
        .upsert({ key: CONFIG_KEY, value: imageUrl }, { onConflict: 'key' });
      if (error) throw error;
      toast({ title: 'Salvo', description: 'Imagem do diagnóstico atualizada.' });
    } catch (e) {
      toast({ title: 'Erro ao salvar', description: e.message || 'Verifique se a tabela public_config existe.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-6">
      <Card>
        <CardHeader>
          <CardTitle>Imagem da Página de Diagnóstico</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <div>
              <Label htmlFor="diagImage">URL da imagem (pública)</Label>
              <Input id="diagImage" value={imageUrl} onChange={(e) => {
                setImageUrl(e.target.value);
                setPreviewUrl(e.target.value);
              }} placeholder="https://..." />
              <p className="text-xs text-muted-foreground mt-2">Ou faça upload de uma imagem abaixo.</p>
            </div>
            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6">
              <Label htmlFor="fileUpload" className="cursor-pointer flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm font-medium">Fazer upload de imagem</span>
                <span className="text-xs text-muted-foreground">PNG, JPG ou GIF até 5MB</span>
              </Label>
              <input
                id="fileUpload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleUpload(e.target.files?.[0])}
                disabled={uploading}
              />
              {uploading && (
                <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando...
                </div>
              )}
            </div>
            {previewUrl && (
              <div className="mt-4">
                <Label>Preview:</Label>
                <div className="mt-2 border rounded-lg overflow-hidden max-w-md">
                  <img src={previewUrl} alt="Preview" className="w-full h-auto object-contain max-h-64" onError={() => setPreviewUrl('')} />
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={loading || uploading}>Salvar</Button>
            {imageUrl && (
              <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="text-sm underline">Abrir imagem</a>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DiagnosticSettings;


