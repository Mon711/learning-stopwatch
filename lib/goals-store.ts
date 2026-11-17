import { listActivities } from './courses';
import { ensureAreas, listAreas } from './learning-areas';
import { GoalInputError, goalInput, goalChanges, goalProgress, type Goal, type GoalScope } from './goals';
import type { Session } from './stopwatch';

type GoalRow = Omit<Goal, 'scope' | 'history'> & { scope: string; history: string };
export async function listGoals(db: D1Database, owner: string): Promise<Goal[]> {
 const rows = await db.prepare('SELECT id,name,start_day AS startDay,end_day AS endDay,target_ms AS targetMs,scope,revision,created_at AS createdAt,updated_at AS updatedAt,history FROM learning_goals WHERE owner=? ORDER BY start_day,end_day,created_at,id').bind(owner).all<GoalRow>();
 return rows.results.map(row => ({ ...row, scope: JSON.parse(row.scope), history: JSON.parse(row.history) }));
}
export async function readGoals(db: D1Database, owner: string, now = Date.now()) {
 const [goals, activities, areas] = await Promise.all([listGoals(db, owner), listActivities(db, owner), listAreas(db, owner)]);
 const sessions = goals.length ? (await db.prepare("SELECT day,activity,activity_id,state,elapsed_ms FROM sessions WHERE owner=? AND state='stopped' AND day>=? AND day<=?").bind(owner, goals.reduce((min, g) => g.startDay < min ? g.startDay : min, goals[0].startDay), goals.reduce((max, g) => g.endDay > max ? g.endDay : max, goals[0].endDay)).all<Session>()).results : [];
 return { goals: goalProgress(goals, sessions, activities), activities, areas, now };
}
// Check references again inside the write, so a concurrent area deletion cannot leave a dangling scope.
function referenceGuard(scope: GoalScope, owner: string, activities: Awaited<ReturnType<typeof listActivities>>) {
 if (scope.kind === 'all') return { sql: '1=1', args: [] as string[] };
 if (scope.kind === 'areas') return { sql: 'NOT EXISTS (SELECT 1 FROM json_each(?) selected WHERE NOT EXISTS (SELECT 1 FROM learning_areas a WHERE a.owner=? AND a.id=selected.value))', args: [JSON.stringify(scope.areaIds), owner] };
 return { sql: 'EXISTS (SELECT 1 FROM courses WHERE owner=? AND id=?)', args: [owner, activities.find(a => a.id === scope.activityId)!.recordId!] };
}
export async function writeGoal(db: D1Database, owner: string, input: Record<string, unknown>, now = Date.now()) {
 if (typeof input.id !== 'string' || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(input.id)) throw new GoalInputError('Invalid goal identifier.');
 if (!['create', 'edit', 'delete'].includes(String(input.action)) || typeof input.action !== 'string') throw new GoalInputError('Choose create, edit, or delete.');
 const definition = input.action === 'delete' ? null : goalInput(input);
 const previous = (await listGoals(db, owner)).find(g => g.id === input.id);
 if (input.action !== 'create') {
  if (!previous) throw new GoalInputError('This goal no longer exists. Refresh your goals.');
  if (!Number.isInteger(input.revision) || input.revision !== previous.revision) throw new GoalInputError('This goal changed in another tab or device. Close this form, refresh goals, and reopen it before editing.');
 }
 if (input.action === 'delete') {
  const result = await db.prepare('DELETE FROM learning_goals WHERE owner=? AND id=? AND revision=?').bind(owner, input.id, input.revision).run();
  if (!result.meta.changes) throw new GoalInputError('This goal changed. Refresh your goals before deleting it.');
  return;
 }
 await ensureAreas(db, owner);
 const [areas, activities] = await Promise.all([listAreas(db, owner), listActivities(db, owner)]);
 const goal = definition!, scope = goal.scope;
 if (scope.kind === 'areas' && scope.areaIds.some(id => !areas.some(a => a.id === id))) throw new GoalInputError('A selected Learning Area is unavailable. Refresh your goals and choose its replacement.');
 if (scope.kind === 'activity' && !activities.some(a => a.id === scope.activityId)) throw new GoalInputError('Choose an activity from your saved activities.');
 const guard = referenceGuard(scope, owner, activities);
 if (input.action === 'create') {
  if (previous) {
   if (!goalChanges(previous, goal, areas, activities).length) return;
   throw new GoalInputError('This goal was already saved. Refresh your goals before changing it.');
  }
  const result = await db.prepare(`INSERT INTO learning_goals(owner,id,name,start_day,end_day,target_ms,scope,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,? WHERE ${guard.sql} ON CONFLICT DO NOTHING`).bind(owner, input.id, goal.name, goal.startDay, goal.endDay, goal.targetMs, JSON.stringify(scope), now, now, ...guard.args).run();
  if (!result.meta.changes) throw new GoalInputError('Your scope or goal changed while saving. Refresh your goals and retry.');
 } else {
  const changes = goalChanges(previous!, goal, areas, activities);
  if (!changes.length) return;
  const result = await db.prepare(`UPDATE learning_goals SET name=?,start_day=?,end_day=?,target_ms=?,scope=?,updated_at=?,revision=revision+1,history=json_insert(history,'$[#]',json(?)) WHERE owner=? AND id=? AND revision=? AND ${guard.sql}`).bind(goal.name, goal.startDay, goal.endDay, goal.targetMs, JSON.stringify(scope), now, JSON.stringify({ at: now, changes }), owner, input.id, input.revision, ...guard.args).run();
  if (!result.meta.changes) throw new GoalInputError('This goal or its scope changed in another tab. Refresh your goals before retrying.');
 }
}
