import React, { useState } from 'react';
import { Download, Puzzle, Globe, FolderOpen, MousePointerClick } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  EXTENSAO_WHATSAPP_ZIP_NAME,
  EXTENSAO_WHATSAPP_ZIP_VERSION,
  downloadExtensaoWhatsAppZip,
  extensaoWhatsAppZipHref,
} from '@/lib/extensaoWhatsApp';

const STEPS = [
  {
    icon: Download,
    title: 'Baixe o ZIP',
    body: 'O arquivo traz a pasta da extensão, pronta para o Chrome.',
  },
  {
    icon: FolderOpen,
    title: 'Descompacte',
    body: 'Extraia no computador. A pasta se chama extensao-whatsapp-planeje.',
  },
  {
    icon: Globe,
    title: 'Abra chrome://extensions',
    body: 'Ative o Modo do desenvolvedor no canto superior direito.',
  },
  {
    icon: MousePointerClick,
    title: 'Carregar sem compactação',
    body: 'Escolha a pasta extraída e recarregue as abas. O ícone P aparece em qualquer site; arraste e clique para abrir.',
  },
];

export default function ExtensaoWhatsAppPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const zipHref = extensaoWhatsAppZipHref();

  async function handleDownload() {
    setBusy(true);
    setError('');
    try {
      await downloadExtensaoWhatsAppZip();
    } catch (err) {
      setError(err.message || 'Falha ao baixar. Use o link direto abaixo.');
      window.location.assign(zipHref);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
          <Puzzle className="h-8 w-8" />
          Extensão Chrome
        </h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          Ícone arrastável em qualquer página do navegador: demandas do dia, criar tarefa/solicitação e aviso quando a etapa muda ou chega mensagem. No WhatsApp Web, o chat aberto preenche o formulário.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Baixar para o Chrome</CardTitle>
          <CardDescription>
            Versão {EXTENSAO_WHATSAPP_ZIP_VERSION}. O download é um ZIP para carregar no modo desenvolvedor (Chrome 114+).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={handleDownload}
              disabled={busy}
              className="bg-gradient-to-r from-orange-500 to-purple-600 text-white"
            >
              <Download className="mr-2 h-4 w-4" />
              {busy ? 'Baixando…' : 'Baixar extensão'}
            </Button>
            <a className="text-sm text-purple-700 underline" href={zipHref}>
              Link direto ({EXTENSAO_WHATSAPP_ZIP_NAME})
            </a>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <ol className="grid gap-3 sm:grid-cols-2">
            {STEPS.map((step, index) => (
              <li key={step.title} className="rounded-xl border bg-card p-4">
                <div className="flex items-center gap-2 font-semibold">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-100 text-purple-700 text-xs">
                    {index + 1}
                  </span>
                  <step.icon className="h-4 w-4 text-purple-600" />
                  {step.title}
                </div>
                <p className="text-sm text-muted-foreground mt-2">{step.body}</p>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
