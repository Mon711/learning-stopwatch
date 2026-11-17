import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { d1 } from './database';
import { goalInput, targetDuration, goalPeriod, goalProgress, presetDates, scopeDescription, type GoalDefinition, type Goal } from '../lib/goals';
import { listGoals, readGoals, writeGoal } from '../lib/goals-store';
import { handleGoalsRead, handleGoalsWrite } from '../lib/goals-api';
import { ensureAreas, initialAreas, writeArea, listAreas } from '../lib/learning-areas';
import { listActivities, addCourse, editCourse, assignArea, changeActivityStatus } from '../lib/courses';
import { handleSessionWrite, handleSessionRead } from '../lib/session-api';
import { withLogWriteAccess } from '../lib/log-access';
import { indiaDay, csv, type Session } from '../lib/stopwatch';
import { learningTotals } from '../lib/learning-totals';

const owner = 'synthetic-goal-owner', now = Date.parse('2026-11-17T18:00:00+05:30');
const definition: GoalDefinition = { name: 'Combined study', startDay: '2026-11-17', endDay: '2026-11-22', targetMs: 7 * 3600000, scope: { kind: 'all' } };
function fixture() {
 const sqlite = new DatabaseSync(':memory:');
 for (const file of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) sqlite.exec(readFileSync('drizzle/' + file, 'utf8'));
 return { sqlite, db: d1(sqlite) };
}
function session(day: string, elapsed_ms: number, activity = 'Example', state: Session['state'] = 'stopped'): Session {
 return { id: randomUUID(), activity, day, elapsed_ms, state, started_at: Date.parse(day + 'T12:00:00+05:30'), stopped_at: null, resumed_at: null, version: 0, what: '' };
}
function goal(overrides: Partial<Goal> = {}): Goal { return { ...definition, id: randomUUID(), revision: 0, history: [], createdAt: now, updatedAt: now, ...overrides }; }
async function create(db: D1Database, overrides: Partial<GoalDefinition> = {}, who = owner) {
 const id = randomUUID(); await writeGoal(db, who, { ...definition, ...overrides, id, action: 'create' }, now); return id;
}
async function seed() {
 const f = fixture(); await ensureAreas(f.db, owner);
 for (const [name, type, areaId] of [['Independent project', 'Project', initialAreas[0].id], ['Music practice', 'Skill Practice', initialAreas[2].id]] as const) await addCourse(f.db, owner, randomUUID(), { name, type, areaId });
 const activities = await listActivities(f.db, owner);
 for (const [name, minutes] of [['Ed Donner AI Engineering', 120], ['Scrimba Full Stack', 90], ['Exercism JavaScript', 60], ['Independent project', 30], ['Music practice', 20]] as const) {
  const activity = activities.find(a => a.name === name)!;
  f.sqlite.prepare("INSERT INTO sessions(id,owner,activity,activity_id,state,started_at,stopped_at,day,elapsed_ms,what) VALUES (?,?,?,?,'stopped',1,2,'2026-11-17',?,'Synthetic note')").run(randomUUID(), owner, name, activity.recordId!, minutes * 60000 + 123);
 }
 return f;
}

test('goal input validates dates, positive whole-minute targets and exactly the requested scopes', () => {
 assert.equal(targetDuration('7', '30'), 450 * 60000); assert.equal(targetDuration('', '15'), 15 * 60000);
 for (const values of [['0', ''], ['-1', '0'], ['1', '-1'], ['1', '60'], ['1.5', '0'], ['1e3', '0'], ['1', 'Infinity'], ['99999999999999999', '0']]) assert.throws(() => targetDuration(...values as [string, string]));
 for (const change of [{ name: ' ' }, { name: 'x'.repeat(101) }, { startDay: '2026-02-30' }, { endDay: '2026-11-16' }, { endDay: '2026-11-22extra' }, { startDay: '0000-01-01' }, { targetMs: 0 }, { targetMs: -60000 }, { targetMs: 60001 }, { targetMs: NaN }, { scope: { kind: 'areas', areaIds: [] } }, { scope: { kind: 'activity', activityId: '' } }, { scope: { kind: 'type' } }, { scope: null }]) assert.throws(() => goalInput({ ...definition, ...change }));
 assert.equal(goalInput({ ...definition, startDay: '2024-02-29', endDay: '2024-02-29' }).startDay, '2024-02-29');
 assert.deepEqual(goalInput({ ...definition, scope: { kind: 'areas', areaIds: ['b', 'a', 'b'] } }).scope, { kind: 'areas', areaIds: ['a', 'b'] });
});

