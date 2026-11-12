import assert from 'node:assert/strict';
import { snapshotSelectedFiles } from '../src/lib/snapshotSelectedFiles.js';

const files = snapshotSelectedFiles([
  { name: 'slide-a.jpg' },
  null,
  { name: 'slide-b.png' },
]);
assert.deepEqual(files.map((file) => file.name), ['slide-a.jpg', 'slide-b.png']);
assert.deepEqual(snapshotSelectedFiles(null), []);
assert.deepEqual(snapshotSelectedFiles(undefined), []);

console.log('snapshotSelectedFiles.test.mjs ok');
