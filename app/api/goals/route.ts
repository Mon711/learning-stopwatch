import { getLogAccess } from '@/app/log-access';
import { withLogWriteAccess } from '@/lib/log-access';
import { database } from '@/db';
import { handleGoalsRead, handleGoalsWrite } from '@/lib/goals-api';
export const dynamic = 'force-dynamic';
export async function GET() { return handleGoalsRead((await getLogAccess())?.ownerId ?? null, database); }
export async function POST(request: Request) { return withLogWriteAccess(await getLogAccess(), owner => handleGoalsWrite(request, owner, database)); }
