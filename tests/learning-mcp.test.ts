import { d1 } from './database';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import { addCourse,courseInput,listActivities } from '../lib/courses';
import { handleLearningMcp } from '../lib/learning-mcp';
import { readGoals, writeGoal } from '../lib/goals-store';
import { ensureAreas, initialAreas } from '../lib/learning-areas';
import { activities } from '../lib/stopwatch';

const now = Date.parse('2026-10-03T20:30:00Z'); // 4 Oct, 02:00 IST.
type RpcReply = {
  error: { code: number };
  result: {
    protocolVersion: string;
    isError: boolean;
    content: { type: string; text: string }[];
    tools: { name: string; annotations: { readOnlyHint: boolean } }[];
    structuredContent: {
      saved: boolean;
      id: string;
      date: string;
      sessions: { id: string; state: string; duration_minutes: number; what_i_did: string; optional_notes: string }[];
      total_completed_minutes: number;
      completed_session_count: number;
      total_completed_ms: number;
      next_offset: number | null;
      access: string;
      data_owner: string;
      in_progress_sessions: { id: string; state: string; duration_ms: number }[];
      by_learning_area: { id: string; total_completed_ms: number; inactive_minutes: number }[];
      by_activity_type: { type: string; total_completed_ms: number }[];
      by_activity: { id: string; status: string; total_completed_ms: number }[];
      goals: { id: string; revision: number; name: string; completed_ms: number; target_ms: number; period: string; status: string; progress_percent: number; remaining_minutes: number; over_target_minutes: number; scope_description: string; edit_history: { at: string; changes: { field: string; from: string; to: string }[] }[] }[];
    };
  };
};
function fixture(owner: string | null = 'owner-a', readOnly = false) {
  const sqlite = new DatabaseSync(':memory:');
  for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync('drizzle/'+f,'utf8'));
  const insert = sqlite.prepare('INSERT INTO sessions (id,owner,activity,state,started_at,stopped_at,day,elapsed_ms,resumed_at,version,what) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)');
  insert.run('completed-a', 'owner-a', 'Exercism JavaScript', 'stopped', now - 7200000, now - 6000000, '2026-10-04', 900000, null, 'Finished exercise 6');
  insert.run('completed-b', 'owner-a', 'Ed Donner AI Engineering', 'stopped', now - 5000000, now - 4000000, '2026-10-04', 1200000, null, 'Read Week 4');
  insert.run('running-a', 'owner-a', 'Exercism JavaScript', 'running', now - 3000000, null, '2026-10-04', 60000, now - 60000, '');
  insert.run('other-owner', 'owner-b', 'Exercism JavaScript', 'stopped', now - 7200000, now - 6000000, '2026-10-04', 999900000, null, 'PRIVATE OTHER USER');
  insert.run('other-day', 'owner-a', 'Exercism JavaScript', 'stopped', now - 90000000, now - 80000000, '2026-10-03', 999900000, null, 'Earlier date');
  let queries = 0;const queried:string[]=[];
  const db=d1(sqlite,sql=>{queries++;queried.push(sql);});
  const send = async (method: string, params: unknown = {}, id: unknown = 1, origin?: string) => {
    const response = await handleLearningMcp(new Request('https://stopwatch.test/mcp', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
      body: JSON.stringify({ jsonrpc: '2.0', ...(id === undefined ? {} : { id }), method, params }),
    }), { access: async () => owner ? { ownerId: owner, readOnly, ownerName: readOnly ? 'Shared learner' : null } : null, database: () => db, now: () => now });
    return { status: response.status, body: await response.json() as RpcReply };
  };
  return { send,db,sqlite, queries: () => queries,historyQueries:()=>queried.filter(sql=>/FROM sessions/i.test(sql)).length, close: () => sqlite.close() };
}

