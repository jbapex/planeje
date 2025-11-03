import React from 'react';
import { Helmet } from 'react-helmet';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

const PrivacyPolicy = () => {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-6 md:p-8">
            <Helmet>
                <title>Política de Privacidade - JB APEX</title>
                <meta name="description" content="Política de Privacidade do sistema JB APEX." />
            </Helmet>
            <div className="max-w-4xl mx-auto">
                <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4 dark:text-white dark:hover:bg-gray-800">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar
                </Button>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 md:p-10">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Política de Privacidade</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Última atualização: 10 de Outubro de 2025</p>

                    <div className="prose prose-lg dark:prose-invert max-w-none text-gray-600 dark:text-gray-300 space-y-4">
                        <p>Bem-vindo à JB APEX. A sua privacidade é importante para nós.</p>
                        
                        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">1. Informações que Coletamos</h2>
                        <p>Coletamos informações que você nos fornece diretamente, como quando cria uma conta, preenche um formulário ou se comunica conosco. Isso pode incluir seu nome, e-mail e outras informações de contato.</p>

                        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">2. Como Usamos Suas Informações</h2>
                        <p>Usamos as informações que coletamos para operar, manter e fornecer os recursos e a funcionalidade do nosso serviço, para nos comunicarmos com você e para personalizar sua experiência.</p>

                        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">3. Compartilhamento de Informações</h2>
                        <p>Não compartilhamos suas informações pessoais com terceiros, exceto conforme descrito nesta política ou se tivermos obtido seu consentimento.</p>

                        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">4. Integração com o Meta (Facebook)</h2>
                        <p>Se você optar por conectar sua conta do Meta, poderemos coletar informações do seu perfil do Meta, como nome e e-mail, para facilitar o login e a integração. Também podemos solicitar permissões para acessar dados de suas campanhas do Meta Ads para exibi-los em nossa plataforma. Esses dados são usados exclusivamente para fornecer os recursos de gestão de tráfego e não são compartilhados.</p>

                        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">5. Segurança</h2>
                        <p>Tomamos medidas razoáveis para proteger suas informações contra perda, roubo, uso indevido e acesso não autorizado.</p>

                        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">6. Contato</h2>
                        <p>Se você tiver alguma dúvida sobre esta Política de Privacidade, entre em contato conosco pelo e-mail: jbcomerc@gmail.com.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PrivacyPolicy;