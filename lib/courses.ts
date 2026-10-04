import { activities, type Activity } from './stopwatch';

export function courseInput(input: Record<string, unknown>) {
 if(typeof input.name!=='string')throw new Error('Enter a course name.');
 const name=input.name.trim().replace(/\s+/g,' ');
 if(!name||name.length>120)throw new Error('Use a course name between 1 and 120 characters.');
 if(input.link!==undefined&&typeof input.link!=='string')throw new Error('Enter a valid course link.');
 const link=(input.link as string|undefined)?.trim()??'';
 if(link.length>2048)throw new Error('Keep the course link under 2,048 characters.');
 if(link){let url;try{url=new URL(link);}catch{throw new Error('Use a full link starting with https:// or http://.');}
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error('Use a full link starting with https:// or http://.');}
 return {name,nameKey:name.toLowerCase(),link};
}

export async function listActivities(db:D1Database,owner:string):Promise<Activity[]> {
 const rows=await db.prepare('SELECT name, link FROM courses WHERE owner = ? ORDER BY created_at ASC, id ASC').bind(owner).all<{name:string;link:string}>();
 return [...activities,...rows.results.map(c=>({name:c.name,short:c.name,description:'Custom course',link:c.link}))];
}

export async function addCourse(db:D1Database,owner:string,id:string,input:Record<string,unknown>,now=Date.now()) {
 const course=courseInput(input);
 if(activities.some(a=>a.name.toLowerCase()===course.nameKey))throw new Error('That course is already in your list.');
 const result=await db.prepare('INSERT INTO courses (id, owner, name, name_key, link, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING').bind(id,owner,course.name,course.nameKey,course.link,now).run();
 if(!result.meta.changes){
  const existing=await db.prepare('SELECT name FROM courses WHERE id = ? AND owner = ?').bind(id,owner).first<{name:string}>();
  if(existing?.name!==course.name)throw new Error('That course is already in your list.');
 }
 return course;
}
