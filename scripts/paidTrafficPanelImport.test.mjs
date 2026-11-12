import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const files = [
  'src/components/social/ClientOverview.jsx',
  'src/components/social/InstagramInsightsView.jsx',
  'src/components/social/PageInsightsView.jsx',
];

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  assert.match(
    src,
    /import PaidTrafficPanel from '\.\/PaidTrafficPanel'/,
    `${file} precisa importar PaidTrafficPanel`,
  );
  assert.match(
    src,
    /typeof PaidTrafficPanel === 'function'/,
    `${file} precisa proteger o JSX se o import falhar`,
  );
}

const boundary = readFileSync('src/components/ErrorBoundary.jsx', 'utf8');
assert.match(boundary, /searchParams\.delete\('v'\)/);
assert.match(boundary, /location\.replace/);

console.log('paidTrafficPanelImport.test.mjs ok');
