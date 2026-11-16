import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { activities,activityTypes,csv, type Activity, type Session } from '../lib/stopwatch';
import { addCourse,editCourse,listActivities } from '../lib/courses';
import { handleCourseWrite } from '../lib/courses-api';
import { handleSessionWrite,handleSessionRead } from '../lib/session-api';
import { handleTotalsRead } from '../lib/totals-api';
import { handleLearningMcp } from '../lib/learning-mcp';
type Totals={elapsedMs:number;sessionCount:number;courses:{name:string;type:string}[]};
type Snapshot={sessions:Session[];activities:Activity[]};
type Rpc={result:{structuredContent:{sessions:{id:string}[];total_completed_minutes:number}}};
const now=Date.parse('2026-10-10T18:00:00Z');
function fixture(legacy=false){
 const sqlite=new DatabaseSync(':memory:');
 const files=readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort();
 for(const f of legacy?files.slice(0,3):files)sqlite.exec(readFileSync('drizzle/'+f,'utf8'));
 const db={prepare(sql:string){const stmt={args:[] as (string|number|null)[],bind(...args:(string|number|null)[]){this.args=args;return this;},async all(){return {results:sqlite.prepare(sql).all(...this.args)};},async first(){return sqlite.prepare(sql).get(...this.args)??null;},async run(){return {meta:{changes:sqlite.prepare(sql).run(...this.args).changes}};}};return stmt;},async batch(statements:{run:()=>Promise<unknown>}[]){sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}} as unknown as D1Database;
 const write=async(input:Record<string,unknown>,owner:string|null='owner-a',method='POST',origin?:string)=>{
  const r=await handleCourseWrite(new Request('https://test.local/api/courses',{method,headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify(input)}),owner,()=>db);
  return {status:r.status,data:await r.json()};
 };
 return {sqlite,db,write,latest:files.at(-1)!,close:()=>sqlite.close()};
}
test('additive migration preserves complete legacy sessions and courses default to Course',async()=>{
 const f=fixture(true);
 try{
  f.sqlite.exec("INSERT INTO courses VALUES ('legacy','owner-a','Legacy course','legacy course','https://example.com',1)");
  f.sqlite.exec("INSERT INTO sessions (id,owner,activity,state,started_at,stopped_at,day,elapsed_ms,version,what) VALUES ('history','owner-a','Legacy course','stopped',1,60001,'2026-10-01',60000,2,'Original note')");
  const before=f.sqlite.prepare('SELECT * FROM sessions').all();
  for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort().slice(3))f.sqlite.exec(readFileSync('drizzle/'+file,'utf8'));
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM sessions').all(),before);
  assert.equal((await listActivities(f.db,'owner-a')).find(a=>a.name==='Legacy course')!.type,'Course');
  assert.ok((await listActivities(f.db,'owner-a')).every(a=>a.type==='Course'));
  const totals=await (await handleTotalsRead('owner-a',()=>f.db)).json() as Totals;
  assert.equal(totals.elapsedMs,60000);assert.equal(totals.sessionCount,1);
 }finally{f.close();}
});
test('all activity types create, edit and persist through the existing API; omitted type defaults to Course',async()=>{
 const f=fixture();try{
  for(const type of activityTypes){
   const id=randomUUID(),name=type==='Skill Practice'?'Typing Practice':'New '+type;
   assert.equal((await f.write({id,name,type})).status,200);
   assert.equal((await f.write({id,name:name+' edited',originalName:name,type,link:'https://example.com'},'owner-a','PATCH')).status,200);
   assert.equal((await listActivities(f.db,'owner-a')).find(a=>a.id===id)!.type,type);
  }
  await addCourse(f.db,'owner-a',randomUUID(),{name:'Legacy API client'},now);
  assert.equal((await listActivities(f.db,'owner-a')).find(a=>a.name==='Legacy API client')!.type,'Course');
  assert.equal((await f.write({id:randomUUID(),name:'Invalid',type:'Habit'})).status,400);
  assert.equal((await f.write({id:randomUUID(),name:'New Course edited'})).status,409);
 }finally{f.close();}
});
test('changing activity type preserves every historical session field; renaming preserves IDs, notes, timing and totals',async()=>{
 const f=fixture();try{
  const id=randomUUID();await addCourse(f.db,'owner-a',id,{name:'Old course'},now);
  const sessionId=randomUUID();
  await handleSessionWrite(new Request('https://test.local/api/sessions',{method:'POST',body:JSON.stringify({action:'manual',id:sessionId,activity:'Old course',start:'2026-10-10T20:00',end:'2026-10-10T20:30',what:'History'})}),'owner-a',()=>f.db,now);
  const before=f.sqlite.prepare('SELECT * FROM sessions').all();
  await editCourse(f.db,'owner-a',id,{originalName:'Old course',name:'Old course',type:'Project'},now);
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM sessions').all(),before);
  await editCourse(f.db,'owner-a',id,{originalName:'Old course',name:'Renamed project',type:'Project'},now);
  await editCourse(f.db,'owner-a',id,{originalName:'Old course',name:'Renamed project',type:'Project'},now); // lost-reply retry
  const after=f.sqlite.prepare('SELECT * FROM sessions').get()!;
  assert.equal(after.id,sessionId);assert.equal(after.what,'History');assert.equal(after.elapsed_ms,1800000);assert.equal(after.activity,'Renamed project');
  const totals=await (await handleTotalsRead('owner-a',()=>f.db)).json() as Totals;assert.equal(totals.elapsedMs,1800000);assert.equal(totals.courses.find((a:{name:string})=>a.name==='Renamed project')!.type,'Project');
  await assert.rejects(editCourse(f.db,'owner-a',id,{originalName:'Old course',name:'Stale name'}),/another tab/);
 }finally{f.close();}
});
test('editing default activities is isolated per owner without duplicate activities',async()=>{
 const f=fixture();try{
  const id=activities[2].id!;
  await editCourse(f.db,'owner-a',id,{originalName:'Exercism JavaScript',name:'Exercism JavaScript',type:'Skill Practice'},now);
  await editCourse(f.db,'owner-b',id,{originalName:'Exercism JavaScript',name:'Exercism JavaScript',type:'Project'},now);
  assert.equal((await listActivities(f.db,'owner-a')).length,3);assert.equal((await listActivities(f.db,'owner-b')).length,3);
  assert.equal((await listActivities(f.db,'owner-a'))[2].type,'Skill Practice');assert.equal((await listActivities(f.db,'owner-b'))[2].type,'Project');
 }finally{f.close();}
});
test('stopwatch lifecycle, persisted reads, totals, CSV and MCP retrieval work for all three activity types',async()=>{
 const f=fixture();try{
  for(const type of activityTypes){
   const name='Timer '+type;await addCourse(f.db,'owner-a',randomUUID(),{name,type},now);
   const id=randomUUID();
   const send=async(action:string,at:number,version?:number)=>{const r=await handleSessionWrite(new Request('https://test.local/api/sessions',{method:'POST',body:JSON.stringify({action,id,activity:name,version,at_ms:at,operation_id:randomUUID(),what:'Saved '+type})}),'owner-a',()=>f.db,now+12000);assert.equal(r.status,200);};
   await send('start',now);await send('pause',now+2000,0);await send('resume',now+10000,1);await send('stop',now+12000,2);
   const rpc=await handleLearningMcp(new Request('https://test.local/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'get_learning_sessions',arguments:{date:'2026-10-10',activity:name}}})}),{access:async()=>({ownerId:'owner-a',readOnly:false,ownerName:null}),database:()=>f.db});
   const data=(await rpc.json() as Rpc).result.structuredContent;assert.equal(data.sessions[0].id,id);assert.equal(data.total_completed_minutes,4000/60000);
  }
  const snapshot=await (await handleSessionRead('owner-a',()=>f.db)).json() as Snapshot;assert.equal(snapshot.sessions.length,3);
  assert.ok(snapshot.sessions.every((s:Session)=>s.state==='stopped'&&s.elapsed_ms===4000));
  const totals=await (await handleTotalsRead('owner-a',()=>f.db)).json() as Totals;assert.equal(totals.elapsedMs,12000);assert.equal(totals.sessionCount,3);
  for(const type of activityTypes)assert.ok(csv(snapshot.sessions,snapshot.activities).includes('"'+type+'"'));
 }finally{f.close();}
});
test('activity writes enforce authentication, ownership and origin checks',async()=>{
 const f=fixture();try{
  const id=randomUUID();assert.equal((await f.write({id,name:'Private'},null)).status,401);
  assert.equal((await f.write({id,name:'Private'},'owner-a','POST','https://other.test')).status,403);
  await f.write({id,name:'Private'});
  assert.equal((await f.write({id,originalName:'Private',name:'Intruder',type:'Project'},'owner-b','PATCH')).status,409);
  assert.equal((await listActivities(f.db,'owner-a')).at(-1)!.name,'Private');
 }finally{f.close();}
});

test('archive, restore and default deletion preserve sessions, totals, CSV and MCP across reloads',async()=>{
 const f=fixture();try{
  const id=activities[0].id!,name=activities[0].name;
  const sid=randomUUID();f.sqlite.prepare("INSERT INTO sessions (id,owner,activity,state,started_at,stopped_at,day,elapsed_ms,version,what) VALUES (?,? ,?,'stopped',1,60001,'2026-10-10',60000,0,'Preserve me')").run(sid,'owner-a',name);
  const before=f.sqlite.prepare('SELECT * FROM sessions').all();
  const change=(action:string,status:string,extra={})=>f.write({id,action,originalName:name,originalStatus:status,...extra},'owner-a','PATCH');
  assert.equal((await f.write({id,action:['archive'],originalName:name,originalStatus:'active'},'owner-a','PATCH')).status,409);
  assert.equal((await change('archive','active',{deleteHistory:true})).status,409);
  assert.equal((await change('archive','active')).status,200);
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM sessions').all(),before);
  assert.equal((await listActivities(f.db,'owner-a')).find(a=>a.id===id)!.status,'archived');
  assert.equal((await listActivities(f.db,'owner-b')).find(a=>a.id===id)!.status,undefined);
  for(const action of ['start','manual']){const r=await handleSessionWrite(new Request('https://test.local/api/sessions',{method:'POST',body:JSON.stringify({action,id:randomUUID(),activity:name,start:'2026-10-10T20:00',end:'2026-10-10T20:30',what:''})}),'owner-a',()=>f.db,now);assert.equal(r.status,400);}
  assert.equal((await change('restore','archived')).status,200);
  assert.equal((await change('delete','active')).status,200);
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM sessions').all(),before);
  const snapshot=await (await handleSessionRead('owner-a',()=>f.db)).json() as Snapshot;
  assert.equal(snapshot.activities.find(a=>a.id===id)!.status,'deleted');assert.ok(csv(snapshot.sessions,snapshot.activities).includes('Preserve me'));
  const totals=await (await handleTotalsRead('owner-a',()=>f.db)).json() as Totals;assert.equal(totals.elapsedMs,60000);
  const rpc=async(name:string,args:Record<string,unknown>)=>{const r=await handleLearningMcp(new Request('https://test.local/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}),{access:async()=>({ownerId:'owner-a',readOnly:false,ownerName:null}),database:()=>f.db});return r.json() as Promise<{result:{structuredContent:{activities:{status:string;total_completed_minutes:number}[];sessions:{id:string}[]}}}>;};
  assert.equal((await rpc('get_learning_sessions',{date:'2026-10-10',activity:name})).result.structuredContent.sessions[0].id,sid);
  const data=(await rpc('get_learning_activities',{status:'deleted'})).result.structuredContent;assert.equal(data.activities[0].status,'deleted');assert.equal(data.activities[0].total_completed_minutes,1);
 }finally{f.close();}
});
test('explicit history deletion affects only the selected owner/activity; stale and open-session removals fail safely',async()=>{
 const f=fixture();try{
  const id=randomUUID(),other=randomUUID();await addCourse(f.db,'owner-a',id,{name:'Remove history',type:'Project'});await addCourse(f.db,'owner-a',other,{name:'Keep history'});
  const insert=f.sqlite.prepare("INSERT INTO sessions (id,owner,activity,state,started_at,day,elapsed_ms,version,what) VALUES (?,?,?, ?,1,'2026-10-10',60000,0,'Note')");
  insert.run('own','owner-a','Remove history','paused');insert.run('other-owner','owner-b','Remove history','stopped');insert.run('other-activity','owner-a','Keep history','stopped');
  const payload={id,action:'delete',originalName:'Remove history',originalStatus:'active',deleteHistory:true};
  assert.equal((await f.write(payload,'owner-a','PATCH')).status,409);assert.equal(f.sqlite.prepare('SELECT count(*) AS n FROM sessions').get()!.n,3);
  f.sqlite.exec("UPDATE sessions SET state='stopped' WHERE id='own'");
  assert.equal((await f.write({...payload,deleteHistory:'true'},'owner-a','PATCH')).status,409);
  assert.equal((await f.write(payload,'owner-b','PATCH')).status,409);
  assert.equal((await f.write({...payload,originalName:'Stale'},'owner-a','PATCH')).status,409);
  assert.equal((await f.write(payload,'owner-a','PATCH')).status,200);
  assert.deepEqual(f.sqlite.prepare('SELECT id FROM sessions ORDER BY id').all().map(r=>r.id),['other-activity','other-owner']);
  assert.equal((await listActivities(f.db,'owner-a')).find(a=>a.id===id)!.status,'deleted');
  const totals=await (await handleTotalsRead('owner-a',()=>f.db)).json() as Totals;assert.ok(!totals.courses.some(c=>c.name==='Remove history'));assert.equal(totals.elapsedMs,60000);
 }finally{f.close();}
});
