import { activities, activityTypes, type Activity, type ActivityType } from './stopwatch';
import { ensureAreas,initialAreaId,listAreas,unassignedArea } from './learning-areas';

export class ActivityInputError extends Error {}
const invalid = (message:string):never => { throw new ActivityInputError(message); };
export function courseInput(input: Record<string, unknown>) {
 if(typeof input.name!=='string')return invalid('Enter an activity name.');
 const name=input.name.trim().replace(/\s+/g,' ');
 if(!name||name.length>120)return invalid('Use an activity name between 1 and 120 characters.');
 if(input.link!==undefined&&typeof input.link!=='string')return invalid('Enter a valid activity link.');
 const link=(input.link as string|undefined)?.trim()??'';
 if(link.length>2048)return invalid('Keep the activity link under 2,048 characters.');
 if(link){let url;try{url=new URL(link);}catch{return invalid('Use a full link starting with https:// or http://.');}
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return invalid('Use a full link starting with https:// or http://.');}
 const type=input.type??'Course';
 if(!activityTypes.includes(type as ActivityType))return invalid('Choose Course, Skill Practice, or Project.');
 return {name,nameKey:name.toLowerCase(),link,type:type as ActivityType};
}

export async function listActivities(db:D1Database,owner:string):Promise<Activity[]> {
 const rows=await db.prepare('SELECT c.id,c.name,c.link,c.type,c.status,c.area_id AS areaId,c.revision,a.name AS areaName FROM courses c LEFT JOIN learning_areas a ON a.owner=c.owner AND a.id=c.area_id WHERE c.owner = ? ORDER BY c.created_at ASC,c.id ASC').bind(owner).all<Activity&{id:string}>();
 const saved=rows.results.map(c=>({...c,recordId:c.id,id:activities.find(a=>c.id===a.id+':'+owner)?.id??c.id,short:c.name,description:c.type,areaId:c.areaId??unassignedArea.id,areaName:c.areaName??'Unassigned'}));
 const areas=await listAreas(db,owner);
 return [...activities.flatMap<Activity>(a=>{const found=saved.find(c=>c.id===a.id);if(found)return [found];if(saved.some(c=>c.name.toLowerCase()===a.name.toLowerCase()))return [];const areaId=initialAreaId(a.name,a.id);return [{...a,recordId:a.id+':'+owner,areaId,areaName:areas.find(x=>x.id===areaId)?.name??'Unassigned',revision:0}];}),...saved.filter(c=>!activities.some(a=>a.id===c.id))];
}

export const storedActivityId=(activity:Activity,owner:string)=>activity.recordId??(activities.some(a=>a.id===activity.id)?activity.id+':'+owner:activity.id!);
async function areaForInput(db:D1Database,owner:string,input:Record<string,unknown>,fallback=unassignedArea.id){
 const id=input.areaId===undefined?fallback:input.areaId;
 if(typeof id!=='string'||!(await listAreas(db,owner)).some(a=>a.id===id))return invalid('Choose a Learning Area from your list.');
 return id;
}

export async function addCourse(db:D1Database,owner:string,id:string,input:Record<string,unknown>,now=Date.now()) {
 const course=courseInput(input);
 await ensureAreas(db,owner);const areaId=await areaForInput(db,owner,input);
 if(activities.some(a=>a.id===id))return invalid('Invalid activity.');
 const current=await listActivities(db,owner);
 if(current.some(a=>a.id!==id&&a.name.toLowerCase()===course.nameKey))return invalid('That activity name is already in use, including archived or deleted activities.');
 const result=await db.prepare('INSERT INTO courses (id, owner, name, name_key, link, type, created_at,area_id) SELECT ?, ?, ?, ?, ?, ?, ?,? WHERE EXISTS (SELECT 1 FROM learning_areas WHERE owner=? AND id=?) ON CONFLICT DO NOTHING').bind(id,owner,course.name,course.nameKey,course.link,course.type,now,areaId,owner,areaId).run();
 if(!result.meta.changes){
  const existing=current.find(a=>a.id===id);
  if(existing?.name!==course.name||existing.link!==course.link||existing.type!==course.type||existing.areaId!==areaId)return invalid('That activity name is already in use, including archived or deleted activities.');
 }
 return course;
}

