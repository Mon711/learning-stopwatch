import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync,mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { d1 } from './database';
import { initialAreas,listAreas,writeArea,ensureAreas,unassignedArea } from '../lib/learning-areas';
import { addCourse,editCourse,assignArea,listActivities } from '../lib/courses';
import { filterSessions,emptyFilters } from '../lib/learning-filters';
import { learningTotals } from '../lib/learning-totals';
import { handleSessionRead,handleSessionWrite } from '../lib/session-api';
import { handleLearningMcp } from '../lib/learning-mcp';
import { handleAreaWrite } from '../lib/areas-api';
import { withLogWriteAccess } from '../lib/log-access';
import { csv,type Activity,type Session } from '../lib/stopwatch';

const owner='learner',day='2026-11-17',now=Date.parse('2026-11-17T15:00Z');
function fixture(){const sqlite=new DatabaseSync(':memory:');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync('drizzle/'+f,'utf8'));return {sqlite,db:d1(sqlite)};}
async function seed(){const f=fixture();await ensureAreas(f.db,owner);f.sqlite.prepare("UPDATE courses SET type='Skill Practice' WHERE owner=? AND name='Exercism JavaScript'").run(owner);for(const [name,type,areaId,status,minutes] of [
 ['AI Engineering Projects','Project',initialAreas[0].id,'archived',90],['Scrimba Project','Project',initialAreas[1].id,'deleted',60],['Riyaz','Skill Practice',initialAreas[2].id,'active',20],['Speed Typing','Skill Practice',initialAreas[3].id,'active',10],
] as const){const id=randomUUID();await addCourse(f.db,owner,id,{name,type,areaId});f.sqlite.prepare('UPDATE courses SET status=? WHERE id=?').run(status,id);}
 const values=[['Ed Donner AI Engineering',120],['AI Engineering Projects',90],['Scrimba Full Stack',60],['Scrimba Project',60],['Exercism JavaScript',75],['Riyaz',20],['Speed Typing',10]] as const;
 const activities=await listActivities(f.db,owner);for(const [name,minutes] of values){const a=activities.find(a=>a.name===name)!;f.sqlite.prepare("INSERT INTO sessions(id,owner,activity,activity_id,state,started_at,stopped_at,day,elapsed_ms,what) VALUES (?,?,?,?,'stopped',1,2,?,?,?)").run(randomUUID(),owner,name,a.recordId!,day,minutes*60000,`Note for ${name}`);}
 return f;
}
async function snapshot(db:D1Database){return (await (await handleSessionRead(owner,()=>db)).json()) as {sessions:Session[];activities:Activity[]};}

test('hosted migration is schema-only; first authorized write backfills only its owner and retries preserve all rows',async()=>{
 const f=fixture();try{
 assert.doesNotMatch(readFileSync('drizzle/0005_learning_areas.sql','utf8'),/\b(INSERT|UPDATE|DELETE)\b/i);
 for(const who of [owner,'another-owner'])f.sqlite.prepare("INSERT INTO sessions(id,owner,activity,state,started_at,stopped_at,day,elapsed_ms,version,what) VALUES (?,?,?,'stopped',1,2,?,12345,7,'Preserve note')").run(randomUUID(),who,'Scrimba Full Stack',day);
 const before=f.sqlite.prepare('SELECT * FROM sessions ORDER BY id').all();
 await ensureAreas(f.db,owner);
 assert.ok(f.sqlite.prepare('SELECT activity_id FROM sessions WHERE owner=?').get(owner)!.activity_id);
 assert.equal(f.sqlite.prepare('SELECT activity_id FROM sessions WHERE owner=?').get('another-owner')!.activity_id,null);
 assert.equal(f.sqlite.prepare('SELECT count(*) n FROM learning_areas WHERE owner=?').get('another-owner')!.n,0);
 const after=f.sqlite.prepare('SELECT * FROM sessions ORDER BY id').all();
 assert.deepEqual(after.map((row,i)=>({...row,activity_id:before[i].activity_id})),before.map(row=>({...row})));
 const allAreas=f.sqlite.prepare('SELECT * FROM learning_areas ORDER BY id').all();
 await ensureAreas(f.db,owner);
 assert.deepEqual(f.sqlite.prepare('SELECT * FROM sessions ORDER BY id').all(),after);
 assert.deepEqual(f.sqlite.prepare('SELECT * FROM learning_areas ORDER BY id').all(),allAreas);
 }finally{f.sqlite.close();}
});

