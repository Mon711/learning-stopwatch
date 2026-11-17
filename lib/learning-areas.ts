import { areaBackfillSql } from './learning-area-backfill';
import { activities } from './stopwatch';
export type LearningArea={id:string;name:string;revision:number;system?:boolean};
export const initialAreas:LearningArea[]=[
 {id:'10000000-0000-4000-8000-000000000001',name:'AI Engineering',revision:0},
 {id:'10000000-0000-4000-8000-000000000002',name:'Software Engineering',revision:0},
 {id:'10000000-0000-4000-8000-000000000003',name:'Music',revision:0},
 {id:'10000000-0000-4000-8000-000000000004',name:'General Skills',revision:0},
];
export const unassignedArea:LearningArea={id:'10000000-0000-4000-8000-000000000005',name:'Unassigned',revision:0,system:true};
export function initialAreaId(name:string,id?:string){
 if(id===activities[0].id||id===activities[2].id||['Scrimba Full Stack','Scrimba Project','Exercism JS Track','Exercism JavaScript'].includes(name))return initialAreas[1].id;
 if(id===activities[1].id||['Ed Donner AI Engineering','AI Engineering Projects'].includes(name))return initialAreas[0].id;
 return name==='Riyaz'?initialAreas[2].id:name==='Speed Typing'?initialAreas[3].id:unassignedArea.id;
}
export async function listAreas(db:D1Database,owner:string):Promise<LearningArea[]>{
 const rows=await db.prepare('SELECT id,name,revision,system FROM learning_areas WHERE owner=? ORDER BY created_at,id').bind(owner).all<LearningArea>();
 return rows.results.length?rows.results:[...initialAreas,unassignedArea];
}
// Initialize new accounts and backfill existing accounts only on an authorized write.
export async function ensureAreas(db:D1Database,owner:string){
 if(await db.prepare('SELECT id FROM learning_areas WHERE owner=? AND id=?').bind(owner,unassignedArea.id).first())return;
 await db.batch(areaBackfillSql.map(sql=>db.prepare(sql).bind(owner,owner)));
}
export class AreaInputError extends Error {}
export function areaName(value:unknown){
 if(typeof value!=='string')throw new AreaInputError('Enter a Learning Area name.');
 const name=value.trim().replace(/\s+/g,' ');
 if(!name||name.length>80)throw new AreaInputError('Use a Learning Area name between 1 and 80 characters.');
 if(name.toLowerCase()==='unassigned')throw new AreaInputError('Unassigned is reserved for records that need classification.');
 return name;
}
export async function writeArea(db:D1Database,owner:string,input:Record<string,unknown>){
 if(typeof input.id!=='string'||!/^[a-f0-9-]{36}$/i.test(input.id))throw new AreaInputError('Invalid Learning Area.');
 await ensureAreas(db,owner);
 const areas=await listAreas(db,owner),previous=areas.find(a=>a.id===input.id);
 const action=input.action;
 if(typeof action!=='string'||!['create','rename','delete'].includes(action))throw new AreaInputError('Choose create, rename, or delete.');
 if(action==='create'){
  const name=areaName(input.name);
  if(areas.some(a=>a.name.toLowerCase()===name.toLowerCase()))throw new AreaInputError('That Learning Area already exists.');
  const r=await db.prepare('INSERT OR IGNORE INTO learning_areas (owner,id,name,name_key,created_at) VALUES (?,?,?,?,?)').bind(owner,input.id,name,name.toLowerCase(),Date.now()).run();
  if(!r.meta.changes)throw new AreaInputError('That Learning Area already exists. Reload your areas.');
  return;
 }
 if(!previous||previous.system||previous.id===unassignedArea.id)throw new AreaInputError('This Learning Area cannot be changed.');
 if(!Number.isInteger(input.revision)||input.revision!==previous.revision)throw new AreaInputError('This area changed in another tab. Reload your records before retrying.');
 if(action==='rename'){
  const name=areaName(input.name);
  if(areas.some(a=>a.id!==input.id&&a.name.toLowerCase()===name.toLowerCase()))throw new AreaInputError('That Learning Area already exists.');
  const r=await db.prepare('UPDATE learning_areas SET name=?,name_key=?,revision=revision+1 WHERE owner=? AND id=? AND revision=?').bind(name,name.toLowerCase(),owner,input.id,input.revision).run();
  if(!r.meta.changes)throw new AreaInputError('This area changed in another tab. Reload your records.');
  return;
 }
 const goals=await db.prepare("SELECT name FROM learning_goals WHERE owner=? AND json_extract(scope,'$.kind')='areas' AND EXISTS (SELECT 1 FROM json_each(scope,'$.areaIds') WHERE value=?)").bind(owner,input.id).all<{name:string}>();
 if(goals.results.length)throw new AreaInputError('This area is used by goals: '+goals.results.map(g=>g.name).join(', ')+'. Edit their scopes in Goals before deleting this area. Past goals are included.');
 const members=await db.prepare('SELECT id FROM courses WHERE owner=? AND area_id=?').bind(owner,input.id).all();
 const destination=areas.find(a=>a.id===input.destinationId&&!a.system&&a.id!==input.id);
 if(members.results.length&&!destination)throw new AreaInputError('Choose another Learning Area for all affected activities.');
 // The guarded move and deletion share one transaction, including open-session checks.
 const allowed="EXISTS (SELECT 1 FROM learning_areas WHERE owner=? AND id=? AND revision=?) AND NOT EXISTS (SELECT 1 FROM sessions s JOIN courses c ON c.owner=s.owner AND (c.id=s.activity_id OR (s.activity_id IS NULL AND c.name=s.activity)) WHERE c.owner=? AND c.area_id=? AND s.state!='stopped') AND NOT EXISTS (SELECT 1 FROM learning_goals g,json_each(g.scope,'$.areaIds') j WHERE g.owner=? AND json_extract(g.scope,'$.kind')='areas' AND j.value=?)";
 const allowedArgs=[owner,input.id,input.revision,owner,input.id,owner,input.id];
 const statements=[];
 if(destination)statements.push(db.prepare(`UPDATE courses SET area_id=?,revision=revision+1 WHERE owner=? AND area_id=? AND ${allowed} AND EXISTS (SELECT 1 FROM learning_areas WHERE owner=? AND id=? AND system=0)`).bind(destination.id,owner,input.id,...allowedArgs,owner,destination.id));
 statements.push(db.prepare(`DELETE FROM learning_areas WHERE owner=? AND id=? AND revision=? AND system=0 AND NOT EXISTS (SELECT 1 FROM courses WHERE owner=? AND area_id=?) AND ${allowed}`).bind(owner,input.id,input.revision,owner,input.id,...allowedArgs));
 const result=await db.batch(statements);
 if(!result.at(-1)!.meta.changes)throw new AreaInputError('Stop and save affected timers, then reload your records before deleting this area.');
}
