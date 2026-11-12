import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDriveListQuery,
  escapeDriveQueryValue,
  isDriveFileId,
  isDriveVideo,
  isDriveImage,
  isDriveFolder,
  driveViewUrl,
  drivePreviewUrl,
  enlargeDriveThumbnail,
  isPlanejeStoredMedia,
  attachmentHasInAppVideo,
  attachmentHasInAppImage,
  attachmentNeedsDriveStream,
  attachmentNeedsDriveImage,
  driveStreamThumbUrl,
  driveFileIdFromUrl,
  driveOpenUrl,
  describeDriveSync,
  buildDriveAttachmentPayload,
  describeDriveUploadFailure,
  isGoogleDriveUploadUrl,
  driveUploadContentRange,
  isGoogleDriveAssetUrl,
  publicationNeedsDriveStaging,
  isPinnableDriveFolderId,
  normalizeDriveFavorite,
  driveListThumbSrc,
  driveFileFromAttachment,
} from '../src/lib/googleDriveMedia.js';

test('lista pasta com vídeos e imagens, sem PDF', () => {
  assert.equal(
    buildDriveListQuery({ folderId: 'root', mediaOnly: true }),
    "trashed = false and 'root' in parents and (mimeType = 'application/vnd.google-apps.folder' or mimeType contains 'video/' or mimeType contains 'image/' or mimeType = 'application/vnd.google-apps.video')",
  );
});

