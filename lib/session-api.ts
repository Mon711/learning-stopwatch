import { indiaDay,manualRange,type Session } from './stopwatch';
import { listActivities } from './courses';
const response = (data: unknown, status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function read(db:D1Database,owner: string,knownActivities?:Awaited<ReturnType<typeof listActivities>>) {
 const [rows,activities]=await Promise.all([db.prepare('SELECT * FROM sessions WHERE owner = ? ORDER BY started_at DESC').bind(owner).all<Session>(),knownActivities??listActivities(db,owner)]);
 return {sessions:rows.results,activities,now:Date.now()};
}
export async function handleSessionRead(owner:string|null,database:()=>D1Database) {
 if (!owner) return response({error:'Please sign in to load your sessions.'},401);
 try { return response(await read(database(),owner)); }
 catch(e) { console.error('Load sessions failed',e); return response({error:'Your records could not be loaded. Please retry.'},503); }
}
export async function handleSessionWrite(request:Request,owner:string|null,database:()=>D1Database,now=Date.now()) {
 if (!owner) return response({error:'Please sign in to save your session.'},401);
 const origin=request.headers.get('origin');
 if (origin && origin !== new URL(request.url).origin) return response({error:'Invalid request origin.'},403);
 let b: Record<string,unknown>;
 try { b=await request.json(); } catch { return response({error:'Invalid request.'},400); }
 if (!b || typeof b.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(b.id)) return response({error:'Invalid session.'},400);
 try {
 const db=database();
 const timerAction=['start','pause','resume','stop'].includes(String(b.action));
 if(timerAction&&b.operation_id!==undefined&&(typeof b.operation_id!=='string'||!/^[a-f0-9-]{36}$/i.test(b.operation_id)))return response({error:'Invalid timer operation.'},400);
 if(timerAction&&b.at_ms!==undefined&&(typeof b.at_ms!=='number'||!Number.isSafeInteger(b.at_ms)||b.at_ms<now-86400000||b.at_ms>now+30000))return response({error:'Your timer clock needs refreshing. Reload your records.'},400);
 const at=timerAction&&typeof b.at_ms==='number'?b.at_ms:now;
 const operationId=timerAction&&typeof b.operation_id==='string'?b.operation_id:null;
 if(operationId){const already=await db.prepare('SELECT id FROM sessions WHERE id = ? AND owner = ? AND last_operation_id = ?').bind(b.id,owner,operationId).first();if(already)return response(await read(db,owner));}
 const activities=['start','manual','edit_activity'].includes(String(b.action))?await listActivities(db,owner):[];
 if(b.action==='start') {
  if(typeof b.activity!=='string' || !activities.some(a=>a.name===b.activity)) return response({error:'Choose a learning activity from your list.'},400);
  const existing=await db.prepare('SELECT id FROM sessions WHERE id = ? AND owner = ?').bind(b.id,owner).first();
  if(!existing) {
   const active=await db.prepare("SELECT id FROM sessions WHERE owner = ? AND state != 'stopped'").bind(owner).first();
   if(active) return response({...await read(db,owner),error:'Another session is open. Your timer has been refreshed.'},409);
   await db.prepare("INSERT INTO sessions (id,owner,activity,state,started_at,day,elapsed_ms,resumed_at,version,what,last_operation_id) VALUES (?,?,?,'running',?,?,0,?,0,'',?)").bind(b.id,owner,b.activity,at,indiaDay(at),at,operationId).run();
  }
 } else if(b.action==='manual') {
  if(typeof b.activity!=='string'||!activities.some(a=>a.name===b.activity))return response({error:'Choose a learning activity from your list.'},400);
  if(typeof b.what!=='string'||b.what.length>2000)return response({error:'Keep the session note under 2,000 characters.'},400);
  let range;
  try {range=manualRange(b.start,b.end,now);}catch(e){return response({error:e instanceof Error?e.message:'Enter a valid time range.'},400);}
  const existing=await db.prepare('SELECT id FROM sessions WHERE id = ? AND owner = ?').bind(b.id,owner).first();
  if(!existing)await db.prepare("INSERT INTO sessions (id,owner,activity,state,started_at,stopped_at,day,elapsed_ms,resumed_at,version,what) VALUES (?,?,?,'stopped',?,?,?,?,NULL,0,?)").bind(b.id,owner,b.activity,range.startedAt,range.stoppedAt,range.day,range.elapsedMs,b.what.trim()).run();
 } else {
  if(!Number.isInteger(b.version) || Number(b.version)<0) return response({error:'Invalid timer version.'},400);
  let result;
  if(b.action==='pause') {
   result=await db.prepare("UPDATE sessions SET elapsed_ms = elapsed_ms + MAX(0, ? - resumed_at), resumed_at = NULL, state = 'paused', version = version + 1, last_operation_id = ? WHERE id = ? AND owner = ? AND version = ? AND state = 'running'").bind(at,operationId,b.id,owner,b.version).run();
  } else if(b.action==='resume') {
   result=await db.prepare("UPDATE sessions SET resumed_at = MAX(?, started_at), state = 'running', version = version + 1, last_operation_id = ? WHERE id = ? AND owner = ? AND version = ? AND state = 'paused'").bind(at,operationId,b.id,owner,b.version).run();
  } else if(b.action==='stop') {
   if(typeof b.what!=='string' || b.what.length>2000) return response({error:'Keep the session note under 2,000 characters.'},400);
   result=await db.prepare("UPDATE sessions SET elapsed_ms = elapsed_ms + CASE WHEN state = 'running' THEN MAX(0, ? - resumed_at) ELSE 0 END, resumed_at = NULL, stopped_at = MAX(?, started_at, COALESCE(resumed_at, started_at)), state = 'stopped', what = ?, version = version + 1, last_operation_id = ? WHERE id = ? AND owner = ? AND version = ? AND state IN ('running','paused')").bind(at,at,b.what.trim(),operationId,b.id,owner,b.version).run();
  } else if(b.action==='edit'||b.action==='edit_activity') {
   if(typeof b.minutes!=='number' || !Number.isFinite(b.minutes) || b.minutes<0 || b.minutes>100000 || typeof b.what!=='string' || b.what.length>2000) return response({error:'Enter a valid duration and note.'},400);
   if(b.action==='edit_activity'&&(typeof b.activity!=='string'||!activities.some(a=>a.name===b.activity)))return response({error:'Choose a learning activity from your list.'},400);
   result=await db.prepare("UPDATE sessions SET elapsed_ms = ?, what = ?, activity = COALESCE(?, activity), version = version + 1 WHERE id = ? AND owner = ? AND version = ? AND state = 'stopped'").bind(Math.round(b.minutes*60000),b.what.trim(),b.action==='edit_activity'?b.activity:null,b.id,owner,b.version).run();
  } else if(b.action==='delete') {
   result=await db.prepare('DELETE FROM sessions WHERE id = ? AND owner = ? AND version = ?').bind(b.id,owner,b.version).run();
  } else return response({error:'Unknown timer action.'},400);
  if(!result.meta.changes) return response({...await read(db,owner),error:'This session changed in another tab. Your records have been refreshed.'},409);
 }
 return response(await read(db,owner,activities.length?activities:undefined));
 } catch(e) {console.error('Save session failed',e);return response({error:'Could not confirm the save. Retry loading your records before trying again.'},503);}
}
