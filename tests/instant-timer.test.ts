import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { InstantTimer,TimerSaveError,type TimerCommand,type TimerSnapshot } from '../lib/instant-timer';
import { handleSessionRead,handleSessionWrite } from '../lib/session-api';
import { addCourse } from '../lib/courses';
import { handleTotalsRead } from '../lib/totals-api';
import { csv,dailyTotals,elapsed,type Session } from '../lib/stopwatch';

const base=Date.parse('2026-10-05T17:00:00Z');
const turn=()=>new Promise<void>(resolve=>setImmediate(resolve));
function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync('drizzle/'+file,'utf8'));
 const db={prepare(sql:string){return {bind(...args:(string|number|null)[]){return {
  async all(){return {results:sqlite.prepare(sql).all(...args)};},
  async first(){return sqlite.prepare(sql).get(...args)??null;},
  async run(){return {meta:{changes:sqlite.prepare(sql).run(...args).changes}};},
 };}};}} as unknown as D1Database;
 const write=async(input:Record<string,unknown>,now=base+30000,owner:string|null='owner-a',origin?:string)=>{
  const response=await handleSessionWrite(new Request('https://stopwatch.test/api/sessions',{method:'POST',headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify(input)}),owner,()=>db,now);
  return {status:response.status,data:await response.json() as TimerSnapshot&{error?:string}};
 };
 const send=async(command:TimerCommand)=>{const result=await write(command);if(result.status!==200)throw new TimerSaveError(result.data.error!,result.data.sessions?result.data:undefined,result.status>=500);return result.data;};
 return {sqlite,db,write,send,close:()=>sqlite.close()};
}

test('all timer clicks update immediately while five-second saves remain pending, with accurate click-time duration',async()=>{
 const f=fixture();
 try{
  await addCourse(f.db,'owner-a',randomUUID(),{name:'Rust fundamentals'},base);
  const releases:(()=>void)[]=[];
  const updates:Session[][]=[];
  const q=new InstantTimer(command=>new Promise<TimerSnapshot>((resolve,reject)=>releases.push(()=>void f.send(command).then(resolve,reject))),(sessions)=>updates.push(sessions));
  const enqueue=(action:'start'|'pause'|'resume'|'stop',at:number,note='')=>q.enqueue(action,'Rust fundamentals',note,base+at,randomUUID(),randomUUID());
  const started=enqueue('start',0);
  assert.equal(q.sessions[0].state,'running');
  const paused=enqueue('pause',1000);
  assert.equal(q.sessions[0].state,'paused');
  assert.equal(elapsed(q.sessions[0],base+9000),1000);
  const resumed=enqueue('resume',10000);
  assert.equal(q.sessions[0].state,'running');
  const stopped=enqueue('stop',12000,'Chapter 1');
  assert.equal(q.sessions[0].state,'stopped');
  assert.equal(q.sessions[0].elapsed_ms,3000);
  const next=enqueue('start',13000);
  const nextId=q.sessions[0].id;
  assert.equal(q.count,5);
  assert.equal(releases.length,1,'requests are serialized, controls are not blocked');
  q.sync([]);
  assert.equal(q.sessions[0].id,nextId,'stale reads cannot overwrite pending clicks');
  const promises=[started,paused,resumed,stopped,next];
  for(let i=0;i<promises.length;i++){
   releases[i]();await promises[i];
   assert.equal(q.sessions[0].id,nextId,'older save replies do not revert the visible timer');
   assert.equal(q.sessions[0].state,'running');
  }
  assert.equal(q.count,0);
  const saved=q.sessions.find(s=>s.state==='stopped')!;
  assert.equal(saved.elapsed_ms,3000);
  assert.equal(saved.started_at,base);
  assert.equal(saved.stopped_at,base+12000);
  assert.equal(saved.what,'Chapter 1');
  assert.equal(dailyTotals(q.sessions)[0][1].total,3000);
  assert.ok(updates.length>=10);
 }finally{f.close();}
});