test('custom courses persist per owner, prevent duplicates and allow safe retries',async()=>{
 const f=fixture();
 try{
  await addCourse(f.db,'owner-a','course-a',{name:'  Rust   fundamentals ',link:'https://example.com/rust'},now);
  await addCourse(f.db,'owner-a','course-a',{name:'Rust fundamentals',link:'https://example.com/rust'},now);
  assert.equal((await listActivities(f.db,'owner-a')).filter(a=>a.name==='Rust fundamentals').length,1);
  assert.equal((await listActivities(f.db,'owner-b')).length,3);
  await assert.rejects(addCourse(f.db,'owner-a','duplicate',{name:'rust fundamentals'}),/already/);
  await assert.rejects(addCourse(f.db,'owner-a','default',{name:'scrimba full stack'}),/already/);
  await addCourse(f.db,'owner-b','course-b',{name:'Rust fundamentals'},now);
  const own=(await listActivities(f.db,'owner-a')).at(-1)!;
  assert.equal(own.link,'https://example.com/rust');
  f.sqlite.prepare('INSERT INTO sessions (id,owner,activity,state,started_at,stopped_at,day,elapsed_ms,resumed_at,version,what) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)').run('custom-session','owner-a','Rust fundamentals','stopped',now-60000,now,'2026-10-04',60000,null,'Ownership');
  const r=await f.send('tools/call',{name:'get_learning_sessions',arguments:{activity:'Rust fundamentals'}});
  assert.equal(r.body.result.structuredContent.total_completed_minutes,1);
  assert.equal(r.body.result.structuredContent.sessions[0].id,'custom-session');
 }finally{f.close();}
});

test('course names and links are validated before saving',()=>{
 for(const name of ['', '   ', 'a'.repeat(121)])assert.throws(()=>courseInput({name}));
 for(const link of ['javascript:alert(1)','data:text/html,x','example.com','https://user:pass@example.com'])assert.throws(()=>courseInput({name:'Course',link}));
 assert.equal(courseInput({name:'Course'}).link,'');
});

test('discovery exposes five read tools and three explicit goal writes without private records', async () => {
  const f = fixture(null);
  try {
    const init = await f.send('initialize', { protocolVersion: '2025-03-26' });
    assert.equal(init.body.result.protocolVersion, '2025-03-26');
    const list = await f.send('tools/list');
    assert.deepEqual(list.body.result.tools.map((t: { name: string }) => t.name), ['get_learning_sessions','get_learning_activities','get_learning_areas','get_learning_goals','get_learning_totals','create_learning_goal','update_learning_goal','delete_learning_goal']);
    assert.ok(list.body.result.tools.slice(0, 5).every(t => t.annotations.readOnlyHint));
    assert.ok(list.body.result.tools.slice(5).every(t => !t.annotations.readOnlyHint));
    assert.equal(f.queries(), 0);
  } finally { f.close(); }
});

test('anonymous tool calls never read the database', async () => {
  const f = fixture(null);
  try {
    for(const name of ['get_learning_sessions','get_learning_activities','get_learning_areas','get_learning_goals','get_learning_totals']){const r=await f.send('tools/call',{name});assert.equal(r.status,401);}
    assert.equal(f.queries(), 0);
  } finally { f.close(); }
});

test('today uses IST, isolates owners, excludes unfinished sessions and retains IDs', async () => {
  const f = fixture();
  try {
    const r = await f.send('tools/call', { name: 'get_learning_sessions' });
    const data = r.body.result.structuredContent;
    assert.equal(data.date, '2026-10-04');
    assert.deepEqual(data.sessions.map((s: { id: string }) => s.id), ['completed-a', 'completed-b']);
    assert.equal(data.total_completed_minutes, 35);
    assert.equal(data.completed_session_count, 2);
    assert.equal(data.sessions[0].what_i_did, 'Finished exercise 6');
    assert.equal(data.sessions[0].optional_notes, 'Stopwatch session completed-a');
    assert.equal(JSON.stringify(data).includes('PRIVATE OTHER USER'), false);
  } finally { f.close(); }
});

