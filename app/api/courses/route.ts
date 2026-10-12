import { getChatGPTUser } from '@/app/chatgpt-auth';
import { database } from '@/db';
import { handleCourseWrite } from '@/lib/courses-api';
export const dynamic='force-dynamic';
async function write(request:Request){const user=await getChatGPTUser();return handleCourseWrite(request,user?.userId??null,database);}
export const POST=write;
export const PATCH=write;
