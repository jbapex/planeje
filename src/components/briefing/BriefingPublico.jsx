import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import BriefingPerguntaResposta from '@/components/briefing/BriefingPerguntaResposta';
import {
  emptyRespostaForTipo,
  groupPerguntasOrdered,
  idsPerguntasObrigatoriasSemResposta,
  normalizePerguntasFromDb,
} from '@/lib/briefingQuestionUtils';

/** html/body usam overflow:hidden (index.css); esta página precisa do próprio scroll. */
function BriefingScrollShell({ children, className = '' }) {
  return (
    <div
      className={
        'h-[100dvh] w-full overflow-y-auto overflow-x-hidden overscroll-y-contain bg-gray-50 dark:bg-gray-900' +
        (className ? ` ${className}` : '')
      }
    >
      {children}
    </div>
  );
}

const BriefingPublico = () => {
  const { toast } = useToast();
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [briefing, setBriefing] = useState(null);
  const [empresa, setEmpresa] = useState('');
  const [respostas, setRespostas] = useState({});
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [missingRequiredIds, setMissingRequiredIds] = useState([]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setMissingRequiredIds([]);

    const { data: payload, error: rpcError } = await supabase.rpc('get_cliente_briefing_publico', {
      p_token: token,
    });

    if (rpcError || payload == null) {
      const { data: row, error: directError } = await supabase
        .from('cliente_briefings')
        .select('*')
        .eq('token', token)
        .maybeSingle();

      if (directError || !row) {
        setInvalid(true);
        setBriefing(null);
        setLoading(false);
        return;
      }

      setBriefing(row);
      setEmpresa('');
      setRespostas({ ...(row.respostas || {}) });
      setInvalid(false);
      setLoading(false);
      return;
    }

    const briefingJson = payload.briefing;
    const rawEmpresa = payload.empresa;

    if (!briefingJson || typeof briefingJson !== 'object' || !briefingJson.id) {
      setInvalid(true);
      setBriefing(null);
      setLoading(false);
      return;
    }

    const nomeEmpresa = rawEmpresa == null ? '' : String(rawEmpresa);

    setBriefing(briefingJson);
    setEmpresa(nomeEmpresa);
    setRespostas({ ...(briefingJson.respostas || {}) });
    setInvalid(false);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const perguntasNorm = useMemo(() => normalizePerguntasFromDb(briefing?.perguntas), [briefing?.perguntas]);
  const grouped = useMemo(() => groupPerguntasOrdered(perguntasNorm), [perguntasNorm]);

  const onRespostaChange = (id, val) => {
    const sid = String(id);
    setRespostas((prev) => ({ ...prev, [sid]: val }));
    setMissingRequiredIds((prev) => prev.filter((x) => x !== sid));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!briefing?.id) return;

    const nextRespostas = { ...respostas };
    for (const p of perguntasNorm) {
      const id = String(p.id);
      if (!(id in nextRespostas)) nextRespostas[id] = emptyRespostaForTipo(p.tipo);
    }

    const missing = idsPerguntasObrigatoriasSemResposta(perguntasNorm, nextRespostas);
    if (missing.length > 0) {
      setMissingRequiredIds(missing);
      toast({
        title: 'Campos obrigatórios',
        description: 'Preencha todos os campos destacados antes de enviar.',
        variant: 'destructive',
      });
      return;
    }
    setMissingRequiredIds([]);

    setSaving(true);
    const { data: okRpc, error: rpcErr } = await supabase.rpc('submit_cliente_briefing_publico', {
      p_token: token,
      p_respostas: nextRespostas,
    });

    if (!rpcErr && okRpc) {
      setSaving(false);
      setDone(true);
      return;
    }

    const { error } = await supabase
      .from('cliente_briefings')
      .update({
        respostas: nextRespostas,
        status: 'completo',
      })
      .eq('id', briefing.id);
    setSaving(false);
    if (error) {
      toast({
        title: 'Erro ao enviar',
        description: rpcErr?.message || error.message,
        variant: 'destructive',
      });
      return;
    }
    setDone(true);
  };

  if (loading) {
    return (
      <BriefingScrollShell className="flex items-center justify-center px-4">
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </BriefingScrollShell>
    );
  }

  if (invalid) {
    return (
      <BriefingScrollShell className="flex items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md dark:bg-gray-800 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="dark:text-white">Link inválido</CardTitle>
          </CardHeader>
        </Card>
      </BriefingScrollShell>
    );
  }

  if (done) {
    return (
      <BriefingScrollShell className="flex items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md dark:bg-gray-800 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="dark:text-white text-center">
              Obrigado! Suas respostas foram enviadas.
            </CardTitle>
          </CardHeader>
        </Card>
      </BriefingScrollShell>
    );
  }

  return (
    <BriefingScrollShell>
      <div className="max-w-2xl mx-auto space-y-6 py-10 px-4 pb-16">
        <div className="text-center space-y-1">
          <p className="text-xl font-semibold text-gray-900 dark:text-white">Planeje</p>
          {empresa && <p className="text-sm text-gray-600 dark:text-gray-400">{empresa}</p>}
        </div>

        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="dark:text-white">{briefing?.titulo || 'Briefing'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-8">
              {grouped.map(([categoria, lista]) => (
                <div key={categoria} className="space-y-6">
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-600 pb-1">
                    {categoria}
                  </h3>
                  {lista.map((p) => (
                    <BriefingPerguntaResposta
                      key={p.id}
                      pergunta={p}
                      value={respostas[String(p.id)]}
                      onChange={onRespostaChange}
                      briefingId={briefing.id}
                      showRequiredError={missingRequiredIds.includes(String(p.id))}
                      disabled={saving}
                    />
                  ))}
                </div>
              ))}
              <Button type="submit" className="w-full sm:w-auto" disabled={saving}>
                {saving ? 'Enviando...' : 'Enviar respostas'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </BriefingScrollShell>
  );
};

export default BriefingPublico;
