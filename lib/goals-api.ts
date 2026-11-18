import { logFailure } from './diagnostics';
import { GoalInputError } from './goals';
import { readGoals, writeGoal } from './goals-store';
const response = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export async function handleGoalsRead(owner: string | null, database: () => D1Database) {
 if (!owner) return response({ error: 'Please sign in to view your goals.' }, 401);
 try { return response(await readGoals(database(), owner)); }
 catch (e) { logFailure('Load goals failed',e); return response({ error: 'Your goals could not be loaded. Please retry.' }, 503); }
}
export async function handleGoalsWrite(request: Request, owner: string | null, database: () => D1Database) {
 if (!owner) return response({ error: 'Please sign in to manage your goals.' }, 401);
 const origin = request.headers.get('origin');
 if (origin && origin !== new URL(request.url).origin) return response({ error: 'Invalid request origin.' }, 403);
 let input: Record<string, unknown>;
 try { input = await request.json(); if (!input || Array.isArray(input) || typeof input !== 'object') throw new Error(); }
 catch { return response({ error: 'Invalid goal request.' }, 400); }
 try { const db = database(); await writeGoal(db, owner, input); return input.response_mode==='ack'?response({saved:true,id:input.id,action:input.action}):response(await readGoals(db, owner)); }
 catch (e) { if (e instanceof GoalInputError) return response({ error: e.message }, 409); logFailure('Save goal failed',e); return response({ error: 'Could not confirm the change. Your input is kept here. Close this form and refresh goals before retrying.' }, 503); }
}