test('a lost save reply keeps pending clicks and retry does not duplicate a pause or its duration',async()=>{
 const f=fixture();
 try{
  let loseReply=true;
  const q=new InstantTimer(async command=>{
   const result=await f.send(command);
   if(command.action==='pause'&&loseReply){loseReply=false;throw new Error('Connection lost after commit');}
   return result;
  },()=>{});
  await q.enqueue('start','Scrimba Full Stack','',base,randomUUID(),randomUUID());
  const paused=q.enqueue('pause','Scrimba Full Stack','',base+5000,randomUUID(),randomUUID());
  const stopped=q.enqueue('stop','Scrimba Full Stack','Finished',base+10000,randomUUID(),randomUUID());
  await turn();
  assert.equal(q.blocked,true);
  assert.equal(q.count,2);
  assert.equal(q.sessions[0].state,'stopped');
  assert.equal(q.sessions[0].elapsed_ms,5000);
  assert.throws(()=>q.enqueue('start','Scrimba Full Stack','',base+11000,randomUUID(),randomUUID()),/Retry/);
  q.retry();await Promise.all([paused,stopped]);
  assert.equal(q.count,0);
  assert.equal(q.sessions.length,1);
  assert.equal(q.sessions[0].version,2);
  assert.equal(q.sessions[0].elapsed_ms,5000);
  assert.equal(q.sessions[0].what,'Finished');
 }finally{f.close();}
});

test('another tab changing the timer rejects stale queued writes and restores the saved state',async()=>{
 const f=fixture();
 try{
  const q=new InstantTimer(f.send,()=>{});
  await q.enqueue('start','Scrimba Full Stack','',base,randomUUID(),randomUUID());
  const id=q.sessions[0].id;
  await f.write({action:'pause',id,version:0,operation_id:randomUUID(),at_ms:base+2000});
  const paused=q.enqueue('pause','Scrimba Full Stack','',base+3000,randomUUID(),randomUUID());
  const stopped=q.enqueue('stop','Scrimba Full Stack','',base+4000,randomUUID(),randomUUID());
  const results=await Promise.allSettled([paused,stopped]);
  assert.ok(results.every(r=>r.status==='rejected'));
  assert.equal(q.count,0);
  assert.equal(q.sessions[0].state,'paused');
  assert.equal(q.sessions[0].elapsed_ms,2000);
 }finally{f.close();}
});

test('manual sessions, corrections, custom courses, CSV, totals and deletion still work',async()=>{
 const f=fixture();
 try{
  await addCourse(f.db,'owner-a',randomUUID(),{name:'TypeScript course',link:'https://example.com/course'},base);
  const id=randomUUID();
  const added=await f.write({action:'manual',id,activity:'TypeScript course',start:'2026-10-05T21:00',end:'2026-10-05T21:30',what:'Types'});
  assert.equal(added.status,200);
  assert.equal(added.data.sessions[0].elapsed_ms,1800000);
  await f.write({action:'manual',id,activity:'TypeScript course',start:'2026-10-05T21:00',end:'2026-10-05T21:30',what:'Types'});
  const edited=await f.write({action:'edit_activity',id,version:0,activity:'Exercism JavaScript',minutes:25,what:'=A1'});
  assert.equal(edited.status,200);
  assert.equal(edited.data.sessions.length,1);
  assert.equal(edited.data.sessions[0].activity,'Exercism JavaScript');
  assert.equal(dailyTotals(edited.data.sessions)[0][1].total,1500000);
  const exportText=csv(edited.data.sessions);
  assert.ok(exportText.includes('Exercism JavaScript'));
  assert.ok(exportText.includes('25.0000'));
  assert.ok(exportText.includes("'=A1"));
  assert.ok(exportText.includes('Stopwatch session '+id));
  const read=await handleSessionRead('owner-a',()=>f.db);
  const loaded=await read.json() as {activities:{name:string}[];sessions:Session[]};
  assert.ok(loaded.activities.some(a=>a.name==='TypeScript course'));
  assert.equal(loaded.sessions.length,1);
  const removed=await f.write({action:'delete',id,version:1});
  assert.equal(removed.status,200);
  assert.equal(removed.data.sessions.length,0);
  const q=new InstantTimer(f.send,()=>{});
  await q.enqueue('start','Scrimba Full Stack','',base,randomUUID(),randomUUID());
  const discarded=await f.write({action:'delete',id:q.sessions[0].id,version:0});
  assert.equal(discarded.status,200);
  assert.equal(discarded.data.sessions.length,0);
 }finally{f.close();}
});

