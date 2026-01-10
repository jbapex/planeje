import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
	return twMerge(clsx(inputs));
}

/**
 * Retorna a data e hora atual formatada em português brasileiro
 * Para uso em system prompts de IA, garantindo que sempre tenham acesso ao tempo real
 * @returns {string} Data e hora formatada (ex: "Segunda-feira, 16 de dezembro de 2024, 14:30:25")
 */
export function getCurrentDateTime() {
	const now = new Date();
	
	const daysOfWeek = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
	const months = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
	
	const dayOfWeek = daysOfWeek[now.getDay()];
	const day = now.getDate();
	const month = months[now.getMonth()];
	const year = now.getFullYear();
	
	const hours = String(now.getHours()).padStart(2, '0');
	const minutes = String(now.getMinutes()).padStart(2, '0');
	const seconds = String(now.getSeconds()).padStart(2, '0');
	
	return `${dayOfWeek}, ${day} de ${month} de ${year}, ${hours}:${minutes}:${seconds}`;
}

/**
 * Retorna uma seção formatada de data/hora para incluir em system prompts
 * @returns {string} Seção formatada para adicionar ao prompt
 */
export function getDateTimeContext() {
	const dateTime = getCurrentDateTime();
	return `\n\n**📅 DATA E HORA ATUAL (TEMPO REAL - VOCÊ TEM ACESSO A ISSO):**\n${dateTime}\n\n**🚨 REGRA CRÍTICA SOBRE DATA/HORA:**\n- Você TEM ACESSO à data e hora atual em tempo real (mostrada acima)\n- Quando o usuário perguntar "que horas são?", "que dia é hoje?", "qual a data atual?" ou qualquer pergunta sobre tempo, você DEVE responder usando a data/hora mostrada acima\n- NUNCA diga que não tem acesso ao tempo real - você TEM acesso através desta informação\n- SEMPRE use a data/hora atual mostrada acima para responder perguntas sobre tempo\n- Se perguntarem sobre horas, datas, prazos ou qualquer referência temporal, use SEMPRE a informação acima\n- NUNCA invente datas ou use datas antigas - sempre use a data/hora atual mostrada acima`;
}