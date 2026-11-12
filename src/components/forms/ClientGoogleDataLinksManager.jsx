import React, { useCallback, useEffect, useState } from 'react';
import { Link2, Loader2, Plus, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { GOOGLE_DATA_SETTINGS_PATH, googleDataCredentialsMissingMessage } from '@/lib/googleDataAgency';
import { googleDataProductErrorCopy } from '@/lib/googleDataInsightsView';

async function invokeData(action) {
  const { data, error } = await supabase.functions.invoke('google-data-api', { body: { action } });
  if (error) throw error;
  return data;
}

const ClientGoogleDataLinksManager = ({ clientId, clientName }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [credentialsMissing, setCredentialsMissing] = useState(false);
  const [properties, setProperties] = useState([]);
  const [locations, setLocations] = useState([]);
  const [containers, setContainers] = useState([]);
  const [linkedGa, setLinkedGa] = useState([]);
  const [linkedBiz, setLinkedBiz] = useState([]);
  const [linkedGtm, setLinkedGtm] = useState([]);
  const [pickGa, setPickGa] = useState('');
  const [pickBiz, setPickBiz] = useState('');
  const [pickGtm, setPickGtm] = useState('');
  const [busy, setBusy] = useState('');
  const [hint, setHint] = useState('');

  const loadLinked = useCallback(async () => {
    if (!clientId) return;
    const [ga, biz, gtm] = await Promise.all([
      supabase.from('cliente_google_analytics_properties').select('*').eq('cliente_id', clientId).eq('is_active', true),
      supabase.from('cliente_google_business_locations').select('*').eq('cliente_id', clientId).eq('is_active', true),
      supabase.from('cliente_google_tag_containers').select('*').eq('cliente_id', clientId).eq('is_active', true),
    ]);
    if (ga.error) throw ga.error;
    if (biz.error) throw biz.error;
    if (gtm.error) throw gtm.error;
    setLinkedGa(ga.data || []);
    setLinkedBiz(biz.data || []);
    setLinkedGtm(gtm.data || []);
  }, [clientId]);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const check = await invokeData('check-connection');
      if (googleDataCredentialsMissingMessage(check)) {
        setCredentialsMissing(true);
        setHint('');
        return;
      }
      setCredentialsMissing(false);
      const [ga, biz, gtm] = await Promise.all([
        invokeData('list-analytics-properties'),
        invokeData('list-business-locations'),
        invokeData('list-tag-containers'),
      ]);
      setProperties(ga?.properties || []);
      setLocations(biz?.locations || []);
      setContainers(gtm?.containers || []);
      const notes = [
        ga?.error?.message ? `Analytics: ${googleDataProductErrorCopy(ga.error.message)}` : '',
        biz?.error?.message ? `Meu Negócio: ${googleDataProductErrorCopy(biz.error.message)}` : '',
        gtm?.error?.message ? `Tag Manager: ${googleDataProductErrorCopy(gtm.error.message)}` : '',
      ].filter(Boolean);
      setHint(notes.join(' '));
      await loadLinked();
    } catch (err) {
      setHint(err.message || 'Não foi possível ler o Google dados.');
    } finally {
      setLoading(false);
    }
  }, [loadLinked]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const linkGa = async () => {
    const row = properties.find((item) => item.id === pickGa);
    if (!row || !clientId) return;
    setBusy('ga');
    try {
      const { error } = await supabase.from('cliente_google_analytics_properties').insert({
        cliente_id: clientId,
        property_id: row.id,
        property_name: row.name,
        account_id: row.accountId,
        account_name: row.accountName,
        is_active: true,
      });
      if (error) throw error;
      setPickGa('');
      await loadLinked();
    } catch (err) {
      toast({ title: 'Analytics', description: err.message, variant: 'destructive' });
    } finally {
      setBusy('');
    }
  };

  const linkBiz = async () => {
    const row = locations.find((item) => item.name === pickBiz);
    if (!row || !clientId) return;
    setBusy('biz');
    try {
      const { error } = await supabase.from('cliente_google_business_locations').insert({
        cliente_id: clientId,
        location_name: row.name,
        location_title: row.title,
        account_name: row.accountName,
        is_active: true,
      });
      if (error) throw error;
      setPickBiz('');
      await loadLinked();
    } catch (err) {
      toast({ title: 'Meu Negócio', description: err.message, variant: 'destructive' });
    } finally {
      setBusy('');
    }
  };

  const linkGtm = async () => {
    const row = containers.find((item) => item.containerId === pickGtm);
    if (!row || !clientId) return;
    setBusy('gtm');
    try {
      const { error } = await supabase.from('cliente_google_tag_containers').insert({
        cliente_id: clientId,
        account_id: row.accountId,
        container_id: row.containerId,
        container_name: row.name,
        public_id: row.publicId,
        is_active: true,
      });
      if (error) throw error;
      setPickGtm('');
      await loadLinked();
    } catch (err) {
      toast({ title: 'Tag Manager', description: err.message, variant: 'destructive' });
    } finally {
      setBusy('');
    }
  };

  const unlink = async (table, id, title) => {
    setBusy(id);
    try {
      const { error } = await supabase.from(table).update({ is_active: false }).eq('id', id);
      if (error) throw error;
      await loadLinked();
    } catch (err) {
      toast({ title, description: err.message, variant: 'destructive' });
    } finally {
      setBusy('');
    }
  };

  if (!clientId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Link2 className="h-4 w-4" />
            Analytics, Meu Negócio e Tag Manager
          </CardTitle>
          <CardDescription>Salve o cliente primeiro para vincular.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (credentialsMissing) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Analytics, Meu Negócio e Tag Manager</CardTitle>
          <CardDescription>
            Autorize em <Link className="underline" to={GOOGLE_DATA_SETTINGS_PATH}>Configurações → Google dados</Link>.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const gaLeft = properties.filter((row) => !linkedGa.some((item) => item.property_id === row.id));
  const bizLeft = locations.filter((row) => !linkedBiz.some((item) => item.location_name === row.name));
  const gtmLeft = containers.filter((row) => !linkedGtm.some((item) => item.container_id === row.containerId));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Link2 className="h-4 w-4" />
          Analytics, Meu Negócio e Tag Manager
        </CardTitle>
        <CardDescription>
          Só {clientName || 'este cliente'}. Não liga o restante da carteira. Não mistura com a Meta.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}

        <div className="space-y-2">
          <p className="text-xs font-medium">Analytics (GA4)</p>
          {linkedGa.map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-2 text-sm">
              <span>{row.property_name || row.property_id}</span>
              <Button type="button" size="icon" variant="ghost" onClick={() => unlink('cliente_google_analytics_properties', row.id, 'Analytics')} disabled={busy === row.id}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {gaLeft.length ? (
            <div className="flex gap-2">
              <Select value={pickGa} onValueChange={setPickGa}>
                <SelectTrigger><SelectValue placeholder="Propriedade" /></SelectTrigger>
                <SelectContent>
                  {gaLeft.map((row) => (
                    <SelectItem key={row.id} value={row.id}>{row.accountName ? `${row.accountName} · ${row.name}` : row.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" onClick={linkGa} disabled={!pickGa || busy === 'ga'}>
                {busy === 'ga' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium">Meu Negócio</p>
          {linkedBiz.map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-2 text-sm">
              <span>{row.location_title || row.location_name}</span>
              <Button type="button" size="icon" variant="ghost" onClick={() => unlink('cliente_google_business_locations', row.id, 'Meu Negócio')} disabled={busy === row.id}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {bizLeft.length ? (
            <div className="flex gap-2">
              <Select value={pickBiz} onValueChange={setPickBiz}>
                <SelectTrigger><SelectValue placeholder="Ficha" /></SelectTrigger>
                <SelectContent>
                  {bizLeft.map((row) => (
                    <SelectItem key={row.name} value={row.name}>{row.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" onClick={linkBiz} disabled={!pickBiz || busy === 'biz'}>
                {busy === 'biz' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium">Tag Manager</p>
          {linkedGtm.map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-2 text-sm">
              <span>{row.public_id || row.container_name || row.container_id}</span>
              <Button type="button" size="icon" variant="ghost" onClick={() => unlink('cliente_google_tag_containers', row.id, 'Tag Manager')} disabled={busy === row.id}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {gtmLeft.length ? (
            <div className="flex gap-2">
              <Select value={pickGtm} onValueChange={setPickGtm}>
                <SelectTrigger><SelectValue placeholder="Contêiner" /></SelectTrigger>
                <SelectContent>
                  {gtmLeft.map((row) => (
                    <SelectItem key={row.containerId} value={row.containerId}>
                      {row.publicId ? `${row.publicId} · ${row.name}` : row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" onClick={linkGtm} disabled={!pickGtm || busy === 'gtm'}>
                {busy === 'gtm' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
};

export default ClientGoogleDataLinksManager;
