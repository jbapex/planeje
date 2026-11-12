"""Private images are evidence to discuss, never authorization to execute."""
import base64
import re

MAX_BYTES=5*1024*1024

def image_part(data,mime):
    if not isinstance(data,bytes) or not 1<=len(data)<=MAX_BYTES:
        raise ValueError('Imagem vazia ou maior que 5 MB.')
    valid=(mime=='image/png' and data.startswith(b'\x89PNG\r\n\x1a\n') or
           mime=='image/jpeg' and data.startswith(b'\xff\xd8\xff') or
           mime=='image/webp' and data.startswith(b'RIFF') and data[8:12]==b'WEBP')
    if not valid:raise ValueError('O arquivo não corresponde ao formato da imagem.')
    return {'type':'image_url','image_url':{'url':'data:'+mime+';base64,'+base64.b64encode(data).decode(),'detail':'auto'}}


def add_images(messages,context,download):
    images=[]
    for row in reversed(context.get('messages',[])):
        if row.get('role')!='human':continue
        for image in row.get('images') or []:
            path=image.get('path') or ''
            parts=path.split('/')
            if len(parts)!=4 or parts[0]!=context['thread']['id'] or parts[1]!=row.get('actor_id') or any(not re.fullmatch(r'[a-zA-Z0-9-]+',p) for p in parts[:3]) or not re.fullmatch(r'[a-zA-Z0-9-]+\.(?:png|jpe?g|webp)',parts[-1]):
                raise ValueError('Imagem fora desta conversa.')
            if path not in [value['path'] for value in images]:images.append(image)
            if len(images)==2:break
        if len(images)==2:break
    if not images:return messages
    value=[dict(m) for m in messages]
    parts=[{'type':'text','text':value[-1]['content']}] if isinstance(value[-1]['content'],str) else list(value[-1]['content'])
    for image in images:
        data=download(image['path'])
        if len(data)!=image.get('size'):raise ValueError('O tamanho da imagem mudou.')
        parts.append(image_part(data,image.get('mime')))
    value[-1]={**value[-1],'content':parts}
    return value
