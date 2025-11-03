import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Sparkles, MessageSquare, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ChatLauncher = () => {
    const navigate = useNavigate();
    const [lastChatUrl, setLastChatUrl] = useState(null);

    useEffect(() => {
        const storedUrl = localStorage.getItem('lastPublicChatUrl');
        if (storedUrl) {
            setLastChatUrl(storedUrl);
            // Redireciona automaticamente se já houver um chat salvo
            navigate(storedUrl.replace(window.location.origin, ''));
        }
    }, [navigate]);

    // Se houver um URL salvo, o componente não renderizará nada, pois o redirecionamento será quase instantâneo.
    // A tela de boas-vindas só aparece se for o primeiro acesso no dispositivo.
    if (lastChatUrl) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
                <Sparkles className="h-16 w-16 text-primary animate-pulse" />
                <p className="mt-4 text-lg">Redirecionando para sua última conversa...</p>
            </div>
        );
    }

    return (
        <>
            <Helmet>
                <title>ApexIA - Assistente Inteligente</title>
                <meta name="description" content="Bem-vindo ao ApexIA, seu assistente de IA pessoal." />
            </Helmet>
            <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-white p-6 text-center">
                <motion.div
                    initial={{ opacity: 0, y: -50 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="relative mb-8"
                >
                    <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-full blur-lg opacity-75"></div>
                    <div className="relative p-4 bg-gray-800 rounded-full">
                        <Sparkles className="h-16 w-16 text-white" />
                    </div>
                </motion.div>

                <motion.h1 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.3 }}
                    className="text-4xl md:text-5xl font-bold mb-4"
                >
                    Bem-vindo ao ApexIA
                </motion.h1>

                <motion.p 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.5 }}
                    className="max-w-md text-lg text-gray-300 mb-8"
                >
                    Seu assistente de inteligência artificial está pronto. Para começar, acesse o link exclusivo que foi compartilhado com você.
                </motion.p>

                <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 0.7 }}
                    className="p-6 bg-gray-800/50 rounded-xl border border-gray-700 max-w-sm w-full"
                >
                    <MessageSquare className="h-8 w-8 text-primary mx-auto mb-4" />
                    <h2 className="text-xl font-semibold mb-2">Primeiro Acesso?</h2>
                    <p className="text-gray-400">
                        Use o link fornecido pela JB APEX para abrir seu chat. Na próxima vez, você será redirecionado automaticamente.
                    </p>
                </motion.div>
            </div>
        </>
    );
};

export default ChatLauncher;