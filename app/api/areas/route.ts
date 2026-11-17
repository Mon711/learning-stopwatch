import { getLogAccess } from '@/app/log-access';
import { withLogWriteAccess } from '@/lib/log-access';
import { database } from '@/db';
import { handleAreaWrite } from '@/lib/areas-api';
export const dynamic='force-dynamic';
export async function POST(request:Request){return withLogWriteAccess(await getLogAccess(),owner=>handleAreaWrite(request,owner,database));}
