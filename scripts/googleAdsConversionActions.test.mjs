import assert from 'node:assert/strict';
import {
  PLANEJE_GOOGLE_CONVERSION_ACTIONS,
  isUploadClicksAction,
  matchPlanejeConversionAction,
  specsMissingFromActions,
  mapPlanejeConversionActions,
} from '../src/lib/googleAdsConversionActions.js';

assert.equal(PLANEJE_GOOGLE_CONVERSION_ACTIONS.length, 3);
assert.equal(PLANEJE_GOOGLE_CONVERSION_ACTIONS[0].name, 'Planeje — Conversa');

assert.equal(
  isUploadClicksAction({ type: 'UPLOAD_CLICKS', status: 'ENABLED' }),
  true,
);
assert.equal(
  isUploadClicksAction({ type: 'WEBPAGE', status: 'ENABLED' }),
  false,
);
assert.equal(
  isUploadClicksAction({ type: 'UPLOAD_CLICKS', status: 'REMOVED' }),
  false,
);

const existing = [
  { name: 'Planeje — Conversa', resourceName: 'customers/1/conversionActions/10', type: 'UPLOAD_CLICKS' },
];
assert.equal(
  matchPlanejeConversionAction(existing[0], PLANEJE_GOOGLE_CONVERSION_ACTIONS[0]),
  true,
);
const missing = specsMissingFromActions(existing);
assert.deepEqual(
  missing.map((s) => s.key),
  ['qualified', 'purchase'],
);
const mapped = mapPlanejeConversionActions(existing);
assert.equal(mapped.lead, 'customers/1/conversionActions/10');
assert.equal(mapped.qualified, undefined);

console.log('PASS googleAdsConversionActions');
