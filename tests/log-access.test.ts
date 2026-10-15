import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { resolveLogAccess, withLogWriteAccess } from '../lib/log-access';
import { handleSessionRead, handleSessionWrite } from '../lib/session-api';
import { handleCourseWrite } from '../lib/courses-api';
import { handleTotalsRead } from '../lib/totals-api';
import { handleLearningMcp } from '../lib/learning-mcp';

const grant = { ownerId: 'learner-a', viewerEmail: 'mentor@example.test', ownerName: 'Test learner' };
const learner = { userId: 'learner-a', email: 'learner@example.test' };
const mentor = { userId: 'mentor-b', email: 'mentor@example.test' };

test('only the verified invited email resolves to the learner; other identities keep their own logs', () => {
  assert.deepEqual(resolveLogAccess(mentor, grant), { ownerId: 'learner-a', readOnly: true, ownerName: 'Test learner' });
  assert.equal(resolveLogAccess({ ...mentor, email: ' MENTOR@EXAMPLE.TEST ' }, grant)?.readOnly, true);
  assert.deepEqual(resolveLogAccess(learner, grant), { ownerId: 'learner-a', readOnly: false, ownerName: null });
  assert.equal(resolveLogAccess({ userId: 'stranger', email: 'mentor@example.test.evil' }, grant)?.ownerId, 'stranger');
  assert.equal(resolveLogAccess({ ...mentor, email: 'stranger@example.test' }, grant)?.ownerId, 'mentor-b');
  assert.equal(resolveLogAccess(null, grant), null);
  assert.equal(resolveLogAccess({ userId: '', email: mentor.email }, grant), null);
  assert.equal(resolveLogAccess(mentor, { viewerEmail: grant.viewerEmail }), null);
  // Removing the grant removes access to the learner's records.
  assert.equal(resolveLogAccess(mentor, {})?.ownerId, mentor.userId);
});

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) sqlite.exec(readFileSync('drizzle/' + file, 'utf8'));
  sqlite.exec("INSERT INTO sessions (id,owner,activity,state,started_at,stopped_at,day,elapsed_ms,version,what) VALUES ('learner-session','learner-a','Exercism JavaScript','stopped',1000,61000,'2026-10-15',60000,0,'Learner note'), ('mentor-session','mentor-b','Exercism JavaScript','stopped',1000,121000,'2026-10-15',120000,0,'Mentor private note'), ('stranger-session','stranger','Exercism JavaScript','stopped',1000,181000,'2026-10-15',180000,0,'Stranger private note')");
  let queries = 0;
  const db = { prepare(sql: string) {
    queries++;
    return { bind(...args: (string | number | null)[]) { return {
      async all() { return { results: sqlite.prepare(sql).all(...args) }; },
      async first() { return sqlite.prepare(sql).get(...args) ?? null; },
      async run() { return { meta: { changes: sqlite.prepare(sql).run(...args).changes } }; },
    }; } };
  } } as unknown as D1Database;
  return { sqlite, db, queries: () => queries };
}

test('browser history, totals and MCP share the same learner records without leaking other users', async () => {
  const f = fixture();
  try {
    const access = resolveLogAccess(mentor, grant)!;
    const history = await handleSessionRead(access.ownerId, () => f.db);
    const snapshot = await history.json() as { sessions: { id: string }[] };
    assert.deepEqual(snapshot.sessions.map(s => s.id), ['learner-session']);
    const totals = await (await handleTotalsRead(access.ownerId, () => f.db)).json() as { elapsedMs: number; sessionCount: number };
    assert.equal(totals.elapsedMs, 60000);
    assert.equal(totals.sessionCount, 1);
    const response = await handleLearningMcp(new Request('https://test.local/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_learning_sessions', arguments: { date: '2026-10-15' } } }) }), { access: async () => access, database: () => f.db });
    const rpc = await response.json() as { result: { structuredContent: { data_owner: string; access: string; sessions: { id: string }[]; total_completed_minutes: number } } };
    assert.equal(rpc.result.structuredContent.data_owner, 'Test learner');
    assert.equal(rpc.result.structuredContent.access, 'read_only');
    assert.deepEqual(rpc.result.structuredContent.sessions.map(s => s.id), ['learner-session']);
    assert.equal(rpc.result.structuredContent.total_completed_minutes, 1);
    assert.equal(JSON.stringify(rpc).includes('private note'), false);
    const own = await (await handleSessionRead(resolveLogAccess(learner, grant)!.ownerId, () => f.db)).json() as { sessions: { id: string }[] };
    assert.deepEqual(own.sessions.map(s => s.id), ['learner-session']);
    const revoked = await (await handleSessionRead(resolveLogAccess(mentor, {})!.ownerId, () => f.db)).json() as { sessions: { id: string }[] };
    assert.deepEqual(revoked.sessions.map(s => s.id), ['mentor-session']);
  } finally { f.sqlite.close(); }
});

test('every session and activity mutation is rejected for the mentor before any database access', async () => {
  const f = fixture();
  try {
    const before = f.sqlite.prepare('SELECT * FROM sessions').all();
    const access = resolveLogAccess(mentor, grant);
    for (const action of ['start', 'pause', 'resume', 'stop', 'manual', 'edit', 'edit_activity', 'delete']) {
      const r = await withLogWriteAccess(access, owner => handleSessionWrite(new Request('https://test.local/api/sessions', { method: 'POST', body: JSON.stringify({ action, id: 'learner-session' }) }), owner, () => f.db));
      assert.equal(r.status, 403, action);
    }
    for (const method of ['POST', 'PATCH']) {
      const r = await withLogWriteAccess(access, owner => handleCourseWrite(new Request('https://test.local/api/courses', { method, body: '{}' }), owner, () => f.db));
      assert.equal(r.status, 403, method);
    }
    assert.equal((await withLogWriteAccess(null, async () => { throw new Error('Must not run'); })).status, 401);
    assert.equal(f.queries(), 0);
    assert.deepEqual(f.sqlite.prepare('SELECT * FROM sessions').all(), before);
    let ownerPassed: string | null = null;
    const own = await withLogWriteAccess(resolveLogAccess(learner, grant), async owner => { ownerPassed = owner; return Response.json({ ok: true }); });
    assert.equal(own.status, 200);
    assert.equal(ownerPassed, 'learner-a');
  } finally { f.sqlite.close(); }
});