test('activity filter and live elapsed time leave completed totals unchanged', async () => {
  const f = fixture();
  try {
    const r = await f.send('tools/call', { name: 'get_learning_sessions', arguments: { date: '2026-10-04', activity: 'Exercism JavaScript', include_in_progress: true } });
    const data = r.body.result.structuredContent;
    assert.deepEqual(data.sessions.map((s: { id: string }) => s.id), ['completed-a', 'running-a']);
    assert.equal(data.sessions[1].duration_minutes, 2);
    assert.equal(data.sessions[1].state, 'running');
    assert.equal(data.total_completed_minutes, 15);
    assert.equal(data.completed_session_count, 1);
  } finally { f.close(); }
});

test('bad dates, owner overrides, invalid filters and write tools are rejected', async () => {
  const f = fixture();
  try {
    for (const args of [{ date: '2026-02-30' }, { date: '4th Oct, 2026' }, { owner: 'owner-b' }, { activity: 'Other' }, { include_in_progress: 'true' }]) {
      const r = await f.send('tools/call', { name: 'get_learning_sessions', arguments: args });
      assert.equal(r.body.error.code, -32602);
    }
    const write = await f.send('tools/call', { name: 'delete_session', arguments: { id: 'completed-a' } });
    assert.equal(write.body.error.code, -32602);
    // Invalid filters may read the owner's classifications, never session history.
    assert.equal(f.historyQueries(), 0);
  } finally { f.close(); }
});

test('cross-origin requests are rejected before any data access', async () => {
  const f = fixture();
  try {
    const r = await f.send('tools/call', { name: 'get_learning_sessions' }, 1, 'https://other.test');
    assert.equal(r.status, 403);
    assert.equal(f.queries(), 0);
  } finally { f.close(); }
});

test('mentor goal reads match website progress, include all periods and edit history, and never write', async () => {
  const f = fixture('owner-a', true);
  try {
    const definitions = [
      { id: '20000000-0000-4000-8000-000000000001', name: 'Today', startDay: '2026-10-04', endDay: '2026-10-04', targetMs: 30 * 60000, scope: { kind: 'all' } },
      { id: '20000000-0000-4000-8000-000000000002', name: 'Past reached', startDay: '2026-10-03', endDay: '2026-10-03', targetMs: 60 * 60000, scope: { kind: 'all' } },
      { id: '20000000-0000-4000-8000-000000000003', name: 'Past missed', startDay: '2026-10-03', endDay: '2026-10-03', targetMs: 60 * 60000, scope: { kind: 'areas', areaIds: [initialAreas[0].id] } },
      { id: '20000000-0000-4000-8000-000000000004', name: 'Future', startDay: '2026-10-05', endDay: '2026-10-06', targetMs: 60 * 60000, scope: { kind: 'activity', activityId: activities[2].id } },
    ];
    for (const goal of definitions) await writeGoal(f.db, 'owner-a', { ...goal, action: 'create' }, now - 1000);
    await writeGoal(f.db, 'owner-a', { ...definitions[0], name: 'Today renamed', action: 'edit', revision: 0 }, now);
    await writeGoal(f.db, 'owner-b', { ...definitions[0], name: 'PRIVATE OTHER GOAL', action: 'create' }, now);
    f.sqlite.prepare("UPDATE sessions SET elapsed_ms=900123 WHERE id='completed-a'").run();
    const before = f.sqlite.prepare('SELECT total_changes() AS n').get()!.n;
    const website = await readGoals(f.db, 'owner-a', now);
    const data = (await f.send('tools/call', { name: 'get_learning_goals' })).body.result.structuredContent;
    assert.equal(data.access, 'read_only');
    assert.equal(data.data_owner, 'Shared learner');
    assert.equal(data.goals.length, 4);
    for (const goal of data.goals) assert.equal(goal.completed_ms, website.goals.find(g => g.id === goal.id)!.completedMs);
    const current = data.goals.find(g => g.id === definitions[0].id)!;
    assert.equal(current.period, 'current');
    assert.equal(current.status, 'target_reached');
    assert.equal(current.completed_ms, 2100123);
    assert.ok(current.progress_percent > 100);
    assert.equal(current.remaining_minutes, 0);
    assert.equal(current.over_target_minutes, 300123 / 60000);
    assert.deepEqual(current.edit_history, [{ at: new Date(now).toISOString(), changes: [{ field: 'Name', from: 'Today', to: 'Today renamed' }] }]);
    assert.equal(data.goals.find(g => g.name === 'Past missed')!.status, 'period_complete');
    assert.equal(data.goals.find(g => g.name === 'Future')!.status, 'upcoming');
    assert.match(data.goals.find(g => g.name === 'Future')!.scope_description, /Exercism/);
    const filtered = (await f.send('tools/call', { name: 'get_learning_goals', arguments: { period: 'past', target_reached: true } })).body.result.structuredContent;
    assert.deepEqual(filtered.goals.map(g => g.name), ['Past reached']);
    assert.equal((await f.send('tools/call', { name: 'get_learning_goals', arguments: { goal: current.id } })).body.result.structuredContent.goals[0].name, current.name);
    assert.equal(JSON.stringify(data).includes('PRIVATE OTHER'), false);
    assert.equal(f.sqlite.prepare('SELECT total_changes() AS n').get()!.n, before);
  } finally { f.close(); }
});

