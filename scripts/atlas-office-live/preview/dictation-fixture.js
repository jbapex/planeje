export async function transcribeAtlasDictation({signal}){
 await new Promise(resolve=>setTimeout(resolve,250));if(signal?.aborted)throw new DOMException('Cancelado','AbortError');
 return 'Priorizar o briefing e os contatos qualificados do cliente fictício.';
}
