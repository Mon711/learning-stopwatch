import { handleSessionRead } from './session-api';
import { learningTotals } from './learning-totals';
import type { Activity, Session } from './stopwatch';

export async function handleTotalsRead(owner: string | null, database: () => D1Database) {
 const response = await handleSessionRead(owner, database);
 if (!response.ok) return response;
 const data = await response.json() as { sessions: Session[]; activities: Activity[]; now: number;areas:unknown[] };
 return Response.json({ ...learningTotals(data.sessions, data.activities), activities:data.activities,areas:data.areas,updatedAt: data.now }, { headers: { 'Cache-Control': 'no-store' } });
}
