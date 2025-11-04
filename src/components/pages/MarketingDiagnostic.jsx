import React, { useState, useEffect } from 'react';
    import { Helmet } from 'react-helmet';
    import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
    import { useSearchParams } from 'react-router-dom';
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { Label } from '@/components/ui/label';
    import { Checkbox } from '@/components/ui/checkbox';
    import { Textarea } from '@/components/ui/textarea';
    import { useIMask } from 'react-imask';
    import { Loader2, BrainCircuit, AlertTriangle, Twitter as WhatsApp } from 'lucide-react';
    import { supabase, supabaseUrl } from '@/lib/customSupabaseClient';
    import { useToast } from '@/components/ui/use-toast';
    import { useAuth } from '@/contexts/SupabaseAuthContext';

    const WelcomeScreen = ({ onStart }) => {
      const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren: 0.2,
          },
        },
      };

      const itemVariants = {
        hidden: { opacity: 0, x: -50 },
        visible: { opacity: 1, x: 0, transition: { duration: 0.6, ease: 'easeOut' } },
      };

      const imageVariants = {
        hidden: { opacity: 0, x: 50 },
        visible: { opacity: 1, x: 0, transition: { duration: 0.6, ease: 'easeOut' } },
      };

      return (
        <motion.div
          key="welcome"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          exit={{ opacity: 0, transition: { duration: 0.5 } }}
          className="grid md:grid-cols-2 gap-16 items-center w-full"
        >
          <div className="flex flex-col items-start text-left">
            <motion.h1
              variants={itemVariants}
              className="text-4xl md:text-5xl font-extrabold text-[#EDEDED] leading-tight"
              style={{ fontFamily: "'Poppins', sans-serif" }}
            >
              Descubra por que o seu <span className="text-[#00FF88]">marketing</span> não está vendendo como deveria.
            </motion.h1>
            <motion.p
              variants={itemVariants}
              className="mt-6 text-lg text-[#A5A5A5]"
              style={{ fontFamily: "'Inter', sans-serif" }}
            >
              Um diagnóstico rápido e inteligente que revela o que está travando o crescimento do seu negócio.
            </motion.p>
            
            <motion.div variants={itemVariants} className="mt-12">
              <Button
                size="lg"
                onClick={onStart}
                className="font-bold text-lg bg-[#00FF88] text-black rounded-lg px-8 py-6 transition-all duration-300 hover:bg-white hover:shadow-[0_0_20px_rgba(0,255,136,0.5)]"
              >
                Começar Diagnóstico
              </Button>
              <p className="mt-4 text-sm text-[#6B6B6B]" style={{ fontFamily: "'Inter', sans-serif" }}>
                Leva menos de 3 minutos.
              </p>
            </motion.div>
          </div>
          <motion.div variants={imageVariants} className="hidden md:flex justify-center items-center">
            <img className="max-h-[500px] object-contain" alt="Futuristic AI robot head in a white hoodie" src={typeof window !== 'undefined' && window.__DIAG_IMAGE_URL__ ? window.__DIAG_IMAGE_URL__ : "https://images.unsplash.com/photo-1680355466499-39701c0be79f"} />
          </motion.div>
        </motion.div>
      );
    };

    // Perguntas padrão (fallback)
    const defaultQuestions = [
        { id: 'q1', key: 'publica_conteudo', block: 'Presença Digital', question: 'Você publica conteúdos com frequência nas redes sociais?', options: [{ text: 'Diariamente' }, { text: '3x por semana' }, { text: '1x por semana' }, { text: 'Quase nunca' }] },
        { id: 'q2', key: 'identidade_marca', block: 'Presença Digital', question: 'Seu público reconhece o estilo e a identidade da sua marca?', options: [{ text: 'Sim' }, { text: 'Mais ou menos' }, { text: 'Não' }] },
        { id: 'q3', key: 'processo_atendimento', block: 'Captação e Atendimento', question: 'Quando alguém chama sua empresa, existe um processo definido de atendimento?', options: [{ text: 'Sim' }, { text: 'Às vezes' }, { text: 'Não' }] },
        { id: 'q4', key: 'usa_sistema', block: 'Captação e Atendimento', question: 'Você usa algum sistema para organizar mensagens e leads?', options: [{ text: 'Sim' }, { text: 'Não, só WhatsApp' }, { text: 'Pretendo usar' }] },
        { id: 'q5', key: 'clareza_publico', block: 'Estratégia e Posicionamento', question: 'Você tem clareza sobre o público que quer atingir e o que ele realmente busca?', options: [{ text: 'Sim' }, { text: 'Parcialmente' }, { text: 'Não' }] },
        { id: 'q6', key: 'oferta_diferente', block: 'Estratégia e Posicionamento', question: 'Você tem uma oferta clara que diferencia sua empresa dos concorrentes?', options: [{ text: 'Sim' }, { text: 'Mais ou menos' }, { text: 'Não' }] },
        { id: 'q7', key: 'acompanha_metricas', block: 'Métricas e Resultados', question: 'Você acompanha resultados das campanhas (CTR, CPL, etc.)?', options: [{ text: 'Sim' }, { text: 'Às vezes' }, { text: 'Não' }] },
        { id: 'q8', key: 'campanha_certa', block: 'Métricas e Resultados', question: 'Você já teve uma campanha que deu certo e sabe o porquê?', options: [{ text: 'Sim, e sei o motivo' }, { text: 'Sim, mas não sei o motivo' }, { text: 'Nunca tive resultados expressivos' }] },
        { id: 'q9', key: 'problema_principal', block: 'Reflexão Final', question: 'Se você pudesse resolver hoje um único problema no seu marketing, qual seria?', type: 'open' },
    ];

    const FormScreen = ({ onFinish, questions = defaultQuestions }) => {
      const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
      const [answers, setAnswers] = useState([]);
      const [direction, setDirection] = useState(1);
      const [openAnswer, setOpenAnswer] = useState('');
      const MAX_CHARS = 500;

      const handleAnswer = (option) => {
        setDirection(1);
        const currentQuestion = questions[currentQuestionIndex];
        const newAnswers = [...answers, { question: currentQuestion.question, answer: option.text, key: currentQuestion.key }];
        setAnswers(newAnswers);
        if (currentQuestionIndex < questions.length - 1) {
          setCurrentQuestionIndex(currentQuestionIndex + 1);
        } else {
          onFinish(newAnswers);
        }
      };

      const handleOpenAnswerSubmit = () => {
        setDirection(1);
        const currentQuestion = questions[currentQuestionIndex];
        const newAnswers = [...answers, { question: currentQuestion.question, answer: openAnswer, key: currentQuestion.key }];
        setAnswers(newAnswers);
        onFinish(newAnswers);
      };

      const progress = ((currentQuestionIndex + 1) / questions.length) * 100;

      const questionVariants = {
        enter: (direction) => ({
          x: direction > 0 ? '100%' : '-100%',
          opacity: 0
        }),
        center: {
          zIndex: 1,
          x: 0,
          opacity: 1
        },
        exit: (direction) => ({
          zIndex: 0,
          x: direction < 0 ? '100%' : '-100%',
          opacity: 0
        })
      };

      const currentQuestion = questions[currentQuestionIndex];

      return (
        <motion.div
          key="form"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-2xl mx-auto"
        >
          <div className="w-full bg-gray-800 rounded-full h-1.5 mb-8">
            <motion.div
              className="bg-[#007BFF] h-1.5 rounded-full"
              style={{ boxShadow: '0 0 8px #007BFF' }}
              initial={{ width: '0%' }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: 'easeInOut' }}
            />
          </div>
          
          <div className="relative h-96 overflow-hidden">
            <AnimatePresence initial={false} custom={direction}>
              <motion.div
                key={currentQuestionIndex}
                custom={direction}
                variants={questionVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{
                  x: { type: 'spring', stiffness: 300, damping: 30 },
                  opacity: { duration: 0.2 }
                }}
                className="absolute w-full flex flex-col items-center"
              >
                <h2 className="text-2xl font-semibold text-center text-[#EDEDED] mb-8" style={{ fontFamily: "'Poppins', sans-serif" }}>
                  {currentQuestion.question}
                </h2>
                {currentQuestion.type === 'open' ? (
                    <div className="w-full flex flex-col items-center gap-4">
                        <Textarea
                            value={openAnswer}
                            onChange={(e) => setOpenAnswer(e.target.value)}
                            maxLength={MAX_CHARS}
                            placeholder="Digite sua resposta aqui..."
                            className="min-h-[150px] bg-white/5 border-[#1E1E1E] rounded-[10px] text-white focus:border-[#007BFF]"
                        />
                        <p className="w-full text-right text-sm text-gray-400">{openAnswer.length} / {MAX_CHARS}</p>
                        <Button
                            onClick={handleOpenAnswerSubmit}
                            className="font-bold text-lg text-white rounded-[10px] px-8 py-6 transition-all duration-300 bg-gradient-to-r from-[#007BFF] to-[#00FF88] hover:shadow-[0_0_12px_rgba(0,255,136,0.7)]"
                        >
                            Continuar
                        </Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                    {currentQuestion.options.map((option) => (
                        <motion.button
                        key={option.text}
                        onClick={() => handleAnswer(option)}
                        className="w-full text-left p-4 rounded-lg border border-gray-700 bg-gray-900/50 text-[#EDEDED] transition-all duration-200"
                        whileHover={{ 
                            scale: 1.05, 
                            borderColor: '#007BFF', 
                            boxShadow: '0 0 10px rgba(0, 123, 255, 0.5)',
                            backgroundColor: 'rgba(0, 123, 255, 0.1)'
                        }}
                        whileTap={{ scale: 0.98 }}
                        >
                        {option.text}
                        </motion.button>
                    ))}
                    </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      );
    };


    const PhoneInput = React.forwardRef((props, fwdRef) => {
      const {
        ref,
        ...rest
      } = useIMask({
        mask: '+{55} (00) 00000-0000',
        onAccept: (value, mask) => props.onAccept(value, mask.unmaskedValue),
      });

      const handleRef = (el) => {
        ref.current = el;
        if (typeof fwdRef === 'function') {
          fwdRef(el);
        } else if (fwdRef) {
          fwdRef.current = el;
        }
      };

      return <Input {...props} {...rest} ref={handleRef} />;
    });


    const LeadCaptureScreen = ({ onShowResult, answers }) => {
      const [isSubmitting, setIsSubmitting] = useState(false);
      const [formData, setFormData] = useState({ name: '', instagram: '', consent: false });
      const [phoneUnmasked, setPhoneUnmasked] = useState('');
      const { toast } = useToast();

      const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
      };
      
      const handlePhoneChange = (maskedValue, unmaskedValue) => {
        setPhoneUnmasked(unmaskedValue);
      }

      const getAIAnalysis = async (answersObject, userName) => {
        const prompt = `Você é uma inteligência de diagnóstico da JB APEX. Seu nome é ApexIA.
          O nome do usuário é ${userName}. Chame-o pelo nome no feedback.
          Receberá as respostas de um empresário sobre seu marketing.
          Avalie e retorne um resultado JSON com a seguinte estrutura:
          {
            "nota": número de 0 a 100,
            "feedback": "texto mais longo (aprox. 600 caracteres) e empático, começando com o nome do usuário. Destaque as 'dores' implícitas nas respostas, mostrando que você entendeu os desafios do negócio dele. Considere a resposta para 'problema_principal' para dar um toque mais pessoal. Seja humano, direto e útil.",
            "travas": ["Trava 1 curta e clara", "Trava 2 curta e clara", "Trava 3 curta e clara"]
          }

          Critérios para nota e feedback:
          - Quanto mais estruturadas, frequentes e estratégicas forem as respostas, maior a nota.
          - Se o usuário demonstra falta de clareza, processos ou mensuração, reduza a nota e aponte isso como uma dor no feedback.
          - Retorne apenas o JSON puro, sem explicações adicionais.

          Entrada: ${JSON.stringify({ respostas: answersObject })}`;

        try {
          const edgeBaseUrl = import.meta.env.VITE_SUPABASE_URL || supabaseUrl;
          const edgeUrl = `${edgeBaseUrl}/functions/v1/openai-chat`;
          if (!edgeBaseUrl) {
            throw new Error('URL do Supabase não configurada. Defina VITE_SUPABASE_URL ou supabaseUrl.');
          }
          const response = await fetch(edgeUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [{ role: 'user', content: prompt }],
              stream: false,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const detail = errorData?.error || errorData?.message || 'Falha na comunicação com a IA';
            throw new Error(detail);
          }

          const contentType = response.headers.get('content-type') || '';
          if (!contentType.includes('text/event-stream')) {
            const { content } = await response.json();
            try {
              return JSON.parse(content);
            } catch (e) {
              throw new Error('Resposta da IA em formato inesperado.');
            }
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder('utf-8');
          let bufferedText = '';
          let assembledContent = '';
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            bufferedText += decoder.decode(value, { stream: true });
            const parts = bufferedText.split('\n\n');
            bufferedText = parts.pop() || '';
            for (const chunk of parts) {
              const line = chunk.trim();
              if (!line.startsWith('data:')) continue;
              const dataStr = line.replace(/^data:\s*/, '');
              if (dataStr === '[DONE]') {
                continue;
              }
              try {
                const parsed = JSON.parse(dataStr);
                const delta = parsed?.choices?.[0]?.delta?.content;
                if (typeof delta === 'string') assembledContent += delta;
                const full = parsed?.choices?.[0]?.message?.content;
                if (typeof full === 'string') assembledContent += full;
              } catch (_) { /* ignora partes inválidas */ }
            }
          }

          if (!assembledContent) {
            throw new Error('Resposta vazia da IA.');
          }
          try {
            return JSON.parse(assembledContent);
          } catch {
            throw new Error('Resposta da IA em formato inesperado.');
          }

        } catch (error) {
          console.error("Error getting AI analysis:", error);
          toast({
            title: "Erro na análise da IA",
            description: error.message,
            variant: "destructive",
          });
          return null;
        }
      };

      const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        // Garante captura do telefone mesmo se o estado não tiver sido atualizado
        let phoneDigits = (phoneUnmasked || '').replace(/\D/g, '');
        if (!phoneDigits) {
          const phoneEl = document.getElementById('phone');
          if (phoneEl && phoneEl.value) {
            phoneDigits = String(phoneEl.value).replace(/\D/g, '');
          }
        }
        // Validação mínima: 11 dígitos (DDI/DDD+número no padrão BR)
        if (!phoneDigits || phoneDigits.length < 11) {
          setIsSubmitting(false);
          toast({
            title: "WhatsApp inválido",
            description: "Informe um número válido com DDD (11 dígitos).",
            variant: "destructive",
          });
          return;
        }
        
        const answersObject = answers.reduce((acc, curr) => {
          acc[curr.key] = curr.answer;
          return acc;
        }, {});
        
        const aiResult = await getAIAnalysis(answersObject, formData.name);

        if (!aiResult) {
          setIsSubmitting(false);
          return;
        }
        
        const { nota, feedback, travas } = aiResult;
        
        const submissionData = {
            nome: formData.name,
            instagram: formData.instagram,
            whatsapp: phoneDigits,
            answers: answers.map(({key, ...rest}) => rest),
            nota: nota,
            feedback: feedback,
            travas: travas
        };

        const { error } = await supabase.from('diagnostic_submissions').insert([submissionData]);

        if (error) {
            console.error('Error saving to Supabase:', error);
            toast({
                title: "Erro ao salvar",
                description: `Houve um problema ao salvar seu diagnóstico: ${error.message}`,
                variant: "destructive",
            });
            setIsSubmitting(false);
            return;
        }

        setTimeout(() => {
          onShowResult(formData, nota, feedback, travas);
        }, 1500);
      };

      const containerVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: {
          opacity: 1,
          y: 0,
          transition: {
            staggerChildren: 0.1,
            delayChildren: 0.2,
          },
        },
      };

      const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
      };

      return (
        <motion.div
          key="lead-capture"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          exit={{ opacity: 0, y: -20, transition: { duration: 0.5 } }}
          className="w-full max-w-md mx-auto text-center"
        >
          <motion.h1 variants={itemVariants} className="text-4xl font-bold text-[#EDEDED]" style={{ fontFamily: "'Poppins', sans-serif" }}>
            Seu diagnóstico está quase pronto.
          </motion.h1>
          <motion.p variants={itemVariants} className="mt-4 text-lg text-[#A5A5A5]">
            Preencha seus dados para que a análise personalizada seja gerada e enviada corretamente. É rápido e seguro.
          </motion.p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-6 text-left">
            <motion.div variants={itemVariants}>
              <Label htmlFor="name" className="text-[#A5A5A5]">Nome completo</Label>
              <Input id="name" name="name" required onChange={handleInputChange} className="mt-2 bg-white/5 border-[#1E1E1E] rounded-[10px] text-white focus:border-[#007BFF]" />
            </motion.div>
            <motion.div variants={itemVariants}>
              <Label htmlFor="instagram" className="text-[#A5A5A5]">@ do Instagram</Label>
              <Input id="instagram" name="instagram" placeholder="@nomedousuario" required onChange={handleInputChange} className="mt-2 bg-white/5 border-[#1E1E1E] rounded-[10px] text-white focus:border-[#007BFF]" />
            </motion.div>
            <motion.div variants={itemVariants}>
              <Label htmlFor="phone" className="text-[#A5A5A5]">WhatsApp</Label>
              <PhoneInput id="phone" name="phone" required onAccept={handlePhoneChange} className="mt-2 bg-white/5 border-[#1E1E1E] rounded-[10px] text-white focus:border-[#007BFF]" />
            </motion.div>
            <motion.div variants={itemVariants} className="flex items-center space-x-2">
              <Checkbox id="consent" name="consent" required onCheckedChange={(checked) => handleInputChange({ target: { name: 'consent', checked } })} className="data-[state=checked]:bg-[#007BFF] data-[state=checked]:text-white border-gray-600" />
              <label htmlFor="consent" className="text-sm text-[#A5A5A5] leading-none">
                Autorizo o uso dos meus dados para receber meu diagnóstico e contato da JB APEX.
              </label>
            </motion.div>
            <motion.div variants={itemVariants} className="text-center pt-4">
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full font-bold text-lg text-white rounded-[10px] px-8 py-6 transition-all duration-300 bg-gradient-to-r from-[#007BFF] to-[#00FF88] hover:shadow-[0_0_12px_rgba(0,255,136,0.7)]"
              >
                {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Gerando seu diagnóstico...</> : 'Ver meu resultado'}
              </Button>
              <p className="mt-4 text-xs text-gray-500/70">
                Seus dados estão protegidos e nunca serão compartilhados com terceiros.
              </p>
            </motion.div>
          </form>
        </motion.div>
      );
    };

    const ResultScreen = ({ data, onRestart }) => {
        const count = useMotionValue(0);
        const rounded = useTransform(count, Math.round);

        useEffect(() => {
            const animation = animate(count, data.score, { duration: 2, ease: "easeOut" });
            return animation.stop;
        }, [data.score, count]);

        const containerVariants = {
            hidden: { opacity: 0 },
            visible: { opacity: 1, transition: { staggerChildren: 0.15 } },
        };

        const itemVariants = {
            hidden: { opacity: 0, y: 20 },
            visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
        };

        return (
            <motion.div
                key="result"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0 }}
                className="w-full max-w-3xl mx-auto text-center text-[#EDEDED]"
            >
                <motion.div variants={itemVariants} className="flex justify-center items-center gap-4">
                    <BrainCircuit className="w-10 h-10 text-[#00FF88]" />
                    <h1 className="text-3xl md:text-4xl font-bold" style={{ fontFamily: "'Poppins', sans-serif" }}>
                        Aqui está o seu diagnóstico de marketing.
                    </h1>
                </motion.div>
                <motion.p variants={itemVariants} className="mt-4 text-lg text-[#A5A5A5]">
                    Analisamos suas respostas e identificamos o que pode estar travando o crescimento da sua empresa.
                </motion.p>

                <motion.div variants={itemVariants} className="my-12 flex flex-col items-center">
                    <div className="relative w-48 h-48 flex items-center justify-center">
                        <svg className="absolute inset-0" viewBox="0 0 100 100">
                            <defs>
                                <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#007BFF" />
                                    <stop offset="100%" stopColor="#00FF88" />
                                </linearGradient>
                            </defs>
                            <circle cx="50" cy="50" r="45" stroke="url(#gradient)" strokeWidth="5" fill="none" />
                        </svg>
                        <motion.span className="text-6xl font-bold text-white">{rounded}</motion.span>
                        <span className="absolute bottom-10 text-xl text-[#A5A5A5]">/ 100</span>
                    </div>
                    <p className="mt-4 text-lg text-left text-[#A5A5A5] whitespace-pre-wrap">
                        {data.feedbackText}
                    </p>
                </motion.div>

                <motion.div variants={itemVariants}>
                    <h2 className="text-2xl font-semibold mb-6">Principais Travamentos Encontrados:</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
                        {data.travas.map((item, index) => {
                            return (
                                <motion.div
                                    key={index}
                                    custom={index}
                                    variants={itemVariants}
                                    className="bg-white/5 border border-gray-800 rounded-lg p-4 flex items-center gap-4 transition-all duration-300 hover:border-[#007BFF] hover:shadow-[0_0_10px_rgba(0,123,255,0.5)]"
                                >
                                    <AlertTriangle className="w-8 h-8 text-[#00FF88] flex-shrink-0" />
                                    <p className="text-base text-[#EDEDED]">{item}</p>
                                </motion.div>
                            );
                        })}
                    </div>
                </motion.div>

                <motion.div variants={itemVariants} className="mt-12">
                    <p className="text-xl text-white mb-6">Quer entender como corrigir esses pontos e acelerar seus resultados?</p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <Button
                            size="lg"
                            onClick={() => window.open('https://wa.me/5541995252559?text=Olá!%20Quero%20entender%20meu%20diagnóstico%20e%20melhorar%20meu%20marketing.', '_blank')}
                            className="font-bold text-lg text-white rounded-[10px] px-8 py-6 transition-all duration-300 bg-gradient-to-r from-[#007BFF] to-[#00FF88] hover:shadow-[0_0_12px_rgba(0,255,136,0.7)]"
                        >
                            <WhatsApp className="mr-2 h-5 w-5" />
                            Agendar Reunião com a JB APEX
                        </Button>
                        <Button
                            size="lg"
                            variant="outline"
                            onClick={onRestart}
                            className="font-bold text-lg text-[#A5A5A5] border-[#A5A5A5] rounded-[10px] px-8 py-6 transition-all duration-300 hover:bg-white/10 hover:text-white"
                        >
                            Refazer Diagnóstico
                        </Button>
                    </div>
                </motion.div>
                <motion.p variants={itemVariants} className="mt-16 text-sm text-gray-600">
                    © {new Date().getFullYear()} JB APEX — Estratégia, Inteligência e Resultados Reais.
                </motion.p>
            </motion.div>
        );
    };

    const MarketingDiagnostic = () => {
      const [searchParams] = useSearchParams();
      const [step, setStep] = useState('welcome');
      const [diagnosticData, setDiagnosticData] = useState({ answers: [], lead: {}, score: 0, feedbackText: '', travas: [] });
      const [welcomeImageUrl, setWelcomeImageUrl] = useState('');
      const [questions, setQuestions] = useState(defaultQuestions);
      const [loadingQuestions, setLoadingQuestions] = useState(true);

      const handleStart = () => setStep('form');
      
      const handleFinishForm = (answers) => {
        setDiagnosticData(prev => ({ ...prev, answers }));
        setStep('leadCapture');
      };

      const handleShowResult = (leadData, score, feedbackText, travas) => {
        setDiagnosticData(prev => ({ ...prev, lead: leadData, score, feedbackText, travas }));
        setStep('result');
      };

      const handleRestart = () => {
        setDiagnosticData({ answers: [], lead: {}, score: 0, feedbackText: '', travas: [] });
        setStep('welcome');
      };

      useEffect(() => {
        // Carrega imagem de configuração pública
        const loadImage = async () => {
          try {
            const { data } = await supabase
              .from('public_config')
              .select('value')
              .eq('key', 'diagnostic_welcome_image_url')
              .maybeSingle();
            if (data?.value) {
              setWelcomeImageUrl(String(data.value));
              if (typeof window !== 'undefined') {
                window.__DIAG_IMAGE_URL__ = String(data.value);
              }
            }
          } catch (_) { /* silencioso */ }
        };
        loadImage();
      }, []);

      useEffect(() => {
        // Carrega perguntas do template
        const loadQuestions = async () => {
          setLoadingQuestions(true);
          try {
            const templateParam = searchParams.get('template');
            let templateId = null;

            if (templateParam) {
              // Tenta buscar por ID ou name (slug)
              const { data: template } = await supabase
                .from('diagnostic_templates')
                .select('id')
                .or(`id.eq.${templateParam},name.ilike.%${templateParam}%`)
                .eq('is_active', true)
                .limit(1)
                .maybeSingle();
              if (template) templateId = template.id;
            }

            // Se não especificado na URL, busca o template ativo padrão
            if (!templateId) {
              const { data: defaultTemplate } = await supabase
                .from('diagnostic_templates')
                .select('id')
                .eq('is_active', true)
                .order('created_at', { ascending: true })
                .limit(1)
                .maybeSingle();
              if (defaultTemplate) templateId = defaultTemplate.id;
            }

            if (templateId) {
              const { data: templateQuestions, error } = await supabase
                .from('diagnostic_template_questions')
                .select('*')
                .eq('template_id', templateId)
                .order('order_index', { ascending: true });

              if (!error && templateQuestions && templateQuestions.length > 0) {
                // Mapeia formato do banco para formato esperado
                const mapped = templateQuestions.map((q, idx) => ({
                  id: `q${idx + 1}`,
                  key: q.key || `question_${idx + 1}`,
                  block: q.block || 'Geral',
                  question: q.question,
                  type: q.type || 'choice',
                  options: q.type === 'open' ? undefined : (q.options || []),
                }));
                setQuestions(mapped);
                setLoadingQuestions(false);
                return;
              }
            }
          } catch (err) {
            console.warn('Erro ao carregar perguntas do template:', err);
          }
          // Fallback para perguntas padrão
          setQuestions(defaultQuestions);
          setLoadingQuestions(false);
        };
        loadQuestions();
      }, [searchParams]);

      return (
        <>
          <Helmet>
            <title>Diagnóstico de Marketing - JB APEX</title>
            <meta name="description" content="Descubra por que seu marketing não está vendendo como deveria com nosso diagnóstico rápido e inteligente." />
          </Helmet>
          <div className="min-h-screen w-full flex items-center justify-center p-4 bg-black overflow-hidden relative" style={{ background: 'radial-gradient(circle, #0F0F0F, #0A0A0A)' }}>
            <div className="absolute inset-0 bg-green-glow opacity-50"></div>
            <div className="max-w-6xl w-full px-4 md:px-8 z-10 flex justify-center">
              <AnimatePresence mode="wait">
                {step === 'welcome' && <WelcomeScreen onStart={handleStart} />}
                {step === 'form' && !loadingQuestions && <FormScreen onFinish={handleFinishForm} questions={questions} />}
                {step === 'leadCapture' && <LeadCaptureScreen onShowResult={handleShowResult} answers={diagnosticData.answers} />}
                {step === 'result' && <ResultScreen data={diagnosticData} onRestart={handleRestart} />}
              </AnimatePresence>
            </div>
          </div>
        </>
      );
    };

    export default MarketingDiagnostic;