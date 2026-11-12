import assert from 'node:assert/strict';
import { reorderSlides } from '../src/lib/reorderSlides.js';

const slides = ['a', 'b', 'c', 'd'];
assert.deepEqual(reorderSlides(slides, 0, 2), ['b', 'c', 'a', 'd']);
assert.deepEqual(reorderSlides(slides, 3, 1), ['a', 'd', 'b', 'c']);
assert.deepEqual(reorderSlides(slides, 3, 2), ['a', 'b', 'd', 'c']);
assert.equal(reorderSlides(slides, 1, 1), slides);
assert.equal(reorderSlides(slides, -1, 0), slides);
assert.equal(reorderSlides(slides, 0, 9), slides);
assert.deepEqual(slides, ['a', 'b', 'c', 'd']);

console.log('reorderSlides.test.mjs ok');
