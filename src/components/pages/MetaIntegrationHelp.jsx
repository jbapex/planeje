import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Terminal, Key, Link, Settings, Users, AlertTriangle } from 'lucide-react';

const MetaIntegrationHelp = () => {
  const redirectUri = `${window.location.origin}/paid-traffic`;

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
      <div className="space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white sm:text-5xl">
            Guia de Conexão com o Meta Ads
          </h1>
          <p className="mt-4 text-xl text-gray-600 dark:text-gray-300">
            Siga estes passos para configurar a integração usando um System User do Meta.
          </p>
        </div>

        <Alert className="dark:bg-blue-900/20 dark:border-blue-500/30">
          <Users className="h-4 w-4 dark:text-blue-400" />
          <AlertTitle className="dark:text-white">O que é um System User?</AlertTitle>
          <AlertDescription className="dark:text-blue-200">
            Um System User representa servidores ou softwares que fazem chamadas de API para gerenciar seus ativos de negócios no Meta. É a forma mais segura e robusta de conceder permissões programáticas à sua aplicação.
          </AlertDescription>
        </Alert>

        <Card className="dark:bg-gray-800/50">
          <CardHeader>
            <CardTitle className="dark:text-white">Passo 1: Crie um System User no seu Gerenciador de Negócios</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-700 dark:text-gray-300">
            <p>
              1. Acesse as <a href="https://business.facebook.com/settings/" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Configurações do Negócio</a> no Meta.
            </p>
            <p>
              2. No menu lateral, vá para <strong>Usuários &gt; Usuários do sistema</strong>.
            </p>
            <p>
              3. Clique em <strong>Adicionar</strong>. Dê um nome ao seu usuário (ex: "PlanejeOnline_API_Access") e defina a função como <strong>Admin</strong>.
            </p>
            <img alt="Tela de criação de System User no Meta Business Manager" src="https://images.unsplash.com/photo-1617854818583-09e7f077a156" />
          </CardContent>
        </Card>
        
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Ponto Crítico de Permissão!</AlertTitle>
          <AlertDescription>
            Mesmo com o token configurado corretamente, o erro "Acesso negado" geralmente ocorre porque o <strong>System User</strong> não foi atribuído diretamente à <strong>Conta de Anúncios</strong>. Siga o Passo 2 com atenção para resolver isso.
          </AlertDescription>
        </Alert>

        <Card className="dark:bg-gray-800/50">
          <CardHeader>
            <CardTitle className="dark:text-white">Passo 2: Atribua a Conta de Anúncio ao System User</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-700 dark:text-gray-300">
            <p>
              1. Após criar o usuário, clique em <strong>Atribuir Ativos</strong>.
            </p>
            <p>
              2. Na barra lateral esquerda da nova janela, selecione <strong>Contas de Anúncio</strong>.
            </p>
            <p>
              3. Na coluna do meio, selecione a conta de anúncio específica que você deseja gerenciar.
            </p>
             <p>
              4. Na coluna da direita, ative a opção de <strong>Controle Total</strong> (ou, no mínimo, "Gerenciar campanhas").
            </p>
            <p>
              5. Clique em <strong>Salvar alterações</strong>.
            </p>
            <img alt="Tela de atribuição de ativos para um System User" src="https://images.unsplash.com/photo-1617854818583-09e7f077a156" />
          </CardContent>
        </Card>

        <Card className="dark:bg-gray-800/50">
          <CardHeader>
            <CardTitle className="dark:text-white">Passo 3: Gere o Token de Acesso</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-gray-700 dark:text-gray-300">
            <p>
              1. Com o System User selecionado, clique em <strong>Gerar novo token</strong>.
            </p>
            <p>
              2. Selecione o aplicativo que você criou no Portal de Desenvolvedores do Meta.
            </p>
            <p>
              3. Marque as seguintes permissões (scopes): <code>ads_read</code>, <code>ads_management</code>, <code>business_management</code>, e <code>read_insights</code>.
            </p>
            <p>
              4. Clique em <strong>Gerar Token</strong>. Copie o token gerado. <strong>Este token é secreto e não será mostrado novamente!</strong>
            </p>
            <img alt="Tela de geração de token de acesso para um System User" src="https://images.unsplash.com/photo-1702047063975-0841a0621b5a" />
          </CardContent>
        </Card>

        <Card className="dark:bg-gray-800/50 border-green-500/50">
          <CardHeader>
            <CardTitle className="dark:text-white flex items-center gap-2"><Key className="text-green-400"/> Passo 4: Adicione o Token no Supabase Vault</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="dark:text-gray-300">
              Agora, vá para o seu projeto no <a href="https://supabase.com/" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Supabase</a>, acesse o <strong>SQL Editor</strong>, e depois o <strong>Vault</strong>. Adicione o seguinte segredo:
            </p>
            <Alert variant="default" className="dark:bg-gray-900">
              <Terminal className="h-4 w-4" />
              <AlertTitle className="dark:text-white">Segredo a Adicionar</AlertTitle>
              <AlertDescription>
                <div className="font-mono text-sm dark:text-gray-300">
                  <p><strong>Nome:</strong> <code className="bg-gray-700 text-yellow-300 px-1 rounded">META_SYSTEM_USER_ACCESS_TOKEN</code></p>
                  <p><strong>Valor:</strong> Cole o token de acesso que você gerou no passo anterior.</p>
                </div>
              </AlertDescription>
            </Alert>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Após salvar o segredo, a integração estará ativa! Os dados das suas contas de anúncio aparecerão automaticamente na aba "Meta Insights".
            </p>
          </CardContent>
        </Card>
        
        <Alert>
            <Settings className="h-4 w-4" />
            <AlertTitle>Ainda precisa de um App no Meta?</AlertTitle>
            <AlertDescription>
                Embora o fluxo de login do usuário tenha sido removido, você ainda precisa de um aplicativo criado no <a href="https://developers.facebook.com/" target="_blank" rel="noopener noreferrer" className="font-bold hover:underline">Portal de Desenvolvedores do Meta</a> para gerar o token do System User. Se você removeu os segredos antigos, precisará adicionar `META_APP_ID` e `META_APP_SECRET` novamente para associar o token ao app correto. A `META_REDIRECT_URI` não é mais necessária para este fluxo.
            </AlertDescription>
        </Alert>

      </div>
    </div>
  );
};

export default MetaIntegrationHelp;