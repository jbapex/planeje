import React, { useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Upload, Calendar as CalendarIcon, Send } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from "@/components/ui/calendar";

const ContentPublisher = ({ type, pages, instagramAccounts, selectedPage, selectedInstagram, onClose, onSuccess }) => {
  const [message, setMessage] = useState('');
  const [link, setLink] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [scheduledTime, setScheduledTime] = useState(null);
  const [publishNow, setPublishNow] = useState(true);
  const [selectedPageId, setSelectedPageId] = useState(selectedPage || '');
  const [selectedInstagramId, setSelectedInstagramId] = useState(selectedInstagram || '');
  const [loading, setLoading] = useState(false);

  const { toast } = useToast();

  const handlePublish = async () => {
    if (type === 'pages') {
      if (!selectedPageId) {
        toast({
          title: 'Erro',
          description: 'Selecione uma página',
          variant: 'destructive',
        });
        return;
      }
      if (!message && !link) {
        toast({
          title: 'Erro',
          description: 'Digite uma mensagem ou um link',
          variant: 'destructive',
        });
        return;
      }
    } else {
      if (!selectedInstagramId) {
        toast({
          title: 'Erro',
          description: 'Selecione uma conta Instagram',
          variant: 'destructive',
        });
        return;
      }
      if (!imageUrl) {
        toast({
          title: 'Erro',
          description: 'Informe a URL da imagem',
          variant: 'destructive',
        });
        return;
      }
    }

    setLoading(true);

    try {
      if (type === 'pages') {
        const body = {
          action: 'publish-page-post',
          page_id: selectedPageId,
        };

        if (message) body.message = message;
        if (link) body.link = link;
        if (!publishNow && scheduledTime) {
          body.scheduled_publish_time = Math.floor(scheduledTime.getTime() / 1000);
        }

        const { data, error } = await supabase.functions.invoke('meta-ads-api', { body });

        if (error) throw error;
        if (data?.error) throw new Error(data.error.message || 'Erro ao publicar');

        toast({
          title: 'Sucesso!',
          description: publishNow
            ? 'Post publicado com sucesso!'
            : `Post agendado para ${format(scheduledTime, 'dd/MM/yyyy HH:mm', { locale: ptBR })}`,
        });

        if (onSuccess) onSuccess();
      } else {
        const { data, error } = await supabase.functions.invoke('meta-ads-api', {
          body: {
            action: 'publish-instagram-content',
            instagram_account_id: selectedInstagramId,
            image_url: imageUrl,
            caption: message,
            media_type: 'IMAGE',
          },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error.message || 'Erro ao publicar');

        toast({
          title: 'Sucesso!',
          description: 'Conteúdo publicado no Instagram com sucesso!',
        });

        if (onSuccess) onSuccess();
      }
    } catch (err) {
      console.error('Erro ao publicar:', err);
      toast({
        title: 'Erro ao publicar',
        description: err.message || 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {type === 'pages' ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="page-select" className="dark:text-gray-300">Página</Label>
            <Select value={selectedPageId} onValueChange={setSelectedPageId}>
              <SelectTrigger id="page-select" className="dark:bg-gray-700 dark:text-white dark:border-gray-600">
                <SelectValue placeholder="Selecione uma página" />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-700 dark:text-white">
                {pages.map((page) => (
                  <SelectItem key={page.id} value={page.id} className="dark:hover:bg-gray-600">
                    {page.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="message" className="dark:text-gray-300">Mensagem</Label>
            <Textarea
              id="message"
              placeholder="Digite a mensagem do post..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="min-h-[100px] dark:bg-gray-700 dark:text-white dark:border-gray-600"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="link" className="dark:text-gray-300">Link (opcional)</Label>
            <Input
              id="link"
              type="url"
              placeholder="https://..."
              value={link}
              onChange={(e) => setLink(e.target.value)}
              className="dark:bg-gray-700 dark:text-white dark:border-gray-600"
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="publish-now"
                checked={publishNow}
                onChange={(e) => setPublishNow(e.target.checked)}
                className="dark:bg-gray-700"
              />
              <Label htmlFor="publish-now" className="dark:text-gray-300">
                Publicar agora
              </Label>
            </div>

            {!publishNow && (
              <div className="space-y-2">
                <Label className="dark:text-gray-300">Agendar para</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal dark:bg-gray-700 dark:text-white dark:border-gray-600"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {scheduledTime ? (
                        format(scheduledTime, "dd/MM/yyyy HH:mm", { locale: ptBR })
                      ) : (
                        <span>Selecione data e hora</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={scheduledTime}
                      onSelect={setScheduledTime}
                      disabled={(date) => date < new Date()}
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="instagram-select" className="dark:text-gray-300">Conta Instagram</Label>
            <Select value={selectedInstagramId} onValueChange={setSelectedInstagramId}>
              <SelectTrigger id="instagram-select" className="dark:bg-gray-700 dark:text-white dark:border-gray-600">
                <SelectValue placeholder="Selecione uma conta" />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-700 dark:text-white">
                {instagramAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id} className="dark:hover:bg-gray-600">
                    {account.username || account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="image-url" className="dark:text-gray-300">URL da Imagem</Label>
            <Input
              id="image-url"
              type="url"
              placeholder="https://..."
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              className="dark:bg-gray-700 dark:text-white dark:border-gray-600"
            />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              A imagem deve estar acessível publicamente via URL
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="caption" className="dark:text-gray-300">Legenda</Label>
            <Textarea
              id="caption"
              placeholder="Digite a legenda..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="min-h-[100px] dark:bg-gray-700 dark:text-white dark:border-gray-600"
            />
          </div>
        </>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={loading} className="dark:bg-gray-700 dark:text-white dark:border-gray-600">
          Cancelar
        </Button>
        <Button onClick={handlePublish} disabled={loading} className="dark:bg-blue-600 dark:hover:bg-blue-700">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Publicando...
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              Publicar
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default ContentPublisher;