export async function editCourse(db:D1Database,owner:string,id:string,input:Record<string,unknown>,now=Date.now()) {
 const course=courseInput(input);
 await ensureAreas(db,owner);
 const current=await listActivities(db,owner),previous=current.find(a=>a.id===id);
 if(!previous)return invalid('Activity not found. Reload your records.');
 if(previous.status&&previous.status!=='active')return invalid('Restore an archived activity before editing its name or type.');
 const areaId=await areaForInput(db,owner,input,previous.areaId);
 if(input.originalName!==previous.name||(input.revision!==undefined&&input.revision!==previous.revision)){
  if(previous.name===course.name&&previous.link===course.link&&previous.type===course.type&&previous.areaId===areaId)return course;
  return invalid('This activity changed in another tab. Reload your records.');
 }
 if(current.some(a=>a.id!==id&&a.name.toLowerCase()===course.nameKey))return invalid('That activity name is already in use, including archived or deleted activities.');
 const storedId=storedActivityId(previous,owner);
 const save=db.prepare("UPDATE courses SET name=?,name_key=?,link=?,type=?,area_id=?,revision=revision+1 WHERE id=? AND owner=? AND name=? AND revision=? AND status='active' AND EXISTS (SELECT 1 FROM learning_areas WHERE owner=? AND id=?) AND NOT EXISTS (SELECT 1 FROM sessions WHERE owner=? AND state!='stopped')")
  .bind(course.name,course.nameKey,course.link,course.type,areaId,storedId,owner,previous.name,previous.revision??0,owner,areaId,owner);
 // Names remain for old clients/CSV; the stable reference survives renames.
 const rename=db.prepare("UPDATE sessions SET activity=?,version=version+1 WHERE owner=? AND (activity_id=? OR (activity_id IS NULL AND activity=?)) AND activity!=? AND EXISTS (SELECT 1 FROM courses WHERE id=? AND owner=? AND name=? AND revision=?)")
  .bind(course.name,owner,storedId,previous.name,course.name,storedId,owner,course.name,(previous.revision??0)+1);
 const result=await db.batch([save,rename]);
 if(!result[0].meta.changes)return invalid('Stop and save open sessions, then reload your records before editing.');
 return course;
}

export async function assignArea(db:D1Database,owner:string,id:string,input:Record<string,unknown>){
 await ensureAreas(db,owner);
 const previous=(await listActivities(db,owner)).find(a=>a.id===id);
 if(!previous||input.revision!==previous.revision)return invalid('This activity changed in another tab. Reload your records.');
 const areaId=await areaForInput(db,owner,input,previous.areaId);
 const result=await db.prepare("UPDATE courses SET area_id=?,revision=revision+1 WHERE id=? AND owner=? AND revision=? AND EXISTS (SELECT 1 FROM learning_areas WHERE owner=? AND id=?) AND NOT EXISTS (SELECT 1 FROM sessions WHERE owner=? AND state!='stopped')")
  .bind(areaId,storedActivityId(previous,owner),owner,previous.revision??0,owner,areaId,owner).run();
 if(!result.meta.changes)return invalid('Stop and save open sessions, then reload your records before moving this activity.');
 return previous.name;
}

export async function changeActivityStatus(db:D1Database,owner:string,id:string,input:Record<string,unknown>,now=Date.now()) {
 const action=input.action;
 if(typeof action!=='string'||!['archive','restore','delete'].includes(action))return invalid('Choose archive, restore, or delete.');
 if(input.deleteHistory!==undefined&&typeof input.deleteHistory!=='boolean')return invalid('History deletion must be explicitly selected.');
 if(input.deleteHistory===true&&action!=='delete')return invalid('Archiving always preserves history.');
 await ensureAreas(db,owner);
 const previous=(await listActivities(db,owner)).find(a=>a.id===id);
 if(!previous)return invalid('Activity not found. Reload your records.');
 const status=action==='archive'?'archived':action==='restore'?'active':'deleted';
 if(previous.name!==input.originalName||(previous.status??'active')!==input.originalStatus||(input.revision!==undefined&&input.revision!==previous.revision))return invalid('This activity changed in another tab. Reload your records.');
 if(previous.status==='deleted')return invalid('This activity is already deleted. Reload your records.');
 if(action==='restore'&&previous.status!=='archived')return invalid('Only archived activities can be restored.');
 const builtin=activities.find(a=>a.id===id),storedId=builtin?id+':'+owner:id;
 // Persist virtual defaults too, so a removed default never reappears on reload.
 const save=db.prepare("INSERT INTO courses (id,owner,name,name_key,link,type,created_at,status) SELECT ?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM sessions WHERE owner=? AND activity=? AND state!='stopped') ON CONFLICT(id) DO UPDATE SET status=excluded.status,revision=courses.revision+1 WHERE courses.owner=excluded.owner AND courses.name=? AND courses.status=? AND courses.revision=?")
  .bind(storedId,owner,previous.name,previous.name.toLowerCase(),previous.link,previous.type,now,status,owner,previous.name,previous.name,previous.status??'active',previous.revision??0);
 const statements=[save];
 if(action==='delete'&&input.deleteHistory===true)statements.push(db.prepare("DELETE FROM sessions WHERE owner=? AND activity=? AND state='stopped' AND changes()=1 AND EXISTS (SELECT 1 FROM courses WHERE id=? AND owner=? AND name=? AND status='deleted')").bind(owner,previous.name,storedId,owner,previous.name));
 const result=await db.batch(statements);
 if(!result[0].meta.changes)return invalid('Stop and save this activity’s open session first, then reload your records.');
 return previous.name;
}
