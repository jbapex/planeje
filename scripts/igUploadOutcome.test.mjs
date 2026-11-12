import assert from 'node:assert/strict';
import { uploadOutcomeAfterProcessingFailure } from '../supabase/functions/meta-ads-api/igUploadOutcome.js';

assert.equal(
  uploadOutcomeAfterProcessingFailure({ chunkEnd: 80, fileSize: 80, statusCode: 'FINISHED' }),
  'ready',
);
assert.equal(
  uploadOutcomeAfterProcessingFailure({ chunkEnd: 80, fileSize: 100, statusCode: 'FINISHED' }),
  'ready',
);
assert.equal(
  uploadOutcomeAfterProcessingFailure({ chunkEnd: 80, fileSize: 80, statusCode: 'IN_PROGRESS' }),
  'wait',
);
assert.equal(
  uploadOutcomeAfterProcessingFailure({ chunkEnd: 40, fileSize: 80, statusCode: 'IN_PROGRESS' }),
  'fail',
);
assert.equal(
  uploadOutcomeAfterProcessingFailure({ chunkEnd: 80, fileSize: 80, statusCode: 'ERROR' }),
  'fail',
);
assert.equal(
  uploadOutcomeAfterProcessingFailure({ chunkEnd: 80, fileSize: 80, statusCode: '' }),
  'fail',
);

console.log('igUploadOutcome.test.mjs ok');