test('local migration backs up first, preserves complete records and safely reruns with renamed built-ins and retained history',()=>{
 const dir=mkdtempSync(join(tmpdir(),'learning-areas-migration-')),file=join(dir,'legacy.sqlite');
 try{const db=new DatabaseSync(file);for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort().slice(0,5))db.exec(readFileSync('drizzle/'+f,'utf8'));
 db.exec("INSERT INTO courses(id,owner,name,name_key,link,created_at,type,status) VALUES ('00000000-0000-4000-8000-000000000003:learner','learner','Renamed JS Track','renamed js track','https://example.test',4,'Skill Practice','archived'),('project','learner','AI Engineering Projects','ai engineering projects','',5,'Project','deleted'),('other','someone-else','Renamed JS Track','renamed js track','',1,'Course','active');");
 for(const [name,ownerId] of [['Renamed JS Track','learner'],['AI Engineering Projects','learner'],['Scrimba Full Stack','learner'],['Missing old activity','learner'],['Renamed JS Track','someone-else']])db.prepare("INSERT INTO sessions(id,owner,activity,state,started_at,stopped_at,day,elapsed_ms,version,what) VALUES (?,?,?,'stopped',123,456,?,12345,7,'Original note')").run(randomUUID(),ownerId,name,day);
 const before=db.prepare('SELECT * FROM sessions ORDER BY id').all();db.close();
 const run=()=>{const r=spawnSync(process.execPath,['scripts/migrate-learning-areas.mjs',file,join(dir,'backups')],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout) as {status:string;backupPath:string;before:unknown;after:unknown};};
 const first=run();assert.equal(first.status,'migrated');assert.deepEqual(first.before,first.after);
 const backup=new DatabaseSync(first.backupPath,{readOnly:true});assert.deepEqual(backup.prepare('SELECT * FROM sessions ORDER BY id').all(),before);backup.close();
 const result=new DatabaseSync(file);const after=result.prepare('SELECT * FROM sessions ORDER BY id').all();assert.deepEqual(after.map((r,i)=>Object.fromEntries(Object.keys(before[i]).map(k=>[k,r[k]]))),before.map(r=>({...r})));
 assert.equal(result.prepare("SELECT count(*) n FROM courses WHERE owner='learner' AND substr(id,1,36)='00000000-0000-4000-8000-000000000003'").get()!.n,1);
 assert.equal(result.prepare("SELECT area_id FROM courses WHERE id='00000000-0000-4000-8000-000000000003:learner'").get()!.area_id,initialAreas[1].id);
 assert.equal(result.prepare("SELECT status FROM courses WHERE id='project'").get()!.status,'deleted');
 assert.equal(result.prepare("SELECT area_id FROM courses WHERE name='Missing old activity'").get()!.area_id,unassignedArea.id);
 const state=result.prepare('SELECT * FROM courses ORDER BY id').all();result.close();assert.equal(run().status,'already_applied');const repeated=new DatabaseSync(file);assert.deepEqual(repeated.prepare('SELECT * FROM courses ORDER BY id').all(),state);repeated.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('areas validate names, preserve stable IDs on rename and isolate owners',async()=>{const f=await seed();try{
 const id=randomUUID();await writeArea(f.db,owner,{id,action:'create',name:'  Human   Skills '});assert.equal((await listAreas(f.db,owner)).find(a=>a.id===id)!.name,'Human Skills');
 for(const name of ['', '   ','Human Skills','human   skills','Unassigned','x'.repeat(81)])await assert.rejects(writeArea(f.db,owner,{id:randomUUID(),action:'create',name}));
 await assert.rejects(writeArea(f.db,owner,{id:randomUUID(),action:['create'],name:'Invalid action'}));
 await writeArea(f.db,owner,{id,action:'rename',revision:0,name:'Communication'});assert.equal((await listAreas(f.db,owner)).find(a=>a.id===id)!.name,'Communication');
 await assert.rejects(writeArea(f.db,owner,{id,action:'rename',revision:0,name:'Stale'}),/another tab/);
 await assert.rejects(writeArea(f.db,'other-owner',{id,action:'rename',revision:1,name:'Foreign'}));
 assert.equal((await listAreas(f.db,'other-owner')).some(a=>a.id===id),false);
 await writeArea(f.db,owner,{id,action:'delete',revision:1});
 await assert.rejects(writeArea(f.db,owner,{id:unassignedArea.id,action:'delete',revision:0}));
 }finally{f.sqlite.close();}});

test('legacy null references remain visible as Unassigned without mutating a read',async()=>{const f=await seed();try{
 const id=randomUUID();f.sqlite.prepare("INSERT INTO courses(id,owner,name,name_key,created_at) VALUES (?,?,?,'legacy null',1)").run(id,owner,'Legacy null');
 f.sqlite.prepare("INSERT INTO sessions(id,owner,activity,state,started_at,day,elapsed_ms,what) VALUES (?,?,?,'stopped',1,?,60001,'Keep this exact note')").run(randomUUID(),owner,'Legacy null',day);
 const before=f.sqlite.prepare('SELECT * FROM sessions ORDER BY id').all(),data=await snapshot(f.db);
 const matches=filterSessions(data.sessions,data.activities,{...emptyFilters,areaId:unassignedArea.id});
 assert.equal(matches.length,1);assert.equal(matches[0].elapsed_ms,60001);
 assert.equal(learningTotals(data.sessions,data.activities).elapsedMs,435*60000+60001);
 assert.deepEqual(f.sqlite.prepare('SELECT * FROM sessions ORDER BY id').all(),before);
 }finally{f.sqlite.close();}});

test('deleting an area moves retained deleted activities too and rejects a system destination',async()=>{const f=await seed();try{
 const before=f.sqlite.prepare('SELECT * FROM sessions ORDER BY id').all();
 await assert.rejects(writeArea(f.db,owner,{id:initialAreas[1].id,action:'delete',revision:0,destinationId:unassignedArea.id}));
 await writeArea(f.db,owner,{id:initialAreas[1].id,action:'delete',revision:0,destinationId:initialAreas[2].id});
 const deleted=(await listActivities(f.db,owner)).find(a=>a.name==='Scrimba Project')!;
 assert.equal(deleted.status,'deleted');assert.equal(deleted.areaId,initialAreas[2].id);
 assert.deepEqual(f.sqlite.prepare('SELECT * FROM sessions ORDER BY id').all(),before);
 }finally{f.sqlite.close();}});

test('all five reporting cases, AND combinations, inactive history, empty results and full-history CSV',async()=>{const f=await seed();try{
 const data=await snapshot(f.db),js=data.activities.find(a=>a.name==='Exercism JavaScript')!;
 const report=(filters={})=>learningTotals(filterSessions(data.sessions,data.activities,{...emptyFilters,...filters}),data.activities.filter(a=>(!('areaId' in filters)||a.areaId===(filters as {areaId:string}).areaId)));
 assert.equal(report().elapsedMs,435*60000);assert.equal(report({areaId:initialAreas[0].id}).elapsedMs,210*60000);assert.equal(report({areaId:initialAreas[0].id,type:'Course'}).elapsedMs,120*60000);assert.equal(report({type:'Course'}).elapsedMs,180*60000);assert.equal(report({activityId:js.id}).elapsedMs,75*60000);
 assert.equal(filterSessions(data.sessions,data.activities,{...emptyFilters,areaId:initialAreas[1].id,type:'Skill Practice',activityId:js.id!}).length,1);
 assert.equal(filterSessions(data.sessions,data.activities,{...emptyFilters,areaId:initialAreas[2].id,type:'Course'}).length,0);
 const output=csv(data.sessions,data.activities);assert.equal(output.split('\r\n').length,8);assert.ok(output.includes('AI Engineering Projects'));assert.ok(output.includes('Scrimba Project'));assert.ok(output.includes('Note for Riyaz'));assert.equal(output.split('\r\n')[0],'\ufeff"Date","Learning Activity","Duration (minutes)","Activity Type","What I Did","Optional Notes"');
 }finally{f.sqlite.close();}});

test('moving and deleting an occupied area preserve exact session rows, notes, statuses and totals',async()=>{const f=await seed();try{
 const before=f.sqlite.prepare('SELECT * FROM sessions ORDER BY id').all(),a=(await listActivities(f.db,owner)).find(a=>a.name==='Ed Donner AI Engineering')!;
 await assignArea(f.db,owner,a.id!,{areaId:initialAreas[2].id,revision:a.revision});
 assert.deepEqual(f.sqlite.prepare('SELECT * FROM sessions ORDER BY id').all(),before);
 await assert.rejects(writeArea(f.db,owner,{id:initialAreas[0].id,action:'delete',revision:0}),/Choose another/);
 await writeArea(f.db,owner,{id:initialAreas[0].id,action:'delete',revision:0,destinationId:initialAreas[1].id});
 const moved=(await listActivities(f.db,owner)).find(a=>a.name==='AI Engineering Projects')!;assert.equal(moved.areaId,initialAreas[1].id);assert.equal(moved.status,'archived');
 assert.deepEqual(f.sqlite.prepare('SELECT * FROM sessions ORDER BY id').all(),before);assert.equal((await snapshot(f.db)).sessions.length,7);
 assert.equal(learningTotals((await snapshot(f.db)).sessions,await listActivities(f.db,owner)).elapsedMs,435*60000);
 await ensureAreas(f.db,owner);assert.equal((await listAreas(f.db,owner)).some(a=>a.id===initialAreas[0].id),false,'Deleted defaults must not be recreated');
 }finally{f.sqlite.close();}});

test('open timers block moves and area deletion; concurrent edits cannot partially reassign',async()=>{const f=await seed();try{
 const a=(await listActivities(f.db,owner)).find(a=>a.name==='Ed Donner AI Engineering')!;
 const r=await handleSessionWrite(new Request('https://test.local/api/sessions',{method:'POST',body:JSON.stringify({id:randomUUID(),action:'start',activity:a.name})}),owner,()=>f.db,now);assert.equal(r.status,200);
 await assert.rejects(assignArea(f.db,owner,a.id!,{areaId:initialAreas[1].id,revision:a.revision}),/Stop and save/);
 await assert.rejects(writeArea(f.db,owner,{id:initialAreas[0].id,revision:0,action:'delete',destinationId:initialAreas[1].id}),/Stop and save/);
 assert.equal((await listActivities(f.db,owner)).find(x=>x.id===a.id)!.areaId,initialAreas[0].id);
 f.sqlite.exec("DELETE FROM sessions WHERE state='running'");
 const original=f.db.batch.bind(f.db);let intercepted=false;f.db.batch=async statements=>{if(!intercepted){intercepted=true;f.sqlite.prepare('UPDATE learning_areas SET revision=revision+1 WHERE owner=? AND id=?').run(owner,initialAreas[0].id);}return original(statements);};
 await assert.rejects(writeArea(f.db,owner,{id:initialAreas[0].id,revision:0,action:'delete',destinationId:initialAreas[1].id}));
 assert.equal((await listActivities(f.db,owner)).find(x=>x.id===a.id)!.areaId,initialAreas[0].id);
 }finally{f.sqlite.close();}});

test('MCP filters by activity, area name or stable area ID and keeps mentor reads read-only',async()=>{const f=await seed();try{
 const rpc=async(name:string,args:Record<string,unknown>={})=>{const r=await handleLearningMcp(new Request('https://test.local/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}),{access:async()=>({ownerId:owner,readOnly:true,ownerName:'Test Learner'}),database:()=>f.db,now:()=>now});return await r.json() as {result:{structuredContent:{access:string;completed_session_count:number;total_completed_minutes:number;activities:unknown[];areas:{name:string;total_completed_minutes:number}[]}};error?:unknown};};
 const before=f.sqlite.prepare('SELECT * FROM sessions ORDER BY id').all();
 for(const area of ['AI Engineering',initialAreas[0].id]){const r=await rpc('get_learning_sessions',{date:day,learning_area:area});assert.equal(r.result.structuredContent.total_completed_minutes,210);assert.equal(r.result.structuredContent.access,'read_only');}
 const combined=await rpc('get_learning_sessions',{date:day,learning_area:'AI Engineering',activity:'Ed Donner AI Engineering',activity_type:'Course'});assert.equal(combined.result.structuredContent.total_completed_minutes,120);
 const inactive=await rpc('get_learning_activities',{learning_area:'Software Engineering',status:'deleted'});assert.equal(inactive.result.structuredContent.activities.length,1);
 assert.equal((await rpc('get_learning_areas')).result.structuredContent.areas.find(a=>a.name==='AI Engineering')!.total_completed_minutes,210);
 assert.ok((await rpc('get_learning_sessions',{learning_area:'Other account area'})).error);
 const blocked=await withLogWriteAccess({ownerId:owner,readOnly:true,ownerName:'Test Learner'},id=>handleAreaWrite(new Request('https://test.local/api/areas',{method:'POST',body:JSON.stringify({action:'create',id:randomUUID(),name:'Forbidden'})}),id,()=>f.db));assert.equal(blocked.status,403);
 assert.deepEqual(f.sqlite.prepare('SELECT * FROM sessions ORDER BY id').all(),before);
 }finally{f.sqlite.close();}});