test('inclusive India-date presets cover weeks, fortnight, leap month, year rollover and UTC boundaries', () => {
 assert.equal(indiaDay(Date.parse('2026-11-16T18:30:00Z')), '2026-11-17');
 assert.deepEqual(presetDates('This Week', now), { startDay: '2026-11-16', endDay: '2026-11-22' });
 assert.deepEqual(presetDates('Next Week', now), { startDay: '2026-11-23', endDay: '2026-11-29' });
 assert.deepEqual(presetDates('Next 7 Days', now), { startDay: '2026-11-17', endDay: '2026-11-23' });
 assert.deepEqual(presetDates('Next 14 Days', now), { startDay: '2026-11-17', endDay: '2026-11-30' });
 assert.deepEqual(presetDates('This Month', Date.parse('2024-02-10T00:00Z')), { startDay: '2024-02-01', endDay: '2024-02-29' });
 assert.deepEqual(presetDates('Next Month', Date.parse('2026-12-31T19:00Z')), { startDay: '2027-02-01', endDay: '2027-02-28' });
 assert.equal(presetDates('Custom', now), null);
 const g = goal(); assert.equal(goalPeriod(g, '2026-11-16'), 'upcoming'); assert.equal(goalPeriod(g, '2026-11-17'), 'current'); assert.equal(goalPeriod(g, '2026-11-22'), 'current'); assert.equal(goalPeriod(g, '2026-11-23'), 'past');
});

test('progress is precise, independent for overlaps, inclusive and restricted to saved completed start dates', () => {
 const records = [session('2026-11-16', 999999), session('2026-11-17', 60001), session('2026-11-22', 119999), session('2026-11-23', 999999), session('2026-11-17', 999999, 'Example', 'running'), session('2026-11-17', 999999, 'Example', 'paused')];
 const before = structuredClone(records), a = goal({ targetMs: 60000 }), b = goal({ startDay: '2026-11-22' });
 const result = goalProgress([a, b, goal({ startDay: '2027-01-01', endDay: '2027-02-01' })], records, []);
 assert.deepEqual(result.map(r => r.completedMs), [180000, 119999, 0]); assert.equal(result[0].completedMs / result[0].targetMs * 100, 300); assert.deepEqual(records, before);
});

test('schema-only goal migration preserves every pre-existing field and duration', async () => {
 const sqlite = new DatabaseSync(':memory:');
 try {
  for (const file of readdirSync('drizzle').filter(f => f.endsWith('.sql') && !f.startsWith('0006')).sort()) sqlite.exec(readFileSync('drizzle/' + file, 'utf8'));
  const db = d1(sqlite); await ensureAreas(db, owner);
  sqlite.prepare("INSERT INTO sessions(id,owner,activity,state,started_at,stopped_at,day,elapsed_ms,version,what) VALUES ('preserve',?,'Historical','stopped',1,2,'2026-01-01',1234567,7,'Keep exact note')").run(owner);
  const tables = ['sessions', 'courses', 'learning_areas']; const before = tables.map(table => sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all());
  const migration = readFileSync('drizzle/0006_learning_goals.sql', 'utf8'); assert.doesNotMatch(migration, /\b(INSERT|UPDATE|DELETE|DROP|ALTER)\b/i); sqlite.exec(migration);
  assert.deepEqual(tables.map(table => sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all()), before);
  assert.deepEqual(await listGoals(db, owner), []);
 } finally { sqlite.close(); }
});

test('retrospective multi-area, activity and all-learning goals include inactive history without duplicating sessions or changing totals/CSV', async () => {
 const f = await seed(); try {
  const activities = await listActivities(f.db, owner), project = activities.find(a => a.name === 'Independent project')!;
  await changeActivityStatus(f.db, owner, project.id!, { action: 'archive', originalName: project.name, originalStatus: 'active', revision: project.revision });
  const js = activities.find(a => a.name === 'Exercism JavaScript')!; await changeActivityStatus(f.db, owner, js.id!, { action: 'delete', originalName: js.name, originalStatus: 'active', revision: js.revision, deleteHistory: false });
  const saved = (await (await handleSessionRead(owner, () => f.db)).json()) as { sessions: Session[] };
  const before = f.sqlite.prepare('SELECT * FROM sessions ORDER BY id').all(), output = csv(saved.sessions, activities), totals = learningTotals(saved.sessions, activities).elapsedMs;
  const allId = await create(f.db), areasId = await create(f.db, { scope: { kind: 'areas', areaIds: [initialAreas[0].id, initialAreas[1].id] } }), activityId = await create(f.db, { scope: { kind: 'activity', activityId: js.id! } });
  const result = await readGoals(f.db, owner); assert.equal(result.goals.find(g => g.id === allId)!.completedMs, 320 * 60000 + 5 * 123); assert.equal(result.goals.find(g => g.id === areasId)!.completedMs, 300 * 60000 + 4 * 123); assert.equal(result.goals.find(g => g.id === activityId)!.completedMs, 60 * 60000 + 123);
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM sessions ORDER BY id').all(), before); assert.equal(csv(saved.sessions, activities), output); assert.equal(learningTotals(saved.sessions, activities).elapsedMs, totals);
  assert.ok(scopeDescription(result.goals.find(g => g.id === activityId)!.scope, result.areas, result.activities).includes('(deleted)'));
 } finally { f.sqlite.close(); }
});

