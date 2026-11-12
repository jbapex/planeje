export const ATLAS_CHAT_IMAGE_BUCKET='atlas-chat-images';
export const ATLAS_CHAT_IMAGE_LIMIT=5*1024*1024;
const formats={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
async function storageReceipt(promise,signal){
 if(!signal)return promise;
 let abort;
 try{return await Promise.race([promise,new Promise((_,reject)=>{abort=()=>reject(new DOMException('Envio interrompido','AbortError'));if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});})]);}
 finally{signal.removeEventListener('abort',abort);}
}
export async function validateChatImage(file){
 if(!formats[file?.type])throw new Error('Envie uma imagem PNG, JPEG ou WebP.');
 if(!file.size||file.size>ATLAS_CHAT_IMAGE_LIMIT)throw new Error('Cada imagem pode ter até 5 MB.');
 const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());
 const isPng=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10;
 const isJpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const isWebp=String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
 if(!({'image/png':isPng,'image/jpeg':isJpeg,'image/webp':isWebp})[file.type])throw new Error('O arquivo não corresponde ao formato da imagem.');
 return file;
}
export async function uploadChatImages(storage,{threadId,actorId,requestId,files=[],signal}){
 if(files.length>2)throw new Error('Envie até duas imagens por mensagem.');
 const images=[];
 for(const item of files){
  if(signal?.aborted)throw new DOMException('Envio interrompido','AbortError');
  const file=await validateChatImage(item.file);
  const path=`${threadId}/${actorId}/${requestId}/${item.id}.${formats[file.type]}`;
  const bucket=storage.from(ATLAS_CHAT_IMAGE_BUCKET);
  const {error}=await storageReceipt(bucket.upload(path,file,{upsert:false,contentType:file.type,cacheControl:'60'}),signal);
  if(error){
   if(String(error.statusCode)!=='409')throw new Error('Não consegui enviar a imagem. Ela continua guardada para tentar novamente.');
   const previous=await storageReceipt(bucket.download(path),signal);
   if(previous.error||!previous.data)throw new Error('Não consegui confirmar a imagem anterior.');
   const before=new Uint8Array(await previous.data.arrayBuffer()),after=new Uint8Array(await file.arrayBuffer());
   if(before.length!==after.length||!before.every((value,index)=>value===after[index]))throw new Error('Esse envio já contém outra imagem.');
  }
  if(signal?.aborted)throw new DOMException('Envio interrompido','AbortError');
  images.push({path,name:(file.name||'Imagem').replace(/[\u0000-\u001f]/g,'').slice(0,120)||'Imagem',mime:file.type,size:file.size});
 }
 return images;
}
