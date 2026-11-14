const PAGE_SIZE=200;
const MAX_PAGES=20;
const STATUSES=['scheduled','confirmed','cancelled','no_show'];

export async function readAgendaCalendar(api,payload) {
  const rows=[],seen=new Set();let first,signature;
  for(let page=0;page<MAX_PAGES;page++) {
    const data=await api('agenda',{...payload,offset:page*PAGE_SIZE,limit:PAGE_SIZE});
    const invalid=()=>new Error('Não foi possível concluir a leitura da agenda. Atualize e tente novamente.');
    if(!Array.isArray(data?.rows) || data.rows.length>PAGE_SIZE || !Number.isSafeInteger(data.total) || data.total<0
      || !STATUSES.every(status=>Number.isSafeInteger(data.summary?.[status]) && data.summary[status]>=0)) throw invalid();
    try { if(!data.timezone)throw invalid();new Intl.DateTimeFormat('pt-BR',{timeZone:data.timezone}).format(); } catch { throw invalid(); }
    const current=JSON.stringify([data.total,data.timezone,...STATUSES.map(status=>data.summary[status])]);
    if(!first) { first=data;signature=current; }
    if(current!==signature) throw new Error('A agenda foi alterada durante a leitura. Atualize para conferir os compromissos.');
    for(const item of data.rows) {
      if(!item || typeof item.id!=='string' || !item.id || seen.has(item.id)) throw invalid();
      seen.add(item.id);rows.push(item);
    }
    if(rows.length===data.total) return {...first,rows,complete:true};
    if(rows.length>data.total || data.rows.length<PAGE_SIZE) throw invalid();
  }
  // shortcut: above 4,000 appointments per range, ask for a narrower filter; add a snapshot RPC if this becomes common.
  return {...first,rows,complete:false};
}