test('authentication, ownership, origins, unknown courses and invalid click times remain protected',async()=>{
 const f=fixture();
 try{
  const id=randomUUID();
  assert.equal((await f.write({action:'start',id,activity:'Scrimba Full Stack'},base,null)).status,401);
  assert.equal((await f.write({action:'start',id,activity:'Scrimba Full Stack'},base,'owner-a','https://other.test')).status,403);
  assert.equal((await f.write({action:'start',id,activity:'Unknown'},base)).status,400);
  assert.equal((await f.write({action:'start',id,activity:'Scrimba Full Stack',at_ms:base+31000},base)).status,400);
  const q=new InstantTimer(f.send,()=>{});
  await q.enqueue('start','Scrimba Full Stack','',base,id,randomUUID());
  const blocked=await f.write({action:'stop',id,version:0,what:'foreign'},base+1000,'owner-b');
  assert.equal(blocked.status,409);
  assert.equal(blocked.data.sessions.length,0);
  assert.equal((await handleSessionRead('owner-b',()=>f.db)).status,200);
  assert.equal(q.sessions[0].state,'running');
 }finally{f.close();}
});

test('existing open sessions without operation IDs still support pause, resume and stop',async()=>{
 const f=fixture();
 try{
  const id=randomUUID();
  assert.equal((await f.write({action:'start',id,activity:'Ed Donner AI Engineering'},base)).status,200);
  const paused=await f.write({action:'pause',id,version:0},base+1000);
  assert.equal(paused.data.sessions[0].elapsed_ms,1000);
  const resumed=await f.write({action:'resume',id,version:1},base+10000);
  assert.equal(resumed.data.sessions[0].state,'running');
  const stopped=await f.write({action:'stop',id,version:2,what:'Legacy session'},base+12000);
  assert.equal(stopped.status,200);
  assert.equal(stopped.data.sessions[0].elapsed_ms,3000);
  assert.equal(stopped.data.sessions[0].what,'Legacy session');
 }finally{f.close();}
});


test('database totals include all dates, manual and custom sessions and reflect corrections and deletion',async()=>{
 const f=fixture();
 try {
  await addCourse(f.db,'owner-a',randomUUID(),{name:'Rust fundamentals'},base);
  const id=randomUUID(),otherId=randomUUID();
  await f.write({action:'manual',id,activity:'Rust fundamentals',start:'2026-10-04T21:00',end:'2026-10-04T21:30',what:''});
  await f.write({action:'manual',id:otherId,activity:'Scrimba Full Stack',start:'2026-10-05T21:00',end:'2026-10-05T22:00',what:''});
  const read=async(owner:string|null='owner-a')=>{
   const response=await handleTotalsRead(owner,()=>f.db);
   return {status:response.status,data:await response.json() as {elapsedMs:number;sessionCount:number;courses:{name:string;elapsedMs:number;sessionCount:number}[]}};
  };
  let result=await read();
  assert.equal(result.data.elapsedMs,90*60000);
  assert.equal(result.data.sessionCount,2);
  assert.equal(result.data.courses.find(c=>c.name==='Rust fundamentals')?.elapsedMs,30*60000);
  assert.equal(result.data.courses.find(c=>c.name==='Exercism JavaScript')?.sessionCount,0);
  await f.write({action:'edit_activity',id,version:0,activity:'Exercism JavaScript',minutes:45,what:''});
  result=await read();
  assert.equal(result.data.elapsedMs,105*60000);
  assert.equal(result.data.courses.find(c=>c.name==='Rust fundamentals')?.elapsedMs,0);
  assert.equal(result.data.courses.find(c=>c.name==='Exercism JavaScript')?.elapsedMs,45*60000);
  await f.write({action:'edit',id,version:1,minutes:15,what:''});
  assert.equal((await read()).data.elapsedMs,75*60000);
  await f.write({action:'start',id:randomUUID(),activity:'Rust fundamentals'},base);
  assert.equal((await read()).data.sessionCount,2,'open sessions are excluded');
  await f.write({action:'delete',id,version:2});
  result=await read();
  assert.equal(result.data.elapsedMs,60*60000);
  assert.equal(result.data.sessionCount,1);
  assert.equal((await read('owner-b')).data.elapsedMs,0);
  assert.equal((await read(null)).status,401);
 } finally {f.close();}
});
