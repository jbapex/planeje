import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, Copy, FileSpreadsheet, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import BriefingPerguntaResposta from '@/components/briefing/BriefingPerguntaResposta';
import {
  CATEGORIAS,
  normalizePerguntasFromDb,
  groupPerguntasOrdered,
  pruneRespostas,
  resolveTipoPergunta,
  validateDefinicaoPerguntas,
  importPerguntasFromBriefingCsvText,
} from '@/lib/briefingQuestionUtils';

const TIPO_OPTIONS = [
  { value: 'texto', label: 'Texto livre' },
  { value: 'multipla_escolha', label: 'Múltipla escolha (uma opção)' },
  { value: 'multipla_selecao', label: 'Múltipla seleção (várias opções)' },
  { value: 'arquivo', label: 'Upload de arquivo' },
  { value: 'link', label: 'Link / URL' },
];

const DEFAULT_PERGUNTAS = [
  { id: '1', texto: 'O que a empresa vende ou oferece?', categoria: 'Empresa', tipo: 'texto', obrigatorio: false, opcoes: [] },
  { id: '2', texto: 'Qual o principal diferencial em relação à concorrência?', categoria: 'Empresa', tipo: 'texto', obrigatorio: false, opcoes: [] },
  { id: '3', texto: 'Há quanto tempo está no mercado?', categoria: 'Empresa', tipo: 'texto', obrigatorio: false, opcoes: [] },
  { id: '4', texto: 'Descreva o cliente ideal (idade, perfil, comportamento)', categoria: 'Público-alvo', tipo: 'texto', obrigatorio: false, opcoes: [] },
  { id: '5', texto: 'Qual problema você resolve para esse cliente?', categoria: 'Público-alvo', tipo: 'texto', obrigatorio: false, opcoes: [] },
  { id: '6', texto: 'Onde esse público passa o tempo online?', categoria: 'Público-alvo', tipo: 'texto', obrigatorio: false, opcoes: [] },
  { id: '7', texto: 'Como a marca quer ser percebida?', categoria: 'Comunicação', tipo: 'texto', obrigatorio: false, opcoes: [] },
  { id: '8', texto: 'O que NÃO pode aparecer na comunicação?', categoria: 'Comunicação', tipo: 'texto', obrigatorio: false, opcoes: [] },
  { id: '9', texto: 'Tem alguma marca que admira? Por quê?', categoria: 'Comunicação', tipo: 'texto', obrigatorio: false, opcoes: [] },
  { id: '10', texto: 'Qual o principal objetivo com as redes sociais?', categoria: 'Objetivos', tipo: 'texto', obrigatorio: false, opcoes: [] },
  { id: '11', texto: 'Quem vai aparecer nos vídeos ou fotos?', categoria: 'Objetivos', tipo: 'texto', obrigatorio: false, opcoes: [] },
  { id: '12', texto: 'Como você mede sucesso nas redes?', categoria: 'Objetivos', tipo: 'texto', obrigatorio: false, opcoes: [] },
];

function clonePerguntas(list) {
  return list.map((p) => ({ ...p, opcoes: Array.isArray(p.opcoes) ? [...p.opcoes] : [] }));
}

function statusBadgeVariant(status) {
  if (status === 'completo') return 'success';
  if (status === 'enviado') return 'warning';
  return 'secondary';
}

function statusLabel(status) {
  const s = (status || 'rascunho').toLowerCase();
  if (s === 'rascunho') return 'Rascunho';
  if (s === 'enviado') return 'Enviado';
  if (s === 'completo') return 'Completo';
  return status || '—';
}

function formatBriefingDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const day = String(d.getDate()).padStart(2, '0');
  return `${day} ${meses[d.getMonth()]} ${d.getFullYear()}`;
}

function publicBriefingUrl(token) {
  if (!token) return '';
  return `${window.location.origin}/#/b/${token}`;
}

