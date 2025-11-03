import React from 'react';
import { Helmet } from 'react-helmet';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

const TermsOfService = () => {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-6 md:p-8">
            <Helmet>
                <title>Termos de Serviço - JB APEX</title>
                <meta name="description" content="Termos de Serviço do sistema JB APEX." />
            </Helmet>
            <div className="max-w-4xl mx-auto">
                <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4 dark:text-white dark:hover:bg-gray-800">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar
                </Button>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 md:p-10">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Termos de Serviço</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Última atualização: 10 de Outubro de 2025</p>

                    <div className="prose prose-lg dark:prose-invert max-w-none text-gray-600 dark:text-gray-300 space-y-4">
                        <p>Ao usar o sistema JB APEX, você concorda com estes Termos de Serviço.</p>
                        
                        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">1. Uso da Plataforma</h2>
                        <p>Você concorda em usar nossa plataforma apenas para fins legais e de acordo com estes Termos. Você é responsável por manter a confidencialidade de sua conta e senha.</p>

                        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">2. Propriedade Intelectual</h2>
                        <p>A plataforma e seu conteúdo original, recursos e funcionalidades são e permanecerão propriedade exclusiva da JB APEX e de seus licenciadores.</p>

                        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">3. Rescisão</h2>
                        <p>Podemos rescindir ou suspender seu acesso à nossa plataforma imediatamente, sem aviso prévio ou responsabilidade, por qualquer motivo, incluindo, sem limitação, se você violar os Termos.</p>

                        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">4. Limitação de Responsabilidade</h2>
                        <p>Em nenhuma circunstância a JB APEX, nem seus diretores ou funcionários, serão responsáveis por quaisquer danos indiretos, incidentais, especiais, consequenciais ou punitivos resultantes do seu acesso ou uso da plataforma.</p>

                        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">5. Alterações nos Termos</h2>
                        <p>Reservamo-nos o direito, a nosso exclusivo critério, de modificar ou substituir estes Termos a qualquer momento.</p>

                        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">6. Contato</h2>
                        <p>Se você tiver alguma dúvida sobre estes Termos, entre em contato conosco pelo e-mail: jbcomerc@gmail.com.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TermsOfService;