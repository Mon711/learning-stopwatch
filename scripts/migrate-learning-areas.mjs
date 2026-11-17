// Local-only runner: back up first, apply once, verify preserved fields, allow safe retries.
import { DatabaseSync,backup } from 'node:sqlite';
import { existsSync,mkdirSync,chmodSync,readFileSync,writeFileSync } from 'node:fs';
import { resolve,dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { areaBackfillSql } from '../lib/learning-area-backfill.ts';
import assert from 'node:assert/strict';

const filename=process.argv[2];
if(!filename||filename.startsWith('file:')||!existsSync(filename))throw new Error('Pass the path to an existing LOCAL SQLite database. This script cannot contact D1 remotely.');
const dbPath=resolve(filename),backupDir=resolve(process.argv[3]??join(dirname(dbPath),'learning-area-backups'));
mkdirSync(backupDir,{recursive:true,mode:0o700});chmodSync(backupDir,0o700);
const db=new DatabaseSync(dbPath);
const backupPath=join(backupDir,`before-learning-areas-${Date.now()}.sqlite`);
await backup(db,backupPath);chmodSync(backupPath,0o600);
const checksum=createHash('sha256').update(readFileSync(backupPath)).digest('hex');
writeFileSync(backupPath+'.sha256',checksum+'\n',{mode:0o600});
const beforeSessions=db.prepare('SELECT * FROM sessions ORDER BY id').all().map(r=>({...r}));
const beforeCourses=db.prepare('SELECT * FROM courses ORDER BY id').all().map(r=>({...r}));
const stats=()=>db.prepare("SELECT count(*) AS sessionCount,coalesce(sum(elapsed_ms),0) AS allElapsedMs,coalesce(sum(CASE WHEN state='stopped' THEN elapsed_ms ELSE 0 END),0) AS completedElapsedMs FROM sessions").get();
const before=stats();
try{
 db.exec('BEGIN IMMEDIATE');
 const has=(table,column)=>db.prepare(`PRAGMA table_info(${table})`).all().some(c=>c.name===column);
 const migrated=has('sessions','activity_id')&&has('courses','area_id')&&has('courses','revision');
 if(!migrated){
  if(has('sessions','activity_id')||has('courses','area_id')||has('courses','revision'))throw new Error('Partial migration detected. Restore/review the local backup before continuing.');
  db.exec(readFileSync(fileURLToPath(new URL('../drizzle/0005_learning_areas.sql',import.meta.url)),'utf8'));
 }
 const owners=db.prepare('SELECT owner FROM courses UNION SELECT owner FROM sessions').all();
 for(const {owner} of owners)for(const sql of areaBackfillSql)db.prepare(sql).run(owner,owner);
 const afterSessions=db.prepare('SELECT * FROM sessions ORDER BY id').all().map(r=>({...r}));
 assert.deepEqual(afterSessions.map((s,i)=>Object.fromEntries(Object.keys(beforeSessions[i]).map(k=>[k,s[k]]))),beforeSessions,'A pre-existing session field changed');
 for(const c of beforeCourses){const after=db.prepare('SELECT * FROM courses WHERE id=?').get(c.id);assert.deepEqual(Object.fromEntries(Object.keys(c).map(k=>[k,after[k]])),c,'A pre-existing activity field changed');}
 assert.deepEqual(stats(),before,'Session counts or exact durations changed');
 assert.equal(db.prepare('SELECT count(*) AS n FROM sessions s LEFT JOIN courses c ON c.owner=s.owner AND c.id=s.activity_id WHERE c.id IS NULL').get().n,0,'Unmapped session references');
 assert.equal(db.prepare('SELECT count(*) AS n FROM courses c LEFT JOIN learning_areas a ON a.owner=c.owner AND a.id=c.area_id WHERE a.id IS NULL').get().n,0,'Unmapped areas');
 db.exec('COMMIT');
 console.log(JSON.stringify({status:migrated?'already_applied':'migrated',backupPath,checksum,before,after:stats(),preservedExistingSessionFields:true,preservedExistingActivityFields:true}));
}catch(e){db.exec('ROLLBACK');throw e;}finally{db.close();}
