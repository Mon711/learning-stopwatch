import { d1 } from './database';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import { addCourse,courseInput,listActivities } from '../lib/courses';
import { handleLearningMcp } from '../lib/learning-mcp';

const now = Date.parse('2026-10-03T20:30:00Z'); // 4 Oct, 02:00 IST.
type RpcReply = {
  error: { code: number };
  result: {
    protocolVersion: string;
    tools: { name: string; annotations: { readOnlyHint: boolean } }[];
    structuredContent: {
      date: string;
      sessions: { id: string; state: string; duration_minutes: number; what_i_did: string; optional_notes: string }[];
      total_completed_minutes: number;
      completed_session_count: number;
    };
  };
};
function fixture(owner: string | null = 'owner-a') {
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
    }), { access: async () => owner ? { ownerId: owner, readOnly: false, ownerName: null } : null, database: () => db, now: () => now });
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

test('discovery exposes only a read-only tool and no private records', async () => {
  const f = fixture(null);
  try {
    const init = await f.send('initialize', { protocolVersion: '2025-03-26' });
    assert.equal(init.body.result.protocolVersion, '2025-03-26');
    const list = await f.send('tools/list');
    assert.deepEqual(list.body.result.tools.map((t: { name: string }) => t.name), ['get_learning_sessions','get_learning_activities','get_learning_areas']);
    assert.equal(list.body.result.tools[0].annotations.readOnlyHint, true);
    assert.equal(f.queries(), 0);
  } finally { f.close(); }
});

test('anonymous tool calls never read the database', async () => {
  const f = fixture(null);
  try {
    for(const name of ['get_learning_sessions','get_learning_activities','get_learning_areas']){const r=await f.send('tools/call',{name});assert.equal(r.status,401);}
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
