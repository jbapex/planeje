import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, Plus, Trash2, Share2 } from 'lucide-react';

const ContentPlatformsSettings = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [novoNome, setNovoNome] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('plataformas_conteudo')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('nome', { ascending: true });
    if (error) {
      toast({ title: 'Erro ao carregar', description: error.message, variant: 'destructive' });
      setRows([]);
    } else {
      setRows(data || []);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async () => {
    const nome = novoNome.trim();
    if (!nome) {
      toast({ title: 'Informe o nome da plataforma', variant: 'destructive' });
      return;
    }
    const maxOrder = rows.reduce((m, r) => Math.max(m, r.sort_order || 0), 0);
    const { error } = await supabase.from('plataformas_conteudo').insert({
      nome,
      sort_order: maxOrder + 10,
      ativo: true,
    });
    if (error) {
      toast({ title: 'Erro ao criar', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Plataforma adicionada' });
    setNovoNome('');
    load();
  };

  const patchRow = async (id, patch) => {
    setSavingId(id);
    const { error } = await supabase.from('plataformas_conteudo').update(patch).eq('id', id);
    setSavingId(null);
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      return;
    }
    load();
  };

  const handleDelete = async (id, nome) => {
    if (!window.confirm(`Remover a plataforma "${nome}"? Materiais/tarefas que já usam esse texto não são alterados.`)) return;
    const { error } = await supabase.from('plataformas_conteudo').delete().eq('id', id);
    if (error) {
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Plataforma removida' });
    load();
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-start gap-3">
        <Share2 className="h-8 w-8 text-muted-foreground shrink-0 mt-1" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Plataformas de conteúdo</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Opções exibidas em <strong>Materiais necessários</strong> (plano de campanha), calendário de conteúdo e no detalhe da tarefa.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nova plataforma</CardTitle>
          <CardDescription>Ex.: Instagram, TikTok, Site, Blog.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <div className="flex-1 space-y-1">
            <Label htmlFor="nova-plat">Nome</Label>
            <Input
              id="nova-plat"
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              placeholder="Instagram"
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
          </div>
          <Button type="button" onClick={handleAdd} disabled={loading}>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cadastradas</CardTitle>
          <CardDescription>Ordem menor aparece primeiro nos selects. Inativas ficam ocultas para usuários comuns.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum registro.</p>
          ) : (
            <ul className="space-y-3">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg border bg-card"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{r.nome}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">Ordem</Label>
                    <Input
                      type="number"
                      className="w-20 h-9"
                      defaultValue={r.sort_order}
                      key={`${r.id}-${r.sort_order}`}
                      onBlur={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (!Number.isFinite(v) || v === r.sort_order) return;
                        patchRow(r.id, { sort_order: v });
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={r.ativo}
                      onCheckedChange={(checked) => patchRow(r.id, { ativo: checked })}
                      disabled={savingId === r.id}
                    />
                    <span className="text-xs text-muted-foreground w-14">{r.ativo ? 'Ativa' : 'Oculta'}</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive shrink-0"
                    onClick={() => handleDelete(r.id, r.nome)}
                    aria-label={`Excluir ${r.nome}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ContentPlatformsSettings;
