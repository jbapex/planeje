import assert from 'node:assert/strict';
import { rewritePublicStorageUrl, rewritePublicStorageUrls } from '../src/lib/publicStorageUrl.js';

assert.equal(
  rewritePublicStorageUrl(
    'https://slrpesefjkzoaufvogdj.supabase.co/storage/v1/object/public/avatars/client-logos/0.1.png'
  ),
  'https://planeje.jbapex.com.br/storage/v1/object/public/avatars/client-logos/0.1.png'
);
assert.equal(
  rewritePublicStorageUrl('http://api-gw:8000/storage/v1/object/public/avatars/a.png'),
  'https://planeje.jbapex.com.br/storage/v1/object/public/avatars/a.png'
);
assert.equal(
  rewritePublicStorageUrl('https://planeje.jbapex.com.br/storage/v1/object/public/avatars/a.png'),
  'https://planeje.jbapex.com.br/storage/v1/object/public/avatars/a.png'
);
assert.equal(
  rewritePublicStorageUrl('https://scontent.xx.fbcdn.net/v/t45/img.jpg'),
  'https://scontent.xx.fbcdn.net/v/t45/img.jpg'
);
assert.deepEqual(
  rewritePublicStorageUrls([
    'https://slrpesefjkzoaufvogdj.supabase.co/storage/v1/object/public/avatars/a.png',
    '',
  ]),
  ['https://planeje.jbapex.com.br/storage/v1/object/public/avatars/a.png']
);

console.log('PASS public storage url');