test('manual add, correction, deletion and paused overnight timer update goals from the same saved session rows', async () => {
 const f = fixture(); try {
  const id = await create(f.db, { startDay: '2026-11-16', endDay: '2026-11-16' }); const activity = 'Scrimba Full Stack';
  const command = async (body: object, at = now) => { const r = await handleSessionWrite(new Request('https://test.local/api/sessions', { method: 'POST', body: JSON.stringify(body) }), owner, () => f.db, at); assert.equal(r.status, 200, JSON.stringify(await r.clone().json())); return r.json() as Promise<{ sessions: Session[] }>; };
  const manualId = randomUUID(); await command({ id: manualId, action: 'manual', activity, start: '2026-11-16T23:50', end: '2026-11-17T00:10', what: 'Overnight manual' });
  assert.equal((await readGoals(f.db, owner)).goals[0].completedMs, 20 * 60000);
  await command({ id: manualId, action: 'edit', version: 0, minutes: 17.25, what: 'Correction' }); assert.equal((await readGoals(f.db, owner)).goals[0].completedMs, 17.25 * 60000);
  await command({ id: manualId, action: 'delete', version: 1 }); assert.equal((await readGoals(f.db, owner)).goals[0].completedMs, 0);
  const timerId = randomUUID(), start = Date.parse('2026-11-16T23:58:00+05:30');
  await command({ id: timerId, action: 'start', activity }, start); assert.equal((await readGoals(f.db, owner)).goals[0].completedMs, 0);
  await command({ id: timerId, action: 'pause', version: 0 }, start + 60001); assert.equal((await readGoals(f.db, owner)).goals[0].completedMs, 0);
  await command({ id: timerId, action: 'resume', version: 1 }, start + 5 * 60000);
  const result = await command({ id: timerId, action: 'stop', version: 2, what: 'Saved' }, start + 6 * 60000 + 12);
  assert.equal(result.sessions[0].day, '2026-11-16'); assert.equal((await readGoals(f.db, owner)).goals.find(g => g.id === id)!.completedMs, 120013);
  const nextDay = await create(f.db, { startDay: '2026-11-17', endDay: '2026-11-17' }); assert.equal((await readGoals(f.db, owner)).goals.find(g => g.id === nextDay)!.completedMs, 0);
 } finally { f.sqlite.close(); }
});

test('past results stay live through renaming, reclassification, archive, retained deletion and explicit history deletion', async () => {
 const f = await seed(); try {
  const a = (await listActivities(f.db, owner)).find(a => a.name === 'Scrimba Full Stack')!, areasId = await create(f.db, { endDay: '2026-11-17', scope: { kind: 'areas', areaIds: [initialAreas[1].id] } }), activityId = await create(f.db, { scope: { kind: 'activity', activityId: a.id! } });
  const before = f.sqlite.prepare('SELECT * FROM sessions ORDER BY id').all(); await assignArea(f.db, owner, a.id!, { areaId: initialAreas[2].id, revision: a.revision }); assert.deepEqual(f.sqlite.prepare('SELECT * FROM sessions ORDER BY id').all(), before);
  assert.equal((await readGoals(f.db, owner, Date.parse('2026-12-01'))).goals.find(g => g.id === areasId)!.completedMs, 60 * 60000 + 123);
  const moved = (await listActivities(f.db, owner)).find(x => x.id === a.id)!;
  await editCourse(f.db, owner, a.id!, { name: 'Renamed course', type: moved.type, link: moved.link, areaId: moved.areaId, revision: moved.revision, originalName: moved.name });
  let result = await readGoals(f.db, owner); assert.equal(result.goals.find(g => g.id === activityId)!.completedMs, 90 * 60000 + 123); assert.equal(scopeDescription(result.goals.find(g => g.id === activityId)!.scope, result.areas, result.activities), 'Activity: Renamed course');
  await writeArea(f.db, owner, { id: initialAreas[1].id, action: 'rename', revision: 0, name: 'Software studies' }); result = await readGoals(f.db, owner); assert.equal(scopeDescription(result.goals.find(g => g.id === areasId)!.scope, result.areas, result.activities), 'Learning areas: Software studies');
  const renamed = result.activities.find(x => x.id === a.id)!;
  await changeActivityStatus(f.db, owner, renamed.id!, { action: 'archive', originalName: renamed.name, originalStatus: 'active', revision: renamed.revision });
  assert.equal((await readGoals(f.db, owner)).goals.find(g => g.id === activityId)!.completedMs, 90 * 60000 + 123);
  const archived = (await listActivities(f.db, owner)).find(x => x.id === a.id)!;
  await changeActivityStatus(f.db, owner, archived.id!, { action: 'delete', originalName: archived.name, originalStatus: 'archived', revision: archived.revision, deleteHistory: true });
  assert.equal((await readGoals(f.db, owner)).goals.find(g => g.id === activityId)!.completedMs, 0);
 } finally { f.sqlite.close(); }
});