test('reports reconcile exact totals, classifications and retained inactive history; timers span midnight', async () => {
  const f = fixture('owner-a', true);
  try {
    await ensureAreas(f.db, 'owner-a');
    f.sqlite.prepare("UPDATE courses SET status='archived',type='Project' WHERE owner='owner-a' AND name='Ed Donner AI Engineering'").run();
    f.sqlite.prepare("UPDATE sessions SET day='2026-10-02',state='paused',resumed_at=NULL WHERE id='running-a'").run();
    const before = f.sqlite.prepare('SELECT total_changes() AS n').get()!.n;
    const data = (await f.send('tools/call', { name: 'get_learning_totals', arguments: { start_date: '2026-10-04', end_date: '2026-10-04' } })).body.result.structuredContent;
    assert.equal(data.access, 'read_only');
    assert.equal(data.total_completed_ms, 2100000);
    assert.equal(data.total_completed_minutes, 35);
    assert.equal(data.completed_session_count, 2);
    assert.equal(data.by_learning_area.reduce((n, a) => n + a.total_completed_ms, 0), data.total_completed_ms);
    assert.equal(data.by_activity_type.reduce((n, a) => n + a.total_completed_ms, 0), data.total_completed_ms);
    assert.equal(data.by_activity.reduce((n, a) => n + a.total_completed_ms, 0), data.total_completed_ms);
    assert.equal(data.by_learning_area.find(a => a.id === initialAreas[0].id)!.inactive_minutes, 20);
    assert.equal(data.by_activity_type.find(a => a.type === 'Project')!.total_completed_ms, 1200000);
    assert.deepEqual(data.in_progress_sessions.map(s => [s.id, s.state, s.duration_ms]), [['running-a', 'paused', 60000]]);
    const filtered = (await f.send('tools/call', { name: 'get_learning_totals', arguments: { start_date: '2026-10-04', end_date: '2026-10-04', learning_area: 'AI Engineering', activity_type: 'Project', activity: activities[1].id, status: 'archived' } })).body.result.structuredContent;
    assert.equal(filtered.total_completed_minutes, 20);
    assert.equal(filtered.in_progress_sessions.length, 0);
    assert.equal(filtered.by_activity.length, 1);
    const empty = (await f.send('tools/call', { name: 'get_learning_totals', arguments: { learning_area: 'Music' } })).body.result.structuredContent;
    assert.equal(empty.total_completed_ms, 0);
    assert.equal(empty.in_progress_sessions.length, 0);
    // An activity move must regroup old sessions without changing their timing.
    f.sqlite.prepare("UPDATE courses SET area_id=?,status='deleted' WHERE owner='owner-a' AND name='Ed Donner AI Engineering'").run(initialAreas[1].id);
    const moved = (await f.send('tools/call', { name: 'get_learning_totals', arguments: { start_date: '2026-10-04', end_date: '2026-10-04' } })).body.result.structuredContent;
    assert.equal(moved.total_completed_ms, data.total_completed_ms);
    assert.equal(moved.by_learning_area.find(a => a.id === initialAreas[1].id)!.total_completed_ms, 2100000);
    assert.equal(JSON.stringify(moved).includes('PRIVATE OTHER'), false);
    // Only the explicit fixture update above changed the database.
    assert.equal(Number(f.sqlite.prepare('SELECT total_changes() AS n').get()!.n), Number(before) + 1);
  } finally { f.close(); }
});

