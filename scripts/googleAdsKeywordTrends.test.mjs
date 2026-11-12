import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLANNER_EXPLORER_COPY,
  isPlannerAccessDenied,
  keywordCompetitionLabel,
  keywordTrendBarHeight,
  keywordTrendHover,
  mapKeywordIdea,
  parseKeywordSeeds,
  plannerAccessCopy,
  seedsFromAccountKeywords,
  sortAccountKeywordStats,
  sortKeywordIdeas,
} from '../src/lib/googleAdsKeywordTrends.js';

test('seed parser splits commas, drops duplicates and never invents extra words', () => {
  assert.deepEqual(parseKeywordSeeds('vestido de noiva, Vestido de Noiva; buffet'), [
    'vestido de noiva',
    'buffet',
  ]);
  assert.equal(parseKeywordSeeds('aa, bb, cc, dd, ee, ff, gg, hh, ii, jj, kk, ll').length, 10);
  assert.deepEqual(parseKeywordSeeds('  '), []);
});

test('account keywords become a short seed list', () => {
  assert.deepEqual(
    seedsFromAccountKeywords([{ text: 'noiva' }, { text: 'Noiva' }, { text: 'casamento' }], 8),
    ['noiva', 'casamento']
  );
});

test('keyword idea maps 12-month volume and Portuguese competition', () => {
  const idea = mapKeywordIdea({
    text: 'vestido de noiva',
    keywordIdeaMetrics: {
      avgMonthlySearches: '5400',
      competition: 'HIGH',
      averageCpcMicros: '1500000',
      monthlySearchVolumes: [
        { year: 2026, month: 'SEPTEMBER', monthlySearches: '6100' },
        { year: 2026, month: 'AUGUST', monthlySearches: '4800' },
      ],
    },
  });
  assert.equal(idea.avgMonthlySearches, 5400);
  assert.equal(idea.averageCpc, 1.5);
  assert.equal(idea.monthly[0].month, 8);
  assert.equal(idea.monthly[1].searches, 6100);
  assert.equal(keywordCompetitionLabel(idea.competition), 'Alta');
  assert.equal(keywordCompetitionLabel('LOW'), 'Baixa');
  assert.equal(keywordCompetitionLabel(''), '—');
});

test('ideas sort by volume and sparkline never fakes a full bar for zero', () => {
  const sorted = sortKeywordIdeas([
    { text: 'b', avgMonthlySearches: 10 },
    { text: 'a', avgMonthlySearches: 90 },
  ]);
  assert.equal(sorted[0].text, 'a');
  assert.equal(keywordTrendBarHeight(0, 100), 8);
  assert.equal(keywordTrendBarHeight(50, 100), 50);
  const tip = keywordTrendHover({ year: 2026, month: 9, searches: 6100 });
  assert.equal(tip.heading, 'set/26');
  assert.equal(tip.searches, 6100);
});

test('explorer access becomes Portuguese copy and account stats sort by impressions', () => {
  assert.equal(
    isPlannerAccessDenied('This method is not allowed for use with explorer access. Please apply for basic or standard access.'),
    true
  );
  assert.equal(plannerAccessCopy('This method is not allowed for use with explorer access.'), PLANNER_EXPLORER_COPY);
  assert.equal(plannerAccessCopy('timeout'), 'timeout');
  const sorted = sortAccountKeywordStats([
    { text: 'b', impressions: 10 },
    { text: 'a', impressions: 90 },
    { impressions: 5 },
  ]);
  assert.equal(sorted[0].text, 'a');
  assert.equal(sorted.length, 2);
});
