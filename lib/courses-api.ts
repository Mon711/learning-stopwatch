import { addCourse, editCourse, changeActivityStatus, assignArea, courseInput, listActivities, ActivityInputError } from './courses';
import { handleSessionRead } from './session-api';
const response=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function handleCourseWrite(request:Request,owner:string|null,database:()=>D1Database) {
 if(!owner)return response({error:'Please sign in to save an activity.'},401);
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return response({error:'Invalid request origin.'},403);
 let input:Record<string,unknown>;
 try {input=await request.json();if(!input||typeof input.id!=='string'||!/^[a-f0-9-]{36}$/i.test(input.id))throw new Error('Invalid activity.');if(!input.action)courseInput(input);}
 catch(e){return response({error:e instanceof Error?e.message:'Enter an activity name and valid link.'},400);}
 try {
  const db=database();
  const course=input.action&&request.method==='PATCH'?{name:await (input.action==='set_area'?assignArea:changeActivityStatus)(db,owner,input.id as string,input)}:await (request.method==='PATCH'?editCourse:addCourse)(db,owner,input.id as string,input);
  // Editing can rename session activity references: return the saved snapshot.
  if(request.method==='PATCH'){
   const snapshot=await handleSessionRead(owner,()=>db);
   if(!snapshot.ok)return snapshot;
   return response({...await snapshot.json() as Record<string,unknown>,course:course.name});
  }
  return response({activities:await listActivities(db,owner),course:course.name});
 } catch(e){
  if(e instanceof ActivityInputError)return response({error:e.message},409);
  console.error('Save activity failed',e);
  return response({error:'Could not confirm the save. Please retry; your activity details are kept here.'},503);
 }
}
