import { indiaDay, duration, type Activity, type Session } from './stopwatch';
import { unassignedArea, type LearningArea } from './learning-areas';

export type GoalScope = { kind: 'all' } | { kind: 'areas'; areaIds: string[] } | { kind: 'activity'; activityId: string };
export type GoalDefinition = { name: string; startDay: string; endDay: string; targetMs: number; scope: GoalScope };
export type GoalChange = { at: number; changes: { field: string; from: string; to: string }[] };
export type Goal = GoalDefinition & { id: string; revision: number; createdAt: number; updatedAt: number; history: GoalChange[] };
export type GoalResult = Goal & { completedMs: number };
export class GoalInputError extends Error {}

function validDay(value: unknown): value is string {
 if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01') return false;
 const ms = Date.parse(value + 'T00:00:00Z');
 return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}
export function goalInput(input: Record<string, unknown>): GoalDefinition {
 if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 100) throw new GoalInputError('Use a goal name between 1 and 100 characters.');
 if (!validDay(input.startDay) || !validDay(input.endDay)) throw new GoalInputError('Choose valid start and end dates.');
 if (input.endDay < input.startDay) throw new GoalInputError('End date must be on or after the start date.');
 if (typeof input.targetMs !== 'number' || !Number.isSafeInteger(input.targetMs) || input.targetMs <= 0 || input.targetMs % 60000 !== 0) throw new GoalInputError('Set a positive target in whole hours and minutes.');
 const raw = input.scope as Partial<GoalScope> | null;
 let scope: GoalScope;
 if (raw?.kind === 'all') scope = { kind: 'all' };
 else if (raw?.kind === 'areas' && Array.isArray(raw.areaIds) && raw.areaIds.length && raw.areaIds.every(id => typeof id === 'string' && id.length > 0)) scope = { kind: 'areas', areaIds: [...new Set(raw.areaIds)].sort() };
 else if (raw?.kind === 'activity' && typeof raw.activityId === 'string' && raw.activityId) scope = { kind: 'activity', activityId: raw.activityId };
 else throw new GoalInputError('Choose all learning, at least one Learning Area, or one activity.');
 return { name: input.name.trim(), startDay: input.startDay, endDay: input.endDay, targetMs: input.targetMs, scope };
}
export function targetDuration(hours: string, minutes: string): number {
 if (!/^\d+$/.test(hours || '0') || !/^\d+$/.test(minutes || '0') || Number(minutes) > 59) throw new GoalInputError('Use whole hours and 0–59 minutes.');
 const ms = (Number(hours || '0') * 60 + Number(minutes || '0')) * 60000;
 if (!Number.isSafeInteger(ms) || ms <= 0) throw new GoalInputError('Set a target greater than zero.');
 return ms;
}
export function goalPeriod(goal: Pick<GoalDefinition, 'startDay' | 'endDay'>, today: string) {
 return goal.startDay > today ? 'upcoming' : goal.endDay < today ? 'past' : 'current';
}
export function goalProgress(goals: Goal[], sessions: Session[], activities: Activity[]): GoalResult[] {
 const byId = new Map(activities.flatMap(a => [[a.id, a], [a.recordId, a]] as [string | undefined, Activity][]));
 const byName = new Map(activities.map(a => [a.name, a]));
 const saved = sessions.filter(s => s.state === 'stopped').map(s => ({ session: s, activity: s.activity_id ? byId.get(s.activity_id) : byName.get(s.activity) }));
 return goals.map(goal => ({ ...goal, completedMs: saved.reduce((sum, { session, activity }) => {
  if (session.day < goal.startDay || session.day > goal.endDay) return sum;
  const scope = goal.scope;
  const matches = scope.kind === 'all' || (scope.kind === 'areas' ? scope.areaIds.includes(activity?.areaId ?? unassignedArea.id) : scope.activityId === activity?.id);
  return sum + (matches ? session.elapsed_ms : 0);
 }, 0) }));
}
export function scopeDescription(scope: GoalScope, areas: LearningArea[], activities: Activity[]) {
 if (scope.kind === 'all') return 'All learning';
 if (scope.kind === 'areas') return 'Learning areas: ' + scope.areaIds.map(id => areas.find(a => a.id === id)?.name ?? 'Unavailable area').join(' + ');
 const activity = activities.find(a => a.id === scope.activityId);
 return 'Activity: ' + (activity ? activity.name + (activity.status && activity.status !== 'active' ? ` (${activity.status})` : '') : 'Unavailable activity');
}
export function goalChanges(before: GoalDefinition, after: GoalDefinition, areas: LearningArea[], activities: Activity[]) {
 const values = (g: GoalDefinition) => ({ Name: g.name, Dates: `${g.startDay} – ${g.endDay}`, Target: duration(g.targetMs), Scope: scopeDescription(g.scope, areas, activities) });
 const from = values(before), to = values(after);
 return (Object.keys(from) as (keyof typeof from)[]).filter(key => key === 'Scope' ? JSON.stringify(before.scope) !== JSON.stringify(after.scope) : from[key] !== to[key]).map(field => ({ field, from: from[field], to: to[field] }));
}
export const goalPresets = ['This Week', 'Next Week', 'Next 7 Days', 'Next 14 Days', 'This Month', 'Next Month', 'Custom'] as const;
export function presetDates(preset: string, now: number) {
 const today = indiaDay(now), day = new Date(today + 'T00:00:00Z');
 const shift = (n: number) => { const next = new Date(day); next.setUTCDate(next.getUTCDate() + n); return next.toISOString().slice(0, 10); };
 const monday = -((day.getUTCDay() + 6) % 7);
 if (preset === 'This Week') return { startDay: shift(monday), endDay: shift(monday + 6) };
 if (preset === 'Next Week') return { startDay: shift(monday + 7), endDay: shift(monday + 13) };
 if (preset === 'Next 7 Days' || preset === 'Next 14 Days') return { startDay: today, endDay: shift(preset === 'Next 7 Days' ? 6 : 13) };
 if (preset === 'This Month' || preset === 'Next Month') {
  const start = new Date(day); start.setUTCDate(1); if (preset === 'Next Month') start.setUTCMonth(start.getUTCMonth() + 1);
  const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1); end.setUTCDate(0);
  return { startDay: start.toISOString().slice(0, 10), endDay: end.toISOString().slice(0, 10) };
 }
 return null;
}