test('goal edits record readable changes, survive reloads, reject stale saves and deletes, and never remove sessions', async () => {
 const f = await seed(); try {
  const before = f.sqlite.prepare('SELECT * FROM sessions ORDER BY id').all(), id = await create(f.db), upcoming = await create(f.db, { startDay: '2027-01-01', endDay: '2027-01-31' });
  const input = { ...definition, id, action: 'edit', revision: 0, name: 'Updated study', startDay: '2026-11-01', targetMs: 3600000, scope: { kind: 'areas', areaIds: [initialAreas[0].id] } };
  await writeGoal(f.db, owner, input, now + 1000);
  const saved = (await listGoals(f.db, owner)).find(g => g.id === id)!; assert.equal(saved.revision, 1); assert.equal(saved.history.length, 1); assert.deepEqual(saved.history[0].changes.map(c => c.field), ['Name', 'Dates', 'Target', 'Scope']);
  assert.equal(saved.history[0].changes[3].to, 'Learning areas: AI Engineering'); assert.equal(saved.history[0].at, now + 1000);
  await assert.rejects(writeGoal(f.db, owner, input), /another tab/); await assert.rejects(writeGoal(f.db, owner, { action: 'delete', id, revision: 0 }), /another tab/);
  await writeGoal(f.db, owner, { ...input, revision: 1 }); assert.equal((await listGoals(f.db, owner)).find(g => g.id === id)!.history.length, 1, 'No-op edit creates no history');
  await writeGoal(f.db, owner, { action: 'delete', id, revision: 1 }); assert.deepEqual((await listGoals(f.db, owner)).map(g => g.id), [upcoming]);
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM sessions ORDER BY id').all(), before);
 } finally { f.sqlite.close(); }
});

test('area deletion requires explicit scope changes even for past or empty-area goals, then preserves sessions', async () => {
 const f = await seed(); try {
  const id = await create(f.db, { startDay: '2020-01-01', endDay: '2020-01-01', scope: { kind: 'areas', areaIds: [initialAreas[0].id] } });
  await assert.rejects(writeArea(f.db, owner, { id: initialAreas[0].id, revision: 0, action: 'delete', destinationId: initialAreas[1].id }), /Combined study.*Edit their scopes.*Past goals/);
  const saved = (await listGoals(f.db, owner))[0]; await writeGoal(f.db, owner, { ...saved, action: 'edit', scope: { kind: 'all' } });
  const before = f.sqlite.prepare('SELECT * FROM sessions ORDER BY id').all(); await writeArea(f.db, owner, { id: initialAreas[0].id, revision: 0, action: 'delete', destinationId: initialAreas[1].id });
  assert.equal((await listAreas(f.db, owner)).some(a => a.id === initialAreas[0].id), false); assert.deepEqual(f.sqlite.prepare('SELECT * FROM sessions ORDER BY id').all(), before); assert.equal((await listGoals(f.db, owner))[0].id, id); assert.equal((await listGoals(f.db, owner))[0].history[0].changes[0].from, 'Learning areas: AI Engineering');
  const empty = randomUUID(); await writeArea(f.db, owner, { id: empty, action: 'create', name: 'Empty goal area' }); await create(f.db, { scope: { kind: 'areas', areaIds: [empty] } });
  await assert.rejects(writeArea(f.db, owner, { id: empty, revision: 0, action: 'delete' }), /used by goals/);
 } finally { f.sqlite.close(); }
});

