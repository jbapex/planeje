import assert from 'node:assert/strict';
import {
  describeMetaPublishError,
  metaPlatformSchedulesOnGraph,
  planejeHoldsInstagramSchedule,
} from '../src/lib/metaInstagramSchedule.js';

assert.equal(metaPlatformSchedulesOnGraph('facebook_page'), true);
assert.equal(metaPlatformSchedulesOnGraph('instagram'), false);
assert.equal(planejeHoldsInstagramSchedule('instagram'), true);
assert.equal(planejeHoldsInstagramSchedule('facebook_page'), false);
assert.equal(metaPlatformSchedulesOnGraph(null), false);

assert.match(
  describeMetaPublishError('(#3) User must be on whitelist'),
  /não agenda/i,
);
assert.equal(describeMetaPublishError('image_url is required'), 'image_url is required');

assert.match(
  describeMetaPublishError('{"debug_info":{"retriable":false,"type":"ProcessingFailedError","message":"Request processing failed"}}'),
  /MP4 H\.264/i,
);
assert.match(
  describeMetaPublishError({
    debug_info: { retriable: false, type: 'ProcessingFailedError', message: 'Request processing failed' },
  }),
  /MP4 H\.264/i,
);
assert.match(
  describeMetaPublishError(
    new Error('{"debug_info":{"retriable":false,"type":"ProcessingFailedError","message":"Request processing failed"}}'),
  ),
  /MP4 H\.264/i,
);
assert.match(
  describeMetaPublishError({ error: { message: 'Request processing failed', type: 'ProcessingFailedError' } }),
  /MP4 H\.264/i,
);

console.log('metaInstagramSchedule.test.mjs PASS');
