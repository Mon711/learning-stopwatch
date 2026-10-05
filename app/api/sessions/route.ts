import { getChatGPTUser } from '@/app/chatgpt-auth';
import { database } from '@/db';
import { handleSessionRead,handleSessionWrite } from '@/lib/session-api';
export const dynamic='force-dynamic';
export async function GET(){return handleSessionRead((await getChatGPTUser())?.userId??null,database);}
export async function POST(request:Request){return handleSessionWrite(request,(await getChatGPTUser())?.userId??null,database);}
