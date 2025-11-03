import React from 'react';
import { Helmet } from 'react-helmet';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

const DataDeletion = () => {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-6 md:p-8">
            <Helmet>
                <title>Exclusão de Dados - JB APEX</title>
                <meta name="description" content="Instruções para solicitar a exclusão de dados no sistema JB APEX." />
            </Helmet>
            <div className="max-w-4xl mx-auto">
                <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4 dark:text-white dark:hover:bg-gray-800">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar
                </Button>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 md:p-10">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Instruções para Exclusão de Dados</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Última atualização: 10 de Outubro de 2025</p>

                    <div className="prose prose-lg dark:prose-invert max-w-none text-gray-600 dark:text-gray-300 space-y-4">
                        <p>Você tem o direito de solicitar a exclusão de seus dados pessoais de nossa plataforma. Siga as instruções abaixo para fazer sua solicitação.</p>
                        
                        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Como Solicitar a Exclusão</h2>
                        <p>Para solicitar a exclusão de sua conta e de todos os dados associados, por favor, envie um e-mail para:</p>
                        <p className="font-semibold text-lg text-center my-4">
                            <a href="mailto:jbcomerc@gmail.com?subject=Solicitação de Exclusão de Dados" className="text-blue-600 dark:text-blue-400 hover:underline">
                                jbcomerc@gmail.com
                            </a>
                        </p>
                        <p>No e-mail, inclua as seguintes informações:</p>
                        <ul>
                            <li><strong>Assunto:</strong> Solicitação de Exclusão de Dados</li>
                            <li><strong>Seu nome completo</strong></li>
                            <li><strong>O endereço de e-mail associado à sua conta</strong></li>
                        </ul>

                        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Processo de Verificação e Exclusão</h2>
                        <p>Após recebermos sua solicitação, entraremos em contato para verificar sua identidade. Uma vez confirmada, procederemos com a exclusão permanente de sua conta e de todos os dados associados de nossos sistemas. Este processo pode levar até 30 dias.</p>
                        <p>Note que, uma vez que os dados são excluídos, a ação é irreversível e não poderemos recuperar sua conta ou informações.</p>

                        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Dados da Integração com o Meta</h2>
                        <p>Se você conectou sua conta do Meta, a solicitação de exclusão também removerá quaisquer tokens de acesso ou dados de campanha que tenhamos armazenado. Para revogar o acesso do nosso aplicativo diretamente no Facebook, você pode visitar a seção "Aplicativos e sites" nas suas configurações do Facebook.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DataDeletion;