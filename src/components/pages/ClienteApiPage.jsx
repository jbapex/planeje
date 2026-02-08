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
import { Link2, Loader2, Radio, ArrowRight } from 'lucide-react';

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
      <div className="flex flex-col gap-6 w-full min-w-0 pb-10">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">API</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Configuração uazapi</p>
        </div>
        <p className="text-muted-foreground">Você não tem um cliente associado.</p>
      </div>
    );
  }

  if (isAdminWithoutCliente && clientesForAdmin.length === 0) {
    return (
      <div className="flex flex-col gap-6 w-full min-w-0 pb-10">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">API</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Configuração uazapi</p>
        </div>
        <p className="text-muted-foreground">Nenhum cliente com login encontrado. Selecione um cliente na área do cliente.</p>
      </div>
    );
  }

  const cardClass = 'dark:bg-gray-800/50 dark:border-gray-700/50 border border-gray-200/50 shadow-sm rounded-xl';
  const headerClass = 'p-3 sm:p-4';
  const titleClass = 'text-sm font-semibold dark:text-white';
  const descClass = 'text-xs text-muted-foreground dark:text-gray-400 mt-0.5';

  return (
    <>
      {!embeddedInCrm && <Helmet title="API - WhatsApp" />}
      <div className={embeddedInCrm ? 'flex flex-col gap-6 w-full min-w-0 pb-10' : 'flex flex-col gap-6 w-full min-w-0 pb-10 p-4 md:p-6 max-w-2xl mx-auto'}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              API
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Configure o subdomínio e o token da uazapi. Depois use a aba Canais para conectar o WhatsApp.
            </p>
          </div>
        </div>

        {isAdminWithoutCliente && (
          <Card className={cardClass}>
            <CardHeader className={headerClass}>
              <CardTitle className={titleClass}>Cliente</CardTitle>
              <CardDescription className={descClass}>Selecione o cliente para configurar a API</CardDescription>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 pt-0">
              <Select value={selectedClienteId || ''} onValueChange={(v) => setSelectedClienteId(v || null)}>
                <SelectTrigger className="h-10 rounded-lg border-gray-200 dark:border-gray-600">
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

        <Card className={cardClass}>
          <CardHeader className={headerClass}>
            <CardTitle className={`${titleClass} flex items-center gap-2`}>
              <Link2 className="h-5 w-5 text-violet-500 dark:text-violet-400" />
              Configuração uazapi
            </CardTitle>
            <CardDescription className={descClass}>
              Subdomínio em <code className="text-xs bg-muted dark:bg-muted/50 px-1.5 py-0.5 rounded">https://&lt;subdominio&gt;.uazapi.com</code> e token da instância.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 pt-0">
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground py-6">
                <Loader2 className="h-5 w-5 animate-spin" />
                Carregando…
              </div>
            ) : (
              <form onSubmit={handleSave} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="subdomain" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Subdomínio
                  </Label>
                  <Input
                    id="subdomain"
                    placeholder="meu-subdominio"
                    value={subdomain}
                    onChange={(e) => setSubdomain(e.target.value)}
                    autoComplete="off"
                    className="h-10 rounded-lg border-gray-200 dark:border-gray-600"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="token" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Token
                  </Label>
                  <Input
                    id="token"
                    type="password"
                    placeholder="Token da instância"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    autoComplete="off"
                    className="h-10 rounded-lg border-gray-200 dark:border-gray-600"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-violet-600 hover:bg-violet-700 text-white rounded-lg"
                >
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

        <div className="rounded-xl border border-slate-200/80 dark:border-gray-700/80 bg-slate-50/80 dark:bg-slate-800/30 px-4 py-3 flex flex-wrap items-center gap-2">
          <Radio className="h-4 w-4 text-slate-500 dark:text-slate-400 shrink-0" />
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Depois de salvar, vá em <strong>Canais</strong> para conectar o WhatsApp e gerar o QR code.
          </p>
          {onGoToCanais ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onGoToCanais}
              className="rounded-lg shrink-0 ml-auto"
            >
              Ir para Canais
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg shrink-0 ml-auto"
              asChild
            >
              <Link to={`${prefix}/crm`}>
                Ir para Canais
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </Link>
            </Button>
          )}
        </div>
      </div>
    </>
  );
};

export default ClienteApiPage;