test('full history pages past 500 records without loss; inclusive range and filters retain old defaults', async () => {
  const f = fixture();
  try {
    const insert = f.sqlite.prepare("INSERT INTO sessions(id,owner,activity,state,started_at,stopped_at,day,elapsed_ms,version,what) VALUES (?,'owner-a','Exercism JavaScript','stopped',?,?,'2026-10-04',60001,0,'Paged note')");
    for (let i = 0; i < 501; i++) insert.run('paged-' + String(i).padStart(3, '0'), now - 60000, now);
    const expected = f.sqlite.prepare("SELECT id FROM sessions WHERE owner='owner-a' AND state='stopped' ORDER BY started_at,id").all().map(s => s.id);
    const first = (await f.send('tools/call', { name: 'get_learning_sessions', arguments: { all_dates: true } })).body.result.structuredContent;
    assert.equal(first.sessions.length, 500);
    assert.equal(first.next_offset, 500);
    const last = (await f.send('tools/call', { name: 'get_learning_sessions', arguments: { all_dates: true, offset: first.next_offset } })).body.result.structuredContent;
    assert.equal(last.next_offset, null);
    assert.deepEqual([...first.sessions, ...last.sessions].map(s => s.id), expected);
    const totals = (await f.send('tools/call', { name: 'get_learning_totals' })).body.result.structuredContent;
    assert.equal(totals.completed_session_count, expected.length);
    const range = (await f.send('tools/call', { name: 'get_learning_sessions', arguments: { start_date: '2026-10-03', end_date: '2026-10-03', activity: 'Exercism JavaScript' } })).body.result.structuredContent;
    assert.deepEqual(range.sessions.map(s => s.id), ['other-day']);
    assert.equal(range.next_offset, null);
    const today = (await f.send('tools/call', { name: 'get_learning_sessions' })).body.result.structuredContent;
    assert.equal(today.date, '2026-10-04');
    assert.ok(!today.sessions.some(s => s.id === 'other-day' || s.id === 'running-a'));
  } finally { f.close(); }
});

test('new tools reject owner overrides and malformed ranges/filters before database access', async () => {
  const f = fixture();
  try {
    for (const name of ['get_learning_sessions', 'get_learning_activities', 'get_learning_areas', 'get_learning_goals', 'get_learning_totals']) {
      assert.equal((await f.send('tools/call', { name, arguments: { owner: 'owner-b' } })).body.error.code, -32602);
    }
    for (const name of ['get_learning_sessions', 'get_learning_totals']) {
      for (const args of [{ start_date: '2026-10-03' }, { start_date: '2026-02-30', end_date: '2026-03-01' }, { start_date: '2026-10-04', end_date: '2026-10-03' }]) {
        assert.equal((await f.send('tools/call', { name, arguments: args })).body.error.code, -32602);
      }
    }
    for (const args of [{ offset: -1 }, { offset: 0.5 }, { offset: '500' }, { all_dates: 'true' }, { all_dates: true, date: '2026-10-03' }, { date: '2026-10-03', start_date: '2026-10-03', end_date: '2026-10-04' }]) {
      assert.equal((await f.send('tools/call', { name: 'get_learning_sessions', arguments: args })).body.error.code, -32602);
    }
    for (const args of [{ period: ['current'] }, { period: 'future' }, { target_reached: 'true' }, { goal: '' }]) {
      assert.equal((await f.send('tools/call', { name: 'get_learning_goals', arguments: args })).body.error.code, -32602);
    }
    assert.equal(f.queries(), 0);
  } finally { f.close(); }
});


