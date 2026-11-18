import { logFailure } from './diagnostics';
import { indiaDay,manualRange,type Session } from './stopwatch';
import { listAreas,ensureAreas } from './learning-areas';
import { listActivities,storedActivityId } from './courses';
const response = (data: unknown, status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function read(db:D1Database,owner: string,knownActivities?:Awaited<ReturnType<typeof listActivities>>) {
 const areas=await listAreas(db,owner);
 const [rows,activities]=await Promise.all([db.prepare('SELECT s.*,COALESCE(c.name,s.activity) AS activity FROM sessions s LEFT JOIN courses c ON c.owner=s.owner AND c.id=s.activity_id WHERE s.owner = ? ORDER BY s.started_at DESC').bind(owner).all<Session>(),knownActivities??listActivities(db,owner,areas)]);
 return {sessions:rows.results,activities,areas,now:Date.now()};
}
export async function handleSessionRead(owner:string|null,database:()=>D1Database) {
 if (!owner) return response({error:'Please sign in to load your sessions.'},401);
 try { return response(await read(database(),owner)); }
 catch(e) { logFailure('Load sessions failed',e); return response({error:'Your records could not be loaded. Please retry.'},503); }
}
export async function handleSessionWrite(request:Request,owner:string|null,database:()=>D1Database,now=Date.now()) {
 const began=Date.now();
 if (!owner) return response({error:'Please sign in to save your session.'},401);
 const origin=request.headers.get('origin');
 if (origin && origin !== new URL(request.url).origin) return response({error:'Invalid request origin.'},403);
 let b: Record<string,unknown>;
 try { b=await request.json(); } catch { return response({error:'Invalid request.'},400); }
 if (!b || typeof b.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(b.id)) return response({error:'Invalid session.'},400);
 try {
 const db=database();
 let acknowledged:Session|null|undefined;
 const savedResponse=async()=>b.response_mode==='ack'?response({saved:true,id:b.id,operation_id:b.operation_id,session:acknowledged!==undefined?acknowledged:await db.prepare('SELECT * FROM sessions WHERE owner=? AND id=?').bind(owner,b.id).first<Session>(),now:Date.now()}):response(await read(db,owner));
 await ensureAreas(db,owner);
 const timerAction=['start','pause','resume','stop'].includes(String(b.action));
 if(timerAction&&b.operation_id!==undefined&&(typeof b.operation_id!=='string'||!/^[a-f0-9-]{36}$/i.test(b.operation_id)))return response({error:'Invalid timer operation.'},400);
 const at=timerAction&&typeof b.at_ms==='number'?b.at_ms:now;
 const operationId=timerAction&&typeof b.operation_id==='string'?b.operation_id:null;
 if(operationId){const already=await db.prepare('SELECT id FROM sessions WHERE id = ? AND owner = ? AND last_operation_id = ?').bind(b.id,owner,operationId).first();if(already)return await savedResponse();}
 if(timerAction&&b.at_ms!==undefined&&(typeof b.at_ms!=='number'||!Number.isSafeInteger(b.at_ms)||b.at_ms<now-86400000||b.at_ms>now+30000))return response({error:'Your timer clock needs refreshing. Reload your records.'},400);
 const activities=['start','manual','edit_activity'].includes(String(b.action))?await listActivities(db,owner):[];
 if(b.action==='start') {
  if(typeof b.activity!=='string' || !activities.some(a=>a.name===b.activity&&(!a.status||a.status==='active'))) return response({error:'Choose a learning activity from your list.'},400);
  const existing=await db.prepare('SELECT id FROM sessions WHERE id = ? AND owner = ?').bind(b.id,owner).first();
  if(!existing) {
   const active=await db.prepare("SELECT id FROM sessions WHERE owner = ? AND state != 'stopped'").bind(owner).first();
   if(active) return response({...await read(db,owner),error:'Another session is open. Your timer has been refreshed.'},409);
   const saved=await db.prepare("INSERT INTO sessions (id,owner,activity,activity_id,state,started_at,day,elapsed_ms,resumed_at,version,what,last_operation_id) SELECT ?,?,?,?,'running',?,?,0,?,0,'',? WHERE EXISTS (SELECT 1 FROM courses WHERE owner=? AND id=? AND status='active') RETURNING *").bind(b.id,owner,b.activity,storedActivityId(activities.find(a=>a.name===b.activity)!,owner),at,indiaDay(at),at,operationId,owner,storedActivityId(activities.find(a=>a.name===b.activity)!,owner)).all<Session>();
   acknowledged=saved.results[0];if(!saved.results.length)return response({error:'This activity is no longer active. Reload your records.'},409);
  }
 } else if(b.action==='manual') {
  if(typeof b.activity!=='string'||!activities.some(a=>a.name===b.activity&&(!a.status||a.status==='active')))return response({error:'Choose a learning activity from your list.'},400);
  if(typeof b.what!=='string'||b.what.length>2000)return response({error:'Keep the session note under 2,000 characters.'},400);
  let range;
  try {range=manualRange(b.start,b.end,now);}catch(e){return response({error:e instanceof Error?e.message:'Enter a valid time range.'},400);}
  const existing=await db.prepare('SELECT id FROM sessions WHERE id = ? AND owner = ?').bind(b.id,owner).first();
  if(existing){const original=await db.prepare('SELECT * FROM sessions WHERE owner=? AND id=?').bind(owner,b.id).first<Session>();if(!original||original.started_at!==range.startedAt||original.stopped_at!==range.stoppedAt||original.what!==b.what.trim()||original.activity!==b.activity)return response({error:'This session was already saved with different details. Reload records and correct the saved session.'},409);}
  if(!existing){const saved=await db.prepare("INSERT INTO sessions (id,owner,activity,activity_id,state,started_at,stopped_at,day,elapsed_ms,resumed_at,version,what) SELECT ?,?,?,?,'stopped',?,?,?,?,NULL,0,? WHERE EXISTS (SELECT 1 FROM courses WHERE owner=? AND id=? AND status='active') RETURNING *").bind(b.id,owner,b.activity,storedActivityId(activities.find(a=>a.name===b.activity)!,owner),range.startedAt,range.stoppedAt,range.day,range.elapsedMs,b.what.trim(),owner,storedActivityId(activities.find(a=>a.name===b.activity)!,owner)).all<Session>();acknowledged=saved.results[0];if(!saved.results.length)return response({error:'This activity is no longer active. Reload your records.'},409);}
 } else {
  if(!Number.isInteger(b.version) || Number(b.version)<0) return response({error:'Invalid timer version.'},400);
  let result;
  if(b.action==='pause') {
   result=await db.prepare("UPDATE sessions SET elapsed_ms = elapsed_ms + MAX(0, ? - resumed_at), resumed_at = NULL, state = 'paused', version = version + 1, last_operation_id = ? WHERE id = ? AND owner = ? AND version = ? AND state = 'running' RETURNING *").bind(at,operationId,b.id,owner,b.version).all<Session>();
  } else if(b.action==='resume') {
   result=await db.prepare("UPDATE sessions SET resumed_at = MAX(?, started_at), state = 'running', version = version + 1, last_operation_id = ? WHERE id = ? AND owner = ? AND version = ? AND state = 'paused' RETURNING *").bind(at,operationId,b.id,owner,b.version).all<Session>();
  } else if(b.action==='stop') {
   if(typeof b.what!=='string' || b.what.length>2000) return response({error:'Keep the session note under 2,000 characters.'},400);
   result=await db.prepare("UPDATE sessions SET elapsed_ms = elapsed_ms + CASE WHEN state = 'running' THEN MAX(0, ? - resumed_at) ELSE 0 END, resumed_at = NULL, stopped_at = MAX(?, started_at, COALESCE(resumed_at, started_at)), state = 'stopped', what = ?, version = version + 1, last_operation_id = ? WHERE id = ? AND owner = ? AND version = ? AND state IN ('running','paused') RETURNING *").bind(at,at,b.what.trim(),operationId,b.id,owner,b.version).all<Session>();
  } else if(b.action==='edit'||b.action==='edit_activity') {
   if(typeof b.minutes!=='number' || !Number.isFinite(b.minutes) || b.minutes<0 || b.minutes>100000 || typeof b.what!=='string' || b.what.length>2000) return response({error:'Enter a valid duration and note.'},400);
   const original=b.action==='edit_activity'?await db.prepare('SELECT activity FROM sessions WHERE id=? AND owner=?').bind(b.id,owner).first<{activity:string}>():null;
   if(b.action==='edit_activity'&&(typeof b.activity!=='string'||(!activities.some(a=>a.name===b.activity&&(!a.status||a.status==='active'))&&original?.activity!==b.activity)))return response({error:'Choose a learning activity from your list.'},400);
   result=await db.prepare("UPDATE sessions SET elapsed_ms = ?, what = ?, activity = COALESCE(?, activity), activity_id = COALESCE(?,activity_id), version = version + 1 WHERE id = ? AND owner = ? AND version = ? AND state = 'stopped' RETURNING *").bind(Math.round(b.minutes*60000),b.what.trim(),b.action==='edit_activity'?b.activity:null,b.action==='edit_activity'?storedActivityId(activities.find(a=>a.name===b.activity)!,owner):null,b.id,owner,b.version).all<Session>();
  } else if(b.action==='delete') {
   result=await db.prepare('DELETE FROM sessions WHERE id = ? AND owner = ? AND version = ? RETURNING *').bind(b.id,owner,b.version).all<Session>();
  } else return response({error:'Unknown timer action.'},400);
  acknowledged=b.action==='delete'?null:result.results[0];
  if(!result.results.length) return response({...await read(db,owner),error:'This session changed in another tab. Your records have been refreshed.'},409);
 }
 return await savedResponse();
 } catch(e) {logFailure('Save session failed',e,{operationId:typeof b.operation_id==='string'&&/^[a-f0-9-]{36}$/i.test(b.operation_id)?b.operation_id:undefined,action:['start','pause','resume','stop','manual','edit','edit_activity','delete'].includes(String(b.action))?String(b.action):undefined,durationMs:Date.now()-began});return response({error:'Could not confirm the save. Retry loading your records before trying again.'},503);}
}
