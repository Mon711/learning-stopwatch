import { getChatGPTUser } from '@/app/chatgpt-auth';
import { database } from '@/db';
import { handleTotalsRead } from '@/lib/totals-api';
export const dynamic = 'force-dynamic';
export async function GET() { return handleTotalsRead((await getChatGPTUser())?.userId ?? null, database); }