const goalArgs = { id: '77777777-7777-4777-8777-777777777777', name: 'MCP goal', start_date: '2026-10-04', end_date: '2026-10-04', target_minutes: 60, scope: { kind: 'all' } };
test('MCP goal create/retry/edit/delete share UI progress/history and preserve sessions and foreign goals', async () => {
  const f = fixture();
  try {
    await writeGoal(f.db, 'owner-b', { action: 'create', id: goalArgs.id, name: 'Private goal', startDay: goalArgs.start_date, endDay: goalArgs.end_date, targetMs: 60000, scope: {kind:'all'} }, now);
    await ensureAreas(f.db, 'owner-a');
    const sessions = f.sqlite.prepare('SELECT * FROM sessions ORDER BY id').all();
    const call = (name: string, args: unknown) => f.send('tools/call', { name, arguments: args });
    assert.equal((await call('create_learning_goal', goalArgs)).body.result.structuredContent.saved, true);
    assert.equal((await call('create_learning_goal', goalArgs)).body.result.structuredContent.saved, true);
    let goals = (await readGoals(f.db, 'owner-a', now)).goals;
    assert.equal(goals.length, 1);
    assert.equal(goals[0].completedMs, 2100000);
    assert.equal(goals[0].targetMs, 3600000);
    assert.equal(goals[0].history.length, 0);
    assert.equal((await call('update_learning_goal', { ...goalArgs, name: 'Updated via MCP', target_minutes: 30, scope: { kind:'areas', areaIds: [initialAreas[0].id] }, revision: 0 })).body.result.structuredContent.saved, true);
    goals = (await readGoals(f.db, 'owner-a', now)).goals;
    assert.equal(goals[0].revision, 1);
    assert.equal(goals[0].history.length, 1);
    assert.equal(goals[0].history[0].changes.length, 3);
    assert.equal(goals[0].completedMs, 1200000);
    for (const name of ['update_learning_goal', 'delete_learning_goal']) {
      const r = await call(name, name === 'update_learning_goal' ? {...goalArgs, revision:0} : {id:goalArgs.id, revision:0});
      assert.equal(r.body.result.isError, true);
      assert.match(r.body.result.content[0].text, /changed/);
    }
    assert.equal((await call('delete_learning_goal', {id:goalArgs.id, revision:1})).body.result.structuredContent.saved, true);
    assert.equal((await readGoals(f.db, 'owner-a', now)).goals.length, 0);
    assert.equal((await readGoals(f.db, 'owner-b', now)).goals[0].name, 'Private goal');
    assert.deepEqual(f.sqlite.prepare('SELECT * FROM sessions ORDER BY id').all(), sessions);
  } finally { f.close(); }
});

test('anonymous and shared-viewer MCP goal writes are rejected before database access', async () => {
  for (const [owner, readOnly, status] of [[null, false, 401], ['owner-a', true, 403]] as const) {
    const f = fixture(owner, readOnly);
    try {
      for (const name of ['create_learning_goal','update_learning_goal','delete_learning_goal']) {
        assert.equal((await f.send('tools/call', {name})).status, status);
      }
      assert.equal(f.queries(), 0);
    } finally { f.close(); }
  }
});

test('MCP goal writes reject malformed definitions and owner/reference overrides', async () => {
  const f = fixture();
  try {
    const call = (args: unknown, name = 'create_learning_goal') => f.send('tools/call', {name, arguments:args});
    for (const patch of [{id:'bad'}, {name:''}, {start_date:'2026-02-30'}, {end_date:'2026-10-03'}, {target_minutes:0}, {target_minutes:0.5}, {target_minutes:'60'}, {scope:{kind:'areas',areaIds:[]}}, {scope:{kind:'areas',areaIds:['foreign-area']}}, {scope:{kind:'activity',activityId:'foreign-activity'}}, {scope:{kind:'all',owner:'owner-b'}}]) {
      const r = await call({...goalArgs,...patch});
      assert.ok(r.body.error || r.body.result.isError, JSON.stringify(patch));
    }
    for (const name of ['create_learning_goal','update_learning_goal','delete_learning_goal']) {
      assert.equal((await call({owner:'owner-b'},name)).body.error.code, -32602);
    }
    assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM learning_goals').get()!.n, 0);
  } finally { f.close(); }
});
