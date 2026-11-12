/** Browser-only presentation clock. Never schedules work or calls an AI provider. */
export const ATLAS_OFFICE_TIME_ZONE='America/Sao_Paulo';
const formatter=new Intl.DateTimeFormat('en-US',{timeZone:ATLAS_OFFICE_TIME_ZONE,weekday:'short',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
export function officeClock(now=Date.now()) {
 const date=new Date(now);
 if(!Number.isFinite(date.getTime()))throw new Error('Invalid office clock');
 const parts=Object.fromEntries(formatter.formatToParts(date).map(p=>[p.type,p.value]));
 const hour=Number(parts.hour)+Number(parts.minute)/60+Number(parts.second)/3600;
 const businessTime=!['Sat','Sun'].includes(parts.weekday)&&hour>=8&&hour<17;
 const phase=hour<5?'Madrugada':hour<7?'Amanhecer':hour<17?'Dia':hour<19?'Entardecer':'Noite';
 return {hour,businessTime,phase,timeZone:ATLAS_OFFICE_TIME_ZONE};
}
