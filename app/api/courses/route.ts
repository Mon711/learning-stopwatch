import { getChatGPTUser } from '@/app/chatgpt-auth';
import { database } from '@/db';
import { addCourse,courseInput,listActivities } from '@/lib/courses';
export const dynamic='force-dynamic';
const response=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request){
 const user=await getChatGPTUser();if(!user)return response({error:'Please sign in to add a course.'},401);
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return response({error:'Invalid request origin.'},403);
 let input:Record<string,unknown>;
 try{input=await request.json();if(!input||typeof input.id!=='string'||!/^[a-f0-9-]{36}$/i.test(input.id))throw new Error('Invalid course.');courseInput(input);}
 catch(e){return response({error:e instanceof Error?e.message:'Enter a course name and valid link.'},400);}
 try{const db=database();const course=await addCourse(db,user.userId,input.id as string,input);return response({activities:await listActivities(db,user.userId),course:course.name});}
 catch(e){if(e instanceof Error&&e.message==='That course is already in your list.')return response({error:e.message},409);console.error('Add course failed',e);return response({error:'Could not confirm the save. Please retry; your course details are kept here.'},503);}
}
