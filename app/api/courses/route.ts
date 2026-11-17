import { getLogAccess } from '@/app/log-access';
import { withLogWriteAccess } from '@/lib/log-access';
import { database } from '@/db';
import { handleCourseWrite } from '@/lib/courses-api';
export const dynamic='force-dynamic';
async function write(request:Request){return withLogWriteAccess(await getLogAccess(),owner=>handleCourseWrite(request,owner,database));}
export const POST=write;
export const PATCH=write;