test('concurrent goal reference blocks the entire area reassignment transaction', async () => {
 const f = await seed(); try {
  const before = f.sqlite.prepare('SELECT * FROM courses ORDER BY id').all(), batch = f.db.batch.bind(f.db); let once = false;
  f.db.batch = async statements => { if (!once) { once = true; await create(f.db, { scope: { kind: 'areas', areaIds: [initialAreas[0].id] } }); } return batch(statements); };
  await assert.rejects(writeArea(f.db, owner, { id: initialAreas[0].id, revision: 0, action: 'delete', destinationId: initialAreas[1].id }));
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM courses ORDER BY id').all(), before); assert.ok((await listAreas(f.db, owner)).some(a => a.id === initialAreas[0].id));
 } finally { f.sqlite.close(); }
});

test('reference and revision guards reject changes racing a goal save without partial updates', async () => {
 const f = await seed(); try {
  const empty = randomUUID(); await writeArea(f.db, owner, { action: 'create', id: empty, name: 'Temporary scope' });
  const original = f.db.prepare.bind(f.db); let deleteBeforeInsert = true;
  f.db.prepare = ((sql: string) => {
   const statement = original(sql);
   if (sql.startsWith('INSERT INTO learning_goals') && deleteBeforeInsert) {
    const run = statement.run.bind(statement);
    statement.run = async () => { deleteBeforeInsert = false; f.sqlite.prepare('DELETE FROM learning_areas WHERE owner=? AND id=?').run(owner, empty); return run(); };
   }
   return statement;
  }) as D1Database['prepare'];
  await assert.rejects(create(f.db, { scope: { kind: 'areas', areaIds: [empty] } }), /scope or goal changed/); assert.deepEqual(await listGoals(f.db, owner), []);
  const id = await create(f.db); const saved = (await listGoals(f.db, owner))[0];
  f.db.prepare = ((sql: string) => {
   const statement = original(sql);
   if (sql.startsWith('UPDATE learning_goals SET name=')) {
    const run = statement.run.bind(statement);
    statement.run = async () => { f.sqlite.prepare('UPDATE learning_goals SET revision=revision+1 WHERE owner=? AND id=?').run(owner, id); return run(); };
   }
   return statement;
  }) as D1Database['prepare'];
  await assert.rejects(writeGoal(f.db, owner, { ...saved, action: 'edit', name: 'Conflicting edit' }), /another tab/);
  const after = (await listGoals(f.db, owner))[0]; assert.equal(after.name, saved.name); assert.deepEqual(after.history, []);
  f.db.prepare = original;
 } finally { f.sqlite.close(); }
});

test('goal requests enforce owner isolation, mentor read-only access, origins and input validation', async () => {
 const f = await seed(); try {
  const id = await create(f.db), before = f.sqlite.prepare('SELECT * FROM sessions ORDER BY id').all();
  assert.equal((await handleGoalsRead(null, () => { throw new Error('Do not access DB'); })).status, 401);
  assert.equal((await handleGoalsWrite(new Request('https://test.local/api/goals', { method: 'POST' }), null, () => f.db)).status, 401);
  assert.equal((await handleGoalsWrite(new Request('https://test.local/api/goals', { method: 'POST', headers: { Origin: 'https://elsewhere.test' } }), owner, () => f.db)).status, 403);
  for (const body of ['null', '[]', 'invalid']) assert.equal((await handleGoalsWrite(new Request('https://test.local/api/goals', { method: 'POST', body }), owner, () => f.db)).status, 400);
  assert.equal((await withLogWriteAccess({ ownerId: owner, readOnly: true, ownerName: 'Example learner' }, who => handleGoalsWrite(new Request('https://test.local/api/goals', { method: 'POST', body: JSON.stringify({ id, action: 'delete', revision: 0 }) }), who, () => f.db))).status, 403);
  await assert.rejects(writeGoal(f.db, 'other-owner', { ...definition, id, action: 'edit', revision: 0 })); assert.equal((await listGoals(f.db, 'other-owner')).length, 0);
  const foreign = randomUUID(); await writeArea(f.db, 'other-owner', { id: foreign, action: 'create', name: 'Private area' });
  await assert.rejects(create(f.db, { scope: { kind: 'areas', areaIds: [foreign] } })); await assert.rejects(create(f.db, { scope: { kind: 'activity', activityId: foreign } }));
  await writeGoal(f.db, owner, { ...definition, id, action: 'create' }); assert.equal((await listGoals(f.db, owner)).length, 1, 'Create retry does not duplicate goal');
  const read = await handleGoalsRead(owner, () => f.db); assert.equal(read.headers.get('Cache-Control'), 'no-store'); assert.equal((await read.json() as { goals: unknown[] }).goals.length, 1);
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM sessions ORDER BY id').all(), before);
 } finally { f.sqlite.close(); }
});
