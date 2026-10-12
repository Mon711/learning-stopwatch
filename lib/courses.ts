import { activities, activityTypes, type Activity, type ActivityType } from './stopwatch';

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
 const rows=await db.prepare('SELECT id, name, link, type FROM courses WHERE owner = ? ORDER BY created_at ASC, id ASC').bind(owner).all<{id:string;name:string;link:string;type:ActivityType}>();
 const saved=rows.results.map(c=>({...c,id:activities.find(a=>c.id===a.id+':'+owner)?.id??c.id,short:c.name,description:c.type}));
 return [...activities.map(a=>saved.find(c=>c.id===a.id)??a),...saved.filter(c=>!activities.some(a=>a.id===c.id))];
}

export async function addCourse(db:D1Database,owner:string,id:string,input:Record<string,unknown>,now=Date.now()) {
 const course=courseInput(input);
 if(activities.some(a=>a.id===id))return invalid('Invalid activity.');
 const current=await listActivities(db,owner);
 if(current.some(a=>a.id!==id&&a.name.toLowerCase()===course.nameKey))return invalid('That activity is already in your list.');
 const result=await db.prepare('INSERT INTO courses (id, owner, name, name_key, link, type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING').bind(id,owner,course.name,course.nameKey,course.link,course.type,now).run();
 if(!result.meta.changes){
  const existing=current.find(a=>a.id===id);
  if(existing?.name!==course.name||existing.link!==course.link||existing.type!==course.type)return invalid('That activity is already in your list.');
 }
 return course;
}

export async function editCourse(db:D1Database,owner:string,id:string,input:Record<string,unknown>,now=Date.now()) {
 const course=courseInput(input);
 const current=await listActivities(db,owner),previous=current.find(a=>a.id===id);
 if(!previous)return invalid('Activity not found. Reload your records.');
 if(input.originalName!==previous.name){
  if(previous.name===course.name&&previous.link===course.link&&previous.type===course.type)return course;
  return invalid('This activity changed in another tab. Reload your records.');
 }
 if(current.some(a=>a.id!==id&&a.name.toLowerCase()===course.nameKey))return invalid('That activity is already in your list.');
 // Virtual defaults are persisted only when edited. A single atomic batch keeps
 // renamed activities and their historical sessions together, including retries.
 const builtin=activities.find(a=>a.id===id);
 const storedId=builtin?id+':'+owner:id;
 const save=builtin
  ? db.prepare('INSERT INTO courses (id,owner,name,name_key,link,type,created_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,name_key=excluded.name_key,link=excluded.link,type=excluded.type WHERE courses.owner=excluded.owner AND courses.name=?').bind(storedId,owner,course.name,course.nameKey,course.link,course.type,now,previous.name)
  : db.prepare('UPDATE courses SET name=?,name_key=?,link=?,type=? WHERE id=? AND owner=? AND name=?').bind(course.name,course.nameKey,course.link,course.type,id,owner,previous.name);
 const rename=db.prepare('UPDATE sessions SET activity=?,version=version+1 WHERE owner=? AND activity=? AND activity!=? AND EXISTS (SELECT 1 FROM courses WHERE id=? AND owner=? AND name=?)').bind(course.name,owner,previous.name,course.name,storedId,owner,course.name);
 const result=await db.batch([save,rename]);
 if(!result[0].meta.changes)return invalid('This activity changed in another tab. Reload your records.');
 return course;
}
