import React, { useEffect, useState } from 'react';
import { Clock, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { normalizarAvisoEspera } from '@/lib/atendimentoAvisoEspera';

export default function AtendimentoAvisoEsperaCard({ clienteId }) {
  const { toast } = useToast();
  const [habilitado, setHabilitado] = useState(true);
  const [primeiro, setPrimeiro] = useState('10');
  const [repetir, setRepetir] = useState('10');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!clienteId) return undefined;
    let cancel = false;
    setLoading(true);
    supabase
      .from('atendimento_aviso_espera')
      .select('habilitado, primeiro_minutos, repetir_minutos')
      .eq('cliente_id', clienteId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancel) return;
        setLoading(false);
        if (error) return;
        const cfg = normalizarAvisoEspera(data);
        setHabilitado(cfg.habilitado);
        setPrimeiro(String(cfg.primeiroMinutos));
        setRepetir(String(cfg.repetirMinutos));
      });
    return () => {
      cancel = true;
    };
  }, [clienteId]);

  const salvar = async () => {
    if (!clienteId) return;
    const cfg = normalizarAvisoEspera({
      habilitado,
      primeiro_minutos: primeiro,
      repetir_minutos: repetir,
    });
    setSaving(true);
    const { error } = await supabase.from('atendimento_aviso_espera').upsert({
      cliente_id: clienteId,
      habilitado: cfg.habilitado,
      primeiro_minutos: cfg.primeiroMinutos,
      repetir_minutos: cfg.repetirMinutos,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Não salvou o aviso', description: error.message });
      return;
    }
    setPrimeiro(String(cfg.primeiroMinutos));
    setRepetir(String(cfg.repetirMinutos));
    toast({ title: 'Aviso de espera salvo' });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Aviso de espera
        </CardTitle>
        <CardDescription>
          Vale só para grupos. O popup e a Minha caixa mostram o nome do grupo e quem assumiu.
          Não envia WhatsApp.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando…
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
              <Label htmlFor="aviso-espera-ligado" className="font-medium">Aviso ligado</Label>
              <Switch
                id="aviso-espera-ligado"
                checked={habilitado}
                onCheckedChange={setHabilitado}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="aviso-espera-primeiro">Primeiro aviso (minutos)</Label>
                <Input
                  id="aviso-espera-primeiro"
                  type="number"
                  min={1}
                  max={240}
                  value={primeiro}
                  onChange={(e) => setPrimeiro(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="aviso-espera-repetir">Repetir a cada (minutos)</Label>
                <Input
                  id="aviso-espera-repetir"
                  type="number"
                  min={1}
                  max={240}
                  value={repetir}
                  onChange={(e) => setRepetir(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Com {primeiro || '10'} e {repetir || '10'}, o aviso abre nesse tempo e volta com o tempo atualizado até alguém responder.
              Fechar o popup só adia até a próxima cobrança. Sem responsável, a equipe inteira vê.
            </p>
            <Button type="button" onClick={salvar} disabled={saving || !clienteId}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar aviso'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
