import assert from 'node:assert/strict';
import {
  enlargePreviewUrl,
  isAllowedThumbnailUrl,
  isPlanejeStoredThumb,
  preferredThumbnailUrl,
  rewriteStoredThumbUrl,
  storagePathFromAssetKey,
  thumbnailAssetKey,
  thumbnailUrlAssetKey,
} from '../src/lib/adThumbnail.js';

assert.equal(isAllowedThumbnailUrl('https://scontent.xx.fbcdn.net/v/t45/img.jpg'), true);
assert.equal(isAllowedThumbnailUrl('https://pps.whatsapp.net/v/t61/img.jpg'), true);
assert.equal(isAllowedThumbnailUrl('https://lookaside.fbsbx.com/lookaside/crawler/media/?id=1'), true);
assert.equal(isAllowedThumbnailUrl('http://scontent.xx.fbcdn.net/v/t45/img.jpg'), false);
assert.equal(isAllowedThumbnailUrl('https://evil.example/steal'), false);
assert.equal(isAllowedThumbnailUrl('https://169.254.169.254/latest/meta-data'), false);

assert.equal(
  enlargePreviewUrl('https://pps.whatsapp.net/v/t61/img.jpg?stp=dst-jpg_s96x96&oh=abc'),
  'https://pps.whatsapp.net/v/t61/img.jpg?stp=dst-jpg_s720x720&oh=abc'
);
assert.equal(
  enlargePreviewUrl('https://scontent.xx.fbcdn.net/v/t45/s168x168/img.jpg'),
  'https://scontent.xx.fbcdn.net/v/t45/s720x720/img.jpg'
);
assert.match(
  enlargePreviewUrl('https://scontent.xx.fbcdn.net/v/t15/img.jpg?stp=c0.5000x0.5000f_dst-emg0_p64x64_q75_tt6'),
  /p720x720/
);

assert.equal(
  rewriteStoredThumbUrl('http://api-gw:8000/storage/v1/object/public/ad-thumbnails/ad_1.jpg'),
  'https://planeje.jbapex.com.br/storage/v1/object/public/ad-thumbnails/ad_1.jpg?v=q2'
);
assert.equal(
  rewriteStoredThumbUrl(
    'https://slrpesefjkzoaufvogdj.supabase.co/storage/v1/object/public/ad-thumbnails/ad_1.jpg'
  ),
  'https://planeje.jbapex.com.br/storage/v1/object/public/ad-thumbnails/ad_1.jpg?v=q2'
);
assert.equal(
  rewriteStoredThumbUrl('https://planeje.jbapex.com.br/storage/v1/object/public/ad-thumbnails/ad_1.jpg?v=48000'),
  'https://planeje.jbapex.com.br/storage/v1/object/public/ad-thumbnails/ad_1.jpg?v=48000'
);
assert.equal(
  isPlanejeStoredThumb('https://planeje.jbapex.com.br/storage/v1/object/public/ad-thumbnails/ad_120.jpg'),
  true
);
assert.equal(isPlanejeStoredThumb('https://scontent.xx.fbcdn.net/v/t45/img.jpg'), false);

assert.equal(thumbnailAssetKey('120218549123456789'), 'ad:120218549123456789');
assert.equal(storagePathFromAssetKey('ad:120', 'jpg'), 'ad_120.jpg');

const hashed = await thumbnailUrlAssetKey('https://pps.whatsapp.net/v/t61/a.jpg');
assert.match(hashed, /^url:[a-f0-9]{32}$/);
assert.equal(await thumbnailUrlAssetKey('https://pps.whatsapp.net/v/t61/a.jpg'), hashed);

assert.equal(
  preferredThumbnailUrl({
    thumbnailURL: 'https://pps.whatsapp.net/v/t61/old.jpg',
    thumbnail_stored_url: 'https://planeje.jbapex.com.br/storage/v1/object/public/ad-thumbnails/ad_1.jpg',
  }),
  'https://planeje.jbapex.com.br/storage/v1/object/public/ad-thumbnails/ad_1.jpg?v=q2'
);
assert.equal(
  preferredThumbnailUrl({ thumbnailURL: 'https://pps.whatsapp.net/v/t61/old.jpg' }),
  'https://pps.whatsapp.net/v/t61/old.jpg'
);
assert.equal(
  preferredThumbnailUrl({
    meta_ad_details: { ad: { thumbnail_url: 'https://scontent.xx.fbcdn.net/v/t45/img.jpg' } },
  }),
  'https://scontent.xx.fbcdn.net/v/t45/img.jpg'
);

console.log('PASS ad thumbnail helpers');
