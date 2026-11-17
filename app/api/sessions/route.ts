import { getLogAccess } from '@/app/log-access';
import { withLogWriteAccess } from '@/lib/log-access';
import { database } from '@/db';
import { handleSessionRead,handleSessionWrite } from '@/lib/session-api';
export const dynamic='force-dynamic';
export async function GET(){return handleSessionRead((await getLogAccess())?.ownerId??null,database);}
export async function POST(request:Request){return withLogWriteAccess(await getLogAccess(),owner=>handleSessionWrite(request,owner,database));}
