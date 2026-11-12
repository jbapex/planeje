import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/customSupabaseClient';
import { resolveTipoPergunta, isRespostaVazia, normalizeArquivosResposta } from '@/lib/briefingQuestionUtils';
import { useToast } from '@/components/ui/use-toast';
import { ExternalLink, Loader2, Trash2, Upload } from 'lucide-react';

const ACCEPT_FILES = '.pdf,.png,.jpg,.jpeg,.webp,.svg';

function sanitizeFilename(name) {
  return String(name || 'arquivo').replace(/[^\w.\-]/g, '_').slice(0, 180);
}

const BriefingPerguntaResposta = ({
  pergunta,
  value,
  onChange,
  briefingId,
  showRequiredError = false,
  disabled = false,
}) => {
  const { toast } = useToast();
  const tipo = resolveTipoPergunta(pergunta);
  const pid = String(pergunta.id);
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadLabel, setUploadLabel] = useState('');

  const obrigatoria = Boolean(pergunta.obrigatorio);
  const borderClass = showRequiredError ? 'border-2 border-red-500 rounded-md p-3' : '';

  const setVal = (v) => onChange(pid, v);

  if (tipo === 'texto') {
    return (
      <div className={`space-y-2 ${borderClass}`}>
        <div className="flex flex-wrap items-center gap-2">
          <Label className="text-gray-700 dark:text-gray-300">{pergunta.texto || '(sem texto)'}</Label>
          {obrigatoria && (
            <Badge variant="destructive" className="text-xs">
              Obrigatória
            </Badge>
          )}
        </div>
        <Textarea
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => setVal(e.target.value)}
          rows={3}
          disabled={disabled}
          className="dark:bg-gray-700 dark:text-white dark:border-gray-600"
        />
        {showRequiredError && isRespostaVazia('texto', value) && (
          <p className="text-xs text-red-500">Campo obrigatório</p>
        )}
      </div>
    );
  }

  if (tipo === 'link') {
    return (
      <div className={`space-y-2 ${borderClass}`}>
        <div className="flex flex-wrap items-center gap-2">
          <Label className="text-gray-700 dark:text-gray-300">{pergunta.texto || '(sem texto)'}</Label>
          {obrigatoria && (
            <Badge variant="destructive" className="text-xs">
              Obrigatória
            </Badge>
          )}
        </div>
        <Input
          type="url"
          placeholder="https://"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => setVal(e.target.value)}
          disabled={disabled}
          className="dark:bg-gray-700 dark:text-white dark:border-gray-600"
        />
        {showRequiredError && isRespostaVazia('link', value) && (
          <p className="text-xs text-red-500">Campo obrigatório</p>
        )}
      </div>
    );
  }

  if (tipo === 'multipla_escolha') {
    const opcoes = Array.isArray(pergunta.opcoes) ? pergunta.opcoes : [];
    const selected = typeof value === 'string' ? value : '';
    return (
      <div className={`space-y-2 ${borderClass}`}>
        <div className="flex flex-wrap items-center gap-2">
          <Label className="text-gray-700 dark:text-gray-300">{pergunta.texto || '(sem texto)'}</Label>
          {obrigatoria && (
            <Badge variant="destructive" className="text-xs">
              Obrigatória
            </Badge>
          )}
        </div>
        <div className="space-y-2">
          {opcoes.map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200 cursor-pointer">
              <input
                type="radio"
                name={`briefing-${briefingId}-${pid}`}
                value={opt}
                checked={selected === opt}
                onChange={() => setVal(opt)}
                disabled={disabled}
                className="h-4 w-4"
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
        {showRequiredError && isRespostaVazia('multipla_escolha', value) && (
          <p className="text-xs text-red-500">Campo obrigatório</p>
        )}
      </div>
    );
  }

  if (tipo === 'multipla_selecao') {
    const opcoes = Array.isArray(pergunta.opcoes) ? pergunta.opcoes : [];
    const selected = Array.isArray(value) ? value : [];
    const toggle = (opt) => {
      const set = new Set(selected);
      if (set.has(opt)) set.delete(opt);
      else set.add(opt);
      setVal([...set]);
    };
    return (
      <div className={`space-y-2 ${borderClass}`}>
        <div className="flex flex-wrap items-center gap-2">
          <Label className="text-gray-700 dark:text-gray-300">{pergunta.texto || '(sem texto)'}</Label>
          {obrigatoria && (
            <Badge variant="destructive" className="text-xs">
              Obrigatória
            </Badge>
          )}
        </div>
        <div className="space-y-2">
          {opcoes.map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200 cursor-pointer">
              <Checkbox checked={selected.includes(opt)} onCheckedChange={() => toggle(opt)} disabled={disabled} />
              <span>{opt}</span>
            </label>
          ))}
        </div>
        {showRequiredError && isRespostaVazia('multipla_selecao', value) && (
          <p className="text-xs text-red-500">Campo obrigatório</p>
        )}
      </div>
    );
  }

  if (tipo === 'arquivo') {
    const arquivos = normalizeArquivosResposta(value);

    const uploadOne = async (file) => {
      const safeName = sanitizeFilename(file.name);
      const path = `${briefingId}/${pid}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;
      const { error: upErr } = await supabase.storage.from('briefing-arquivos').upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('briefing-arquivos').getPublicUrl(path);
      return {
        url: pub.publicUrl,
        nome: file.name,
        tamanho: file.size,
      };
    };

    const handleFiles = async (e) => {
      const picked = e.target.files ? Array.from(e.target.files) : [];
      e.target.value = '';
      if (!picked.length || !briefingId) return;
      setUploading(true);
      /** Acumula no handler: onChange do pai não aceita updater (prev) => next. */
      let acc = [...normalizeArquivosResposta(value)];
      let enviadosNesteLote = 0;
      try {
        for (let i = 0; i < picked.length; i++) {
          const file = picked[i];
          setUploadLabel(`${i + 1} de ${picked.length}`);
          setProgress(Math.round(((i + 0.15) / picked.length) * 100));
          try {
            const meta = await uploadOne(file);
            acc = [...acc, meta];
            setVal(acc);
            enviadosNesteLote += 1;
            setProgress(Math.round(((i + 1) / picked.length) * 100));
          } catch (err) {
            console.error(err);
            toast({
              title: 'Falha no envio',
              description: `${file.name}: ${err?.message || 'Não foi possível enviar.'}`,
              variant: 'destructive',
            });
          }
        }
        if (enviadosNesteLote > 0) {
          toast({
            title: 'Arquivo(s) anexado(s)',
            description:
              enviadosNesteLote === 1 ? '1 arquivo foi adicionado à resposta.' : `${enviadosNesteLote} arquivos foram adicionados à resposta.`,
          });
        }
      } finally {
        setUploading(false);
        setProgress(0);
        setUploadLabel('');
      }
    };

    const removeAt = (idx) => {
      const next = normalizeArquivosResposta(value).filter((_, i) => i !== idx);
      setVal(next);
    };

    return (
      <div className={`space-y-2 ${borderClass}`}>
        <div className="flex flex-wrap items-center gap-2">
          <Label className="text-gray-700 dark:text-gray-300">{pergunta.texto || '(sem texto)'}</Label>
          {obrigatoria && (
            <Badge variant="destructive" className="text-xs">
              Obrigatória
            </Badge>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_FILES}
          multiple
          className="hidden"
          onChange={handleFiles}
          disabled={disabled || uploading}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Enviando {uploadLabel ? `(${uploadLabel})` : ''}
                {progress > 0 ? ` ${progress}%` : ''}
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Escolher arquivos
              </>
            )}
          </Button>
        </div>
        {arquivos.length > 0 && (
          <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-2 list-none pl-0">
            {arquivos.map((fileVal, idx) => (
              <li key={`${fileVal.url}-${idx}`} className="flex flex-wrap items-center gap-2 border border-gray-200 dark:border-gray-600 rounded-md px-2 py-1.5">
                <span className="font-medium truncate flex-1 min-w-0">{fileVal.nome || 'Arquivo'}</span>
                <a
                  href={fileVal.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary inline-flex items-center gap-1 underline shrink-0"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Ver arquivo
                </a>
                {!disabled && (
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-red-600" onClick={() => removeAt(idx)} aria-label="Remover arquivo">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {showRequiredError && isRespostaVazia('arquivo', value) && <p className="text-xs text-red-500">Campo obrigatório</p>}
      </div>
    );
  }

  return null;
};

export default BriefingPerguntaResposta;
