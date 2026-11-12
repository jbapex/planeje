import assert from 'node:assert/strict';
import * as planner from '../src/lib/socialPlannerItems.js';
import {
  buildPlannerItems,
  itemsForDay,
  matchesPlannerFilter,
  matchesPlannerSearch,
  movePlannerItemToDay,
  targetDayInWeek,
  plannerDayKey,
  plannerFormatLabel,
  plannerItemCanMove,
  plannerStatusCounts,
  plannerTimeLabel,
} from '../src/lib/socialPlannerItems.js';

function testGroupsSameSlot() {
  const items = buildPlannerItems([
    {
      id: 'a',
      task_id: 't1',
      channel: 'Instagram',
      status: 'scheduled',
      scheduled_at: '2026-09-19T12:14:00.000Z',
      task: { id: 't1', title: 'Coleção', client_id: 'c1', clientes: { empresa: 'Impacto' } },
    },
    {
      id: 'b',
      task_id: 't1',
      channel: 'Facebook',
      status: 'scheduled',
      scheduled_at: '2026-09-19T12:14:00.000Z',
      task: { id: 't1', title: 'Coleção', client_id: 'c1', clientes: { empresa: 'Impacto' } },
    },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].instagram, true);
  assert.equal(items[0].facebook, true);
  assert.equal(items[0].title, 'Coleção');
}

function testSkipsCancelled() {
  const items = buildPlannerItems([
    { id: 'x', channel: 'Instagram', status: 'cancelled', scheduled_for: '2026-09-19' },
    { id: 'y', channel: 'Instagram', status: 'published', scheduled_for: '2026-09-19', task: { title: 'Ok' } },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Ok');
}

function testDayFilter() {
  const date = new Date(2026, 8, 19, 9, 14);
  const items = [{ dayKey: plannerDayKey(date), time: plannerTimeLabel(date) }];
  assert.equal(itemsForDay(items, date).length, 1);
  assert.equal(itemsForDay(items, new Date(2026, 8, 20)).length, 0);
}

function testChannelFilter() {
  const ig = { instagram: true, facebook: false, format: 'reels' };
  const fb = { instagram: false, facebook: true, format: 'post' };
  assert.equal(matchesPlannerFilter(ig, 'all'), true);
  assert.equal(matchesPlannerFilter(ig, 'facebook'), false);
  assert.equal(matchesPlannerFilter(fb, 'facebook'), true);
  assert.equal(matchesPlannerFilter(ig, 'reels'), true);
  assert.equal(matchesPlannerFilter(fb, 'reels'), false);
  assert.equal(matchesPlannerFilter({ format: '', taskType: 'reels', title: 'Arte' }, 'reels'), true);
}

testGroupsSameSlot();

function testPartialPublicationDoesNotHideOutstandingChannels() {
  const make = (status, channel) => ({ task_id: 'mixed', id: channel, channel, status, scheduled_for: '2026-10-20' });
  for (const rows of [
    [make('published', 'Instagram'), make('pending', 'Facebook')],
    [make('pending', 'Facebook'), make('published', 'Instagram')],
  ]) assert.equal(buildPlannerItems(rows)[0].status, 'pending');
  assert.equal(buildPlannerItems([make('published', 'Instagram'), make('failed', 'Facebook')])[0].status, 'failed');
  assert.equal(buildPlannerItems([make('scheduled', 'Instagram'), make('pending', 'Facebook')])[0].status, 'pending');
}

function testSchedulingNeedsDispatchEvidence() {
  assert.equal(buildPlannerItems([{ id: 'no-dispatch', channel: 'YouTube', status: 'scheduled', scheduled_at: '2026-10-20T15:00:00Z' }])[0].status, 'pending');
  assert.equal(plannerItemCanMove({ status: 'scheduled', publications: [{ status: 'scheduled', channel: 'Facebook', meta_post_id: 'scheduled-on-meta' }] }), false);
  assert.equal(planner.plannerPublicationState({ status: 'scheduled', channel: 'Instagram', scheduled_for: '2026-10-20' }).label, 'Horário definido');
  assert.equal(planner.plannerPublicationState({ status: 'scheduled', channel: 'Instagram', scheduled_at: '2026-10-20T15:00:00Z', meta_dispatch: { hold: true } }).label, 'Agendado no Planeje');
  assert.equal(planner.plannerPublicationState({ status: 'scheduled', channel: 'Facebook', meta_post_id: 'meta-post' }).label, 'Agendado na Meta');
  assert.equal(planner.plannerPublicationState({ status: 'scheduled', channel: 'YouTube', meta_dispatch: { hold: true } }).label, 'Horário definido');
  assert.equal(planner.plannerPublicationState({ status: 'published', evidence_url: 'https://example.org' }).label, 'Publicação informada');
  assert.equal(planner.plannerPublicationState({ status: 'published', meta_post_id: 'meta-post' }).label, 'Publicado pela integração');
  assert.equal(planner.plannerPublicationState({ status: 'client_posts' }).label, 'Cliente publica');
}

testPartialPublicationDoesNotHideOutstandingChannels();
testSchedulingNeedsDispatchEvidence();
testSkipsCancelled();
testDayFilter();
testChannelFilter();

function testFormatAndMove() {
  assert.equal(plannerFormatLabel({ format: 'reels' }), 'Reels');
  assert.equal(plannerFormatLabel({ format: 'carrossel' }), 'Carrossel');
  assert.equal(plannerFormatLabel({ title: 'Arte do feed' }), 'Estático');
  const moved = movePlannerItemToDay({ time: '18:00' }, '2026-12-03');
  assert.equal(moved.scheduled_for, '2026-12-03');
  assert.equal(moved.scheduled_at.startsWith('2026-12-03T'), true);
  assert.equal(plannerItemCanMove({ status: 'published' }), false);
  assert.equal(plannerItemCanMove({ status: 'scheduled' }), true);
  const counts = plannerStatusCounts([
    { status: 'pending' },
    { status: 'published' },
    { status: 'published' },
    { status: 'failed' },
  ]);
  assert.equal(counts.published, 2);
  assert.equal(counts.failed, 1);
  assert.equal(matchesPlannerSearch({ title: 'Organização financeira', caption: '' }, 'financeira'), true);
  assert.equal(matchesPlannerSearch({ title: 'Reels', caption: '' }, 'carrossel'), false);
}

testFormatAndMove();

function testWeekDropKeepsWeekday() {
  const week = [
    new Date(2026, 11, 7),
    new Date(2026, 11, 8),
    new Date(2026, 11, 9),
    new Date(2026, 11, 10),
    new Date(2026, 11, 11),
    new Date(2026, 11, 12),
    new Date(2026, 11, 13),
  ];
  const monday = targetDayInWeek({ date: new Date(2026, 10, 30, 18, 0) }, week);
  assert.equal(plannerDayKey(monday), '2026-12-07');
  const thursday = targetDayInWeek({ date: new Date(2026, 11, 3, 18, 0) }, week);
  assert.equal(plannerDayKey(thursday), '2026-12-10');
}

testWeekDropKeepsWeekday();
console.log('socialPlannerItems.test.mjs PASS');