const ClienteBriefing = ({ clienteId, ownerId: ownerIdProp }) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const ownerId = ownerIdProp || user?.id;
  const csvInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState('lista');
  const [editorKind, setEditorKind] = useState('create');
  const [briefings, setBriefings] = useState([]);
  const [briefing, setBriefing] = useState(null);
  const [briefingToDelete, setBriefingToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [draftTitulo, setDraftTitulo] = useState('Briefing');
  const [draftPerguntas, setDraftPerguntas] = useState(() => clonePerguntas(DEFAULT_PERGUNTAS));

  const [respostasLocal, setRespostasLocal] = useState({});
  const [saving, setSaving] = useState(false);

  const loadBriefings = useCallback(async () => {
    if (!clienteId) {
      setBriefings([]);
      setLoading(false);
      return [];
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('cliente_briefings')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: false });

    setLoading(false);

    if (error) {
      toast({
        title: 'Erro ao carregar briefings',
        description: error.message,
        variant: 'destructive',
      });
      setBriefings([]);
      return [];
    }

    const rows = data || [];
    setBriefings(rows);
    return rows;
  }, [clienteId, toast]);

  useEffect(() => {
    loadBriefings();
  }, [loadBriefings]);

  const perguntasNormalizadas = useMemo(
    () => normalizePerguntasFromDb(briefing?.perguntas),
    [briefing?.perguntas]
  );

  const groupedPanel = useMemo(
    () => groupPerguntasOrdered(perguntasNormalizadas),
    [perguntasNormalizadas]
  );

  const handleVoltarLista = () => {
    setVista('lista');
  };

  const startCreate = () => {
    setBriefing(null);
    setDraftTitulo('Briefing');
    setDraftPerguntas(clonePerguntas(DEFAULT_PERGUNTAS));
    setEditorKind('create');
    setVista('editor');
  };

  const openBriefing = (b) => {
    setBriefing(b);
    setRespostasLocal({ ...(b.respostas || {}) });
    setVista('painel');
  };

  const startEditQuestions = () => {
    if (!briefing) return;
    setDraftTitulo(briefing.titulo || 'Briefing');
    const norm = normalizePerguntasFromDb(briefing.perguntas);
    const pq = norm.length > 0 ? clonePerguntas(norm) : clonePerguntas(DEFAULT_PERGUNTAS);
    setDraftPerguntas(pq);
    setEditorKind('edit');
    setVista('editor');
  };

  const moveQuestion = (index, direction) => {
    setDraftPerguntas((prev) => {
      const next = [...prev];
      const j = index + direction;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  };

  const updateQuestion = (index, field, value) => {
    setDraftPerguntas((prev) => {
      const next = [...prev];
      const cur = { ...next[index], [field]: value };
      if (field === 'tipo' && value !== 'multipla_escolha' && value !== 'multipla_selecao') {
        cur.opcoes = [];
      }
      next[index] = cur;
      return next;
    });
  };

  const removeQuestion = (index) => {
    setDraftPerguntas((prev) => prev.filter((_, i) => i !== index));
  };

  const addQuestion = () => {
    setDraftPerguntas((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        texto: '',
        categoria: 'Empresa',
        tipo: 'texto',
        obrigatorio: false,
        opcoes: [],
      },
    ]);
  };

  const addOpcao = (index) => {
    setDraftPerguntas((prev) => {
      const next = [...prev];
      const op = [...(next[index].opcoes || []), ''];
      next[index] = { ...next[index], opcoes: op };
      return next;
    });
  };

  const updateOpcao = (qIndex, oIndex, value) => {
    setDraftPerguntas((prev) => {
      const next = [...prev];
      const op = [...(next[qIndex].opcoes || [])];
      op[oIndex] = value;
      next[qIndex] = { ...next[qIndex], opcoes: op };
      return next;
    });
  };

  const removeOpcao = (qIndex, oIndex) => {
    setDraftPerguntas((prev) => {
      const next = [...prev];
      const op = (next[qIndex].opcoes || []).filter((_, i) => i !== oIndex);
      next[qIndex] = { ...next[qIndex], opcoes: op };
      return next;
    });
  };

  const handleImportCsvClick = () => {
    csvInputRef.current?.click();
  };

  const handleCsvFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const result = importPerguntasFromBriefingCsvText(text);
      if (!result.ok) {
        toast({
          title: 'Erro no CSV',
          description: `Linha ${result.line}: ${result.message}`,
          variant: 'destructive',
        });
        return;
      }
      if (result.perguntas.length === 0) {
        toast({
          title: 'Nada para importar',
          description: 'O arquivo não contém linhas de dados além do cabeçalho.',
          variant: 'destructive',
        });
        return;
      }
      setDraftPerguntas((prev) => [...prev, ...clonePerguntas(result.perguntas)]);
      toast({
        title: `${result.perguntas.length} perguntas importadas`,
        description: 'As perguntas foram adicionadas ao final da lista.',
      });
    } catch (err) {
      toast({
        title: 'Erro ao ler arquivo',
        description: err?.message || 'Não foi possível ler o CSV.',
        variant: 'destructive',
      });
    }
  };

  const buildPerguntasPayload = () =>
    draftPerguntas.map((p) => {
      const tipo = resolveTipoPergunta(p);
      const opcoes =
        tipo === 'multipla_escolha' || tipo === 'multipla_selecao'
          ? (p.opcoes || []).map((o) => String(o ?? '').trim()).filter(Boolean)
          : [];
      return {
        id: String(p.id),
        texto: (p.texto || '').trim(),
        categoria: CATEGORIAS.includes(p.categoria) ? p.categoria : 'Outros',
        tipo,
        obrigatorio: Boolean(p.obrigatorio),
        opcoes,
      };
    });

  const handleSaveNewBriefing = async () => {
    if (!ownerId) {
      toast({
        title: 'Não foi possível criar',
        description: 'Defina um responsável (owner) para o briefing.',
        variant: 'destructive',
      });
      return;
    }

    const perguntasNorm = buildPerguntasPayload();
    const def = validateDefinicaoPerguntas(draftPerguntas);
    if (!def.ok) {
      toast({
        title: 'Perguntas incompletas',
        description:
          def.reason === 'opcoes'
            ? 'Perguntas de múltipla escolha/seleção precisam de pelo menos duas opções.'
            : 'Preencha o texto de todas as perguntas ou remova as vazias.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    const { data, error } = await supabase
      .from('cliente_briefings')
      .insert({
        cliente_id: clienteId,
        owner_id: ownerId,
        titulo: (draftTitulo || 'Briefing').trim(),
        status: 'rascunho',
        perguntas: perguntasNorm,
        respostas: {},
        token: crypto.randomUUID(),
      })
      .select('*')
      .single();

    setSaving(false);

    if (error) {
      toast({ title: 'Erro ao salvar briefing', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Briefing criado', description: 'Rascunho salvo com sucesso.' });
    await loadBriefings();
    if (data) {
      setBriefing(data);
      setRespostasLocal({ ...(data.respostas || {}) });
      setVista('painel');
    } else {
      setVista('lista');
    }
  };

  const handleSaveQuestionsEdit = async () => {
    if (!briefing?.id) return;

    const perguntasNorm = buildPerguntasPayload();
    const def = validateDefinicaoPerguntas(draftPerguntas);
    if (!def.ok) {
      toast({
        title: 'Perguntas incompletas',
        description:
          def.reason === 'opcoes'
            ? 'Perguntas de múltipla escolha/seleção precisam de pelo menos duas opções.'
            : 'Preencha o texto de todas as perguntas ou remova as vazias.',
        variant: 'destructive',
      });
      return;
    }

    const mergedRespostas = pruneRespostas(briefing.respostas, perguntasNorm);

    setSaving(true);
    const { data, error } = await supabase
      .from('cliente_briefings')
      .update({
        titulo: (draftTitulo || 'Briefing').trim(),
        perguntas: perguntasNorm,
        respostas: mergedRespostas,
      })
      .eq('id', briefing.id)
      .select('*')
      .single();

    setSaving(false);

    if (error) {
      toast({ title: 'Erro ao atualizar perguntas', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Perguntas atualizadas' });
    await loadBriefings();
    if (data) {
      setBriefing(data);
      setRespostasLocal({ ...(data.respostas || {}) });
    }
    setVista('painel');
  };

  const copyBriefingLink = async (b) => {
    if (!b?.token) {
      toast({
        title: 'Token indisponível',
        description: 'Não foi possível gerar o link público.',
        variant: 'destructive',
      });
      return;
    }
    const url = publicBriefingUrl(b.token);
    await navigator.clipboard.writeText(url);
    toast({ title: 'Link copiado!', description: 'URL pública copiada para a área de transferência.' });
  };

  const handleSaveRespostas = async () => {
    if (!briefing?.id) return;
    setSaving(true);
    const { data, error } = await supabase
      .from('cliente_briefings')
      .update({
        respostas: { ...respostasLocal },
        status: 'completo',
      })
      .eq('id', briefing.id)
      .select('*')
      .single();
    setSaving(false);
    if (error) {
      toast({ title: 'Erro ao salvar respostas', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Respostas salvas', description: 'Status definido como completo.' });
    await loadBriefings();
    if (data) setBriefing(data);
  };

  const handleMarcarEnviado = async () => {
    if (!briefing?.id) return;
    setSaving(true);
    const { data, error } = await supabase
      .from('cliente_briefings')
      .update({ status: 'enviado' })
      .eq('id', briefing.id)
      .select('*')
      .single();
    setSaving(false);
    if (error) {
      toast({ title: 'Erro ao atualizar status', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Marcado como enviado' });
    await loadBriefings();
    if (data) setBriefing(data);
  };

  const confirmDeleteBriefing = async () => {
    const id = briefingToDelete?.id;
    if (!id) return;
    setDeleting(true);
    const { error } = await supabase.from('cliente_briefings').delete().eq('id', id);
    setDeleting(false);
    setBriefingToDelete(null);

    if (error) {
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Briefing excluído' });
    if (briefing?.id === id) {
      setBriefing(null);
      setVista('lista');
    }
    await loadBriefings();
  };

  const onRespostaChange = (id, val) => {
    setRespostasLocal((prev) => ({ ...prev, [String(id)]: val }));
  };

  const renderQuestionEditor = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="briefing-titulo">Título do briefing</Label>
        <Input
          id="briefing-titulo"
          value={draftTitulo}
          onChange={(e) => setDraftTitulo(e.target.value)}
          className="dark:bg-gray-700 dark:text-white dark:border-gray-600"
        />
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>Perguntas</Label>
          <div className="flex flex-wrap gap-2">
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              aria-hidden
              onChange={handleCsvFileChange}
            />
            <Button type="button" variant="outline" size="sm" onClick={handleImportCsvClick}>
              <FileSpreadsheet className="h-4 w-4 mr-1.5" />
              Importar CSV
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={addQuestion}>
              Adicionar pergunta
            </Button>
          </div>
        </div>
        {draftPerguntas.map((p, index) => {
          const tipo = resolveTipoPergunta(p);
          return (
            <div
              key={`${p.id}-${index}`}
              className="flex flex-col gap-3 rounded-lg border border-gray-200 dark:border-gray-600 p-3 bg-white dark:bg-gray-800/50"
            >
              <div className="flex flex-wrap gap-2 items-start">
                <div className="flex-1 min-w-[200px] space-y-1">
                  <Label className="text-xs text-muted-foreground">Texto</Label>
                  <Input
                    value={p.texto}
                    onChange={(e) => updateQuestion(index, 'texto', e.target.value)}
                    placeholder="Digite a pergunta"
                    className="dark:bg-gray-700 dark:text-white dark:border-gray-600"
                  />
                </div>
                <div className="w-full sm:w-48 space-y-1">
                  <Label className="text-xs text-muted-foreground">Categoria</Label>
                  <Select value={p.categoria} onValueChange={(v) => updateQuestion(index, 'categoria', v)}>
                    <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                      {CATEGORIAS.map((c) => (
                        <SelectItem key={c} value={c} className="dark:text-white dark:hover:bg-gray-600">
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-full sm:w-52 space-y-1">
                  <Label className="text-xs text-muted-foreground">Tipo</Label>
                  <Select value={tipo} onValueChange={(v) => updateQuestion(index, 'tipo', v)}>
                    <SelectTrigger className="dark:bg-gray-700 dark:text-white dark:border-gray-600">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="dark:bg-gray-700 dark:border-gray-600">
                      {TIPO_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value} className="dark:text-white dark:hover:bg-gray-600">
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 pt-6 sm:pt-8 shrink-0">
                  <Checkbox
                    checked={Boolean(p.obrigatorio)}
                    onCheckedChange={(c) => updateQuestion(index, 'obrigatorio', c === true)}
                  />
                  Obrigatória
                </label>
                <div className="flex gap-1 items-end ml-auto">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => moveQuestion(index, -1)}
                    disabled={index === 0}
                    aria-label="Mover para cima"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => moveQuestion(index, 1)}
                    disabled={index === draftPerguntas.length - 1}
                    aria-label="Mover para baixo"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-destructive"
                    onClick={() => removeQuestion(index)}
                    aria-label="Remover pergunta"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {(tipo === 'multipla_escolha' || tipo === 'multipla_selecao') && (
                <div className="space-y-2 pl-0 sm:pl-1 border-t border-gray-200 dark:border-gray-600 pt-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Opções</Label>
                    <Button type="button" variant="outline" size="sm" onClick={() => addOpcao(index)}>
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Adicionar opção
                    </Button>
                  </div>
                  {(p.opcoes || []).map((op, oi) => (
                    <div key={oi} className="flex gap-2 items-center">
                      <Input
                        value={op}
                        onChange={(e) => updateOpcao(index, oi, e.target.value)}
                        placeholder={`Opção ${oi + 1}`}
                        className="dark:bg-gray-700 dark:text-white dark:border-gray-600 flex-1"
                      />
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeOpcao(index, oi)} aria-label="Remover opção">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={editorKind === 'create' ? handleSaveNewBriefing : handleSaveQuestionsEdit} disabled={saving}>
          {editorKind === 'create' ? 'Salvar briefing' : 'Salvar alterações'}
        </Button>
        <Button type="button" variant="outline" onClick={handleVoltarLista} disabled={saving}>
          Voltar
        </Button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardContent className="pt-6 text-sm text-muted-foreground">Carregando briefings...</CardContent>
      </Card>
    );
  }

  if (vista === 'lista') {
    return (
      <>
        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between space-y-0">
            <CardTitle className="text-lg dark:text-white">Briefings</CardTitle>
            <Button type="button" onClick={startCreate} className="sm:shrink-0 w-full sm:w-auto">
              Novo briefing
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {briefings.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
                <p className="text-sm text-muted-foreground">Nenhum briefing criado</p>
                <Button type="button" onClick={startCreate}>
                  Criar primeiro briefing
                </Button>
              </div>
            ) : (
              <div className="grid gap-3">
                {briefings.map((b) => (
                  <Card key={b.id} className="dark:bg-gray-900/40 dark:border-gray-600 border-gray-200">
                    <CardContent className="pt-4 pb-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-2 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-base dark:text-white truncate">{b.titulo || 'Briefing'}</h3>
                            <Badge variant={statusBadgeVariant(b.status)}>{statusLabel(b.status)}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">Criado em {formatBriefingDate(b.created_at)}</p>
                        </div>
                        <div className="flex flex-wrap gap-2 shrink-0">
                          <Button type="button" size="sm" variant="default" onClick={() => openBriefing(b)}>
                            Abrir
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => copyBriefingLink(b)}>
                            <Copy className="h-4 w-4 sm:mr-1.5" />
                            <span className="hidden sm:inline">Copiar link</span>
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setBriefingToDelete(b)}
                          >
                            <Trash2 className="h-4 w-4 sm:mr-1.5" />
                            <span className="hidden sm:inline">Excluir</span>
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <AlertDialog open={!!briefingToDelete} onOpenChange={(open) => !open && !deleting && setBriefingToDelete(null)}>
          <AlertDialogContent className="dark:bg-gray-900 dark:border-gray-600">
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir briefing?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita. O briefing &quot;{briefingToDelete?.titulo || 'Sem título'}&quot; será removido
                permanentemente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={(ev) => {
                  ev.preventDefault();
                  confirmDeleteBriefing();
                }}
                disabled={deleting}
              >
                {deleting ? 'Excluindo…' : 'Excluir'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  if (vista === 'editor') {
    return (
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between space-y-0">
          <div className="flex items-center gap-2 min-w-0">
            <Button type="button" variant="ghost" size="icon" onClick={handleVoltarLista} disabled={saving} aria-label="Voltar para lista">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <CardTitle className="text-base dark:text-white truncate">
              {editorKind === 'create' ? 'Novo briefing' : 'Editar perguntas'}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>{renderQuestionEditor()}</CardContent>
      </Card>
    );
  }

  if (!briefing) {
    return (
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground mb-3">Briefing não encontrado.</p>
          <Button type="button" variant="outline" onClick={handleVoltarLista}>
            Voltar para lista
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="dark:bg-gray-800 dark:border-gray-700">
      <CardHeader className="flex flex-col gap-3 space-y-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <Button type="button" variant="ghost" size="icon" onClick={handleVoltarLista} disabled={saving} className="shrink-0 mt-0.5" aria-label="Voltar para lista">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-lg dark:text-white">{briefing.titulo || 'Briefing'}</CardTitle>
                <Badge variant={statusBadgeVariant(briefing.status)}>{statusLabel(briefing.status)}</Badge>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <Button type="button" variant="outline" size="sm" onClick={() => copyBriefingLink(briefing)}>
              <Copy className="h-4 w-4 mr-2" />
              Copiar link do cliente
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={startEditQuestions}>
              Editar perguntas
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {perguntasNormalizadas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma pergunta encontrada neste briefing. Clique em &quot;Editar perguntas&quot; para cadastrar.
          </p>
        ) : (
          groupedPanel.map(([categoria, lista]) => (
            <div key={categoria} className="space-y-3">
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-600 pb-1">
                {categoria}
              </h4>
              <div className="space-y-6">
                {lista.map((p) => (
                  <BriefingPerguntaResposta
                    key={p.id}
                    pergunta={p}
                    value={respostasLocal[String(p.id)]}
                    onChange={onRespostaChange}
                    briefingId={briefing.id}
                    showRequiredError={false}
                    disabled={saving}
                  />
                ))}
              </div>
            </div>
          ))
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          <Button type="button" onClick={handleSaveRespostas} disabled={saving}>
            Salvar respostas
          </Button>
          <Button type="button" variant="outline" onClick={handleMarcarEnviado} disabled={saving}>
            Marcar como enviado
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ClienteBriefing;