test('compartilhados e vídeos recentes não usam parents', () => {
  assert.match(buildDriveListQuery({ folderId: 'shared' }), /sharedWithMe = true/);
  assert.equal(
    buildDriveListQuery({ folderId: 'shared' }).includes('in parents'),
    false,
  );
  assert.match(buildDriveListQuery({ folderId: 'shared' }), /mimeType contains 'video\//);
  assert.match(buildDriveListQuery({ folderId: 'recent-videos' }), /mimeType contains 'video\//);
});

test('busca escapa aspas no nome', () => {
  assert.equal(escapeDriveQueryValue("João's"), "João\\'s");
  assert.match(buildDriveListQuery({ folderId: 'root', q: "verão '26" }), /name contains 'verão \\'26'/);
});

test('id inválido cai no Meu Drive', () => {
  assert.equal(isDriveFileId("root'; trash"), false);
  assert.match(buildDriveListQuery({ folderId: "x'; alert" }), /'root' in parents/);
});

test('reconhece vídeo, imagem e pasta', () => {
  assert.equal(isDriveVideo('video/mp4'), true);
  assert.equal(isDriveVideo({ mimeType: 'application/vnd.google-apps.video' }), true);
  assert.equal(isDriveImage('image/jpeg'), true);
  assert.equal(isDriveFolder({ mimeType: 'application/vnd.google-apps.folder' }), true);
  assert.equal(isDriveVideo('application/pdf'), false);
});

test('links de Drive e miniatura maior', () => {
  assert.equal(driveViewUrl('abc123XYZ'), 'https://drive.google.com/file/d/abc123XYZ/view');
  assert.equal(drivePreviewUrl('abc123XYZ'), 'https://drive.google.com/file/d/abc123XYZ/preview');
  assert.equal(
    enlargeDriveThumbnail('https://lh3.googleusercontent.com/d/abc=s220'),
    'https://lh3.googleusercontent.com/d/abc=s400',
  );
});

test('anexo copiado toca no player; link do Drive não', () => {
  const stored = 'https://planeje.jbapex.com.br/storage/v1/object/public/task-drive/c1/f1/file.mp4';
  assert.equal(isPlanejeStoredMedia(stored), true);
  assert.equal(attachmentHasInAppVideo({ url: stored, mime_type: 'video/mp4' }), true);
  assert.equal(
    attachmentHasInAppVideo({
      url: 'https://drive.google.com/file/d/abc/view',
      mime_type: 'video/mp4',
    }),
    false,
  );
  assert.equal(
    attachmentHasInAppImage({
      url: stored.replace('.mp4', '.jpg'),
      mime_type: 'image/jpeg',
    }),
    true,
  );
});

test('Abrir no Drive prefere source_url', () => {
  assert.equal(
    driveOpenUrl({
      source_url: 'https://drive.google.com/file/d/abc/view',
      url: 'https://planeje.jbapex.com.br/storage/v1/object/public/task-drive/x/file.mp4',
      external_file_id: 'abc',
    }),
    'https://drive.google.com/file/d/abc/view',
  );
});

test('payload do anexo guarda só o vínculo do Drive', () => {
  const row = buildDriveAttachmentPayload({
    taskId: 'task-1',
    publicationId: null,
    file: {
      id: 'file-1',
      name: 'Reels.mp4',
      mimeType: 'video/mp4',
      size: 1200,
      webViewLink: 'https://drive.google.com/file/d/file-1/view',
    },
    sync: {
      synced: false,
      stored: false,
      playUrl: 'https://planeje.jbapex.com.br/storage/v1/object/public/task-drive/c/file-1/file.mp4',
      thumbnailUrl: 'https://planeje.jbapex.com.br/storage/v1/object/public/task-drive/c/file-1/thumb.jpg',
      driveUrl: 'https://drive.google.com/file/d/file-1/view',
      mimeType: 'video/mp4',
      size: 1200,
      file: { id: 'file-1', name: 'Reels.mp4' },
    },
  });
  assert.equal(row.provider, 'google_drive');
  assert.equal(row.url, 'https://drive.google.com/file/d/file-1/view');
  assert.equal(row.source_url, 'https://drive.google.com/file/d/file-1/view');
  assert.equal(row.thumbnail_url, null);
});

test('anexo do Drive pede player por stream mesmo se houver cópia antiga', () => {
  const item = {
    provider: 'google_drive',
    mime_type: 'video/mp4',
    size_bytes: 128125021,
    url: 'https://drive.google.com/file/d/1tTTdEzrz-AN5MK2Qr3Mm2hr8eX65SHpJ/view',
    external_file_id: '1tTTdEzrz-AN5MK2Qr3Mm2hr8eX65SHpJ',
    thumbnail_url: 'https://planeje.jbapex.com.br/storage/v1/object/public/task-drive/c/thumb.jpg',
  };
  assert.equal(attachmentNeedsDriveStream(item), true);
  assert.equal(driveFileIdFromUrl(item.url), '1tTTdEzrz-AN5MK2Qr3Mm2hr8eX65SHpJ');
  assert.equal(
    attachmentNeedsDriveStream({
      ...item,
      url: 'https://planeje.jbapex.com.br/storage/v1/object/public/task-drive/c/file.mp4',
    }),
    true,
  );
});

test('imagem do Drive também usa stream, não Storage', () => {
  assert.equal(
    attachmentNeedsDriveImage({
      provider: 'google_drive',
      mime_type: 'image/jpeg',
      external_file_id: 'imgFile12',
    }),
    true,
  );
  assert.match(
    driveStreamThumbUrl('/functions/v1/google-drive-api?action=stream&fid=1'),
    /kind=thumb/,
  );
});

test('texto de sync diz que o arquivo fica no Drive', () => {
  assert.match(
    describeDriveSync({ synced: false, stored: false, mimeType: 'video/mp4' }),
    /fica no Drive/,
  );
  assert.match(describeDriveSync({ skipReason: 'google_native' }), /Abra no Drive/);
});

test('URL de upload resumable do Drive e Content-Range', () => {
  assert.equal(
    isGoogleDriveUploadUrl('https://www.googleapis.com/upload/drive/v3/files?upload_id=abc'),
    true,
  );
  assert.equal(isGoogleDriveUploadUrl('https://evil.example/upload/drive/v3/files'), false);
  assert.equal(driveUploadContentRange(0, 8 * 1024 * 1024, 200 * 1024 * 1024), 'bytes 0-8388607/209715200');
});

test('erro de upload explica pasta e envio genérico', () => {
  assert.match(describeDriveUploadFailure('Edge Function returned a non-2xx status code'), /Drive/);
  assert.match(describeDriveUploadFailure('File not found: 123', { inFolder: true }), /pasta/);
});

test('lista do Drive usa a foto do material', () => {
  assert.equal(
    driveListThumbSrc({ thumbnailLink: 'https://lh3.googleusercontent.com/d/abc=s220', mimeType: 'video/mp4' }),
    'https://lh3.googleusercontent.com/d/abc=s400',
  );
  assert.equal(
    driveListThumbSrc({ isFolder: true, thumbnailLink: 'https://lh3.googleusercontent.com/d/abc=s220' }),
    '',
  );
  assert.equal(driveListThumbSrc({ mimeType: 'video/mp4' }), '');
});

test('Publicações mostra a foto a partir do anexo', () => {
  const file = driveFileFromAttachment({
    name: 'DD46E7E7.PNG',
    mime_type: 'image/png',
    size_bytes: 1700000,
    external_file_id: '1DriveThumbFileId',
    thumbnail_url: 'https://lh3.googleusercontent.com/d/abc=s220',
  });
  assert.equal(file.id, '1DriveThumbFileId');
  assert.equal(file.mimeType, 'image/png');
  assert.equal(isDriveImage(file), true);
  assert.equal(driveListThumbSrc(file), 'https://lh3.googleusercontent.com/d/abc=s400');
});

test('pasta favorita só aceita pasta real do Drive', () => {
  assert.equal(isPinnableDriveFolderId('root'), false);
  assert.equal(isPinnableDriveFolderId('shared'), false);
  assert.equal(isPinnableDriveFolderId('recent-videos'), false);
  assert.equal(isPinnableDriveFolderId("x'; alert"), false);
  assert.equal(isPinnableDriveFolderId('1AbCDefghijkLMNOpqrs'), true);
  assert.deepEqual(
    normalizeDriveFavorite({ favorite_folder_id: '1AbCDefghijkLMNOpqrs', favorite_folder_name: 'Ápice Noivas' }),
    { id: '1AbCDefghijkLMNOpqrs', name: 'Ápice Noivas' },
  );
  assert.equal(normalizeDriveFavorite({ favorite_folder_id: 'root', favorite_folder_name: 'Meu Drive' }), null);
});

test('URL do Drive precisa de cópia temporária na Meta; Storage público não', () => {
  const driveUrl = 'https://drive.google.com/file/d/1DriveFileIdABC/view';
  assert.equal(isGoogleDriveAssetUrl(driveUrl), true);
  assert.equal(publicationNeedsDriveStaging({ asset_url: driveUrl }), true);
  assert.equal(
    publicationNeedsDriveStaging({
      asset_url: 'https://example.supabase.co/storage/v1/object/public/task-drive/meta-publish-temp/x.mp4',
    }),
    false,
  );
});
