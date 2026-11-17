import { getLogAccess } from '@/app/log-access';
import { database } from '@/db';
import { handleTotalsRead } from '@/lib/totals-api';
export const dynamic = 'force-dynamic';
export async function GET() { return handleTotalsRead((await getLogAccess())?.ownerId ?? null, database); }
