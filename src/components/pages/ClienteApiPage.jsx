import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useClienteWhatsAppConfig } from '@/hooks/useClienteWhatsAppConfig';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Link2, Loader2 } from 'lucide-react';

const getRoutePrefix = (profile) => {
  if (profile?.role === 'cliente' && profile?.cliente_id) return '/cliente';
  return '/client-area';
};

const ClienteApiPage = ({ onGoToCanais, embeddedInCrm }) => {
  const { profile } = useAuth();
  const prefix = getRoutePrefix(profile);
  const {
    effectiveClienteId,
    config,
    loading,
    saving,
    saveConfig,
    isAdminWithoutCliente,
    selectedClienteId,
    setSelectedClienteId,
    clientesForAdmin,
  } = useClienteWhatsAppConfig();

  const [subdomain, setSubdomain] = useState('');
  const [token, setToken] = useState('');

  useEffect(() => {
    if (config) {
      setSubdomain(config.subdomain || '');
      setToken(config.token || '');
    } else {
      setSubdomain('');
      setToken('');
    }
  }, [config]);

  const handleSave = async (e) => {
    e.preventDefault();
    await saveConfig(subdomain, token);
  };

  if (!effectiveClienteId && !isAdminWithoutCliente) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto">
        <p className="text-muted-foreground">Você não tem um cliente associado.</p>
      </div>
    );
  }

  if (isAdminWithoutCliente && clientesForAdmin.length === 0) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto">
        <p className="text-muted-foreground">Nenhum cliente com login encontrado. Selecione um cliente na área do cliente.</p>
      </div>
    );
  }

  return (
    <>
      {!embeddedInCrm && <Helmet title="API - WhatsApp" />}
      <div className={`space-y-6 ${!embeddedInCrm ? 'p-4 md:p-6 max-w-2xl mx-auto' : ''}`}>
        {!embeddedInCrm && (
          <div>
            <h1 className="text-xl font-semibold">API</h1>
            <p className="text-sm text-muted-foreground">
              Configure a URL (subdomínio) e o token da uazapi para este cliente. Use na aba Canais para conectar o WhatsApp.
            </p>
          </div>
        )}

        {isAdminWithoutCliente && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Cliente</CardTitle>
              <CardDescription>Selecione o cliente para configurar a API</CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={selectedClienteId || ''} onValueChange={(v) => setSelectedClienteId(v || null)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clientesForAdmin.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.empresa || c.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Configuração uazapi
            </CardTitle>
            <CardDescription>
              Subdomínio em <code className="text-xs bg-muted px-1 rounded">https://&lt;subdominio&gt;.uazapi.com</code> e token da instância.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando…
              </div>
            ) : (
              <form onSubmit={handleSave} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="subdomain">Subdomínio</Label>
                  <Input
                    id="subdomain"
                    placeholder="meu-subdominio"
                    value={subdomain}
                    onChange={(e) => setSubdomain(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="token">Token</Label>
                  <Input
                    id="token"
                    type="password"
                    placeholder="Token da instância"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <Button type="submit" disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Salvando…
                    </>
                  ) : (
                    'Salvar'
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="text-sm text-muted-foreground">
          Depois de salvar, {onGoToCanais ? (
            <Button variant="link" className="p-0 h-auto text-primary underline" onClick={onGoToCanais}>vá na aba Canais</Button>
          ) : (
            <Link to={`${prefix}/crm`} className="text-primary underline">vá no CRM na aba Canais</Link>
          )}{' '}
          para conectar o WhatsApp e gerar o QR code.
        </p>
      </div>
    </>
  );
};

export default ClienteApiPage;
