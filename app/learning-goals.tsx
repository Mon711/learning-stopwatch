'use client';
import { boundedFetch as fetch } from '@/lib/browser-request';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Pencil, Trash2, RotateCw, ChevronRight, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { SelectItem } from '@/components/ui/select';
import AppSelect from './app-select';
import { duration, type Activity } from '@/lib/stopwatch';
import type { LearningArea } from '@/lib/learning-areas';
import { goalInput, goalPeriod, goalPresets, presetDates, scopeDescription, targetDuration, type GoalResult, type GoalScope } from '@/lib/goals';

type Snapshot = { goals: GoalResult[]; activities: Activity[]; areas: LearningArea[]; now: number; error?: string };
const date = (day: string) => new Date(day + 'T12:00:00+05:30').toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
const timestamp = (ms: number) => new Date(ms).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
function restoreFocus(target: HTMLElement | null) {
 (target?.isConnected && target.getClientRects().length ? target : document.getElementById('goals-title'))?.focus();
}

function LearningGoals({ savedRevision, pending, readOnly, today, visible }: { savedRevision: number; pending: boolean; readOnly: boolean; today: string; visible: boolean }) {
 const [data, setData] = useState<Snapshot | null>(null), [error, setError] = useState(''), [refreshing, setRefreshing] = useState(false), [message, setMessage] = useState('');
 const [open, setOpen] = useState(false), [editing, setEditing] = useState<GoalResult | null>(null), [deleting, setDeleting] = useState<GoalResult | null>(null);
 const [name, setName] = useState(''), [startDay, setStartDay] = useState(today), [endDay, setEndDay] = useState(today), [hours, setHours] = useState(''), [minutes, setMinutes] = useState('');
 const [scopeKind, setScopeKind] = useState<GoalScope['kind']>('all'), [areaIds, setAreaIds] = useState<string[]>([]), [activityId, setActivityId] = useState(''), [preset, setPreset] = useState('Custom');
 const [busy, setBusy] = useState(false), [formError, setFormError] = useState(''), [deleteError, setDeleteError] = useState('');
 const request = useRef<AbortController | null>(null), busyRef = useRef(false), goalId = useRef(''), focus = useRef<HTMLElement | null>(null), deleteFocus = useRef<HTMLElement | null>(null);
 const refresh = useCallback(async () => {
  if (busyRef.current||(request.current&&!request.current.signal.aborted)) return;
  request.current?.abort(); const controller = new AbortController(); request.current = controller; setRefreshing(true);
  try {
   const response = await fetch('/api/goals', { cache: 'no-store', signal: controller.signal }), next = await response.json() as Snapshot;
   if (!response.ok) throw new Error(next.error || 'Could not load goals. Please retry.');
   if (!controller.signal.aborted) { setData(next); setError(''); }
  } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Could not load goals. Please retry.'); }
  finally { if (request.current === controller && !controller.signal.aborted) setRefreshing(false);if(request.current===controller)request.current=null; }
 }, []);
 // A session save can arrive while a goal write temporarily blocks refreshes.
 useEffect(() => { if(!visible)return;void refresh(); return () => request.current?.abort(); }, [visible,savedRevision,busy,refresh]);
 useEffect(() => {
  if (!visible) return;
  const onFocus = () => void refresh(), onVisibility = () => { if (document.visibilityState === 'visible') void refresh(); };
  window.addEventListener('focus', onFocus); document.addEventListener('visibilitychange', onVisibility);
  const interval = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 60000);
  return () => { clearInterval(interval); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVisibility); };
 }, [visible, refresh]);
 function openForm(button: HTMLElement, goal?: GoalResult) {
  focus.current = button; goalId.current = goal?.id ?? crypto.randomUUID(); setEditing(goal ?? null); setName(goal?.name ?? '');
  const dates = goal ?? presetDates('This Week', Date.parse(today + 'T12:00:00+05:30'))!;
  setStartDay(dates.startDay); setEndDay(dates.endDay); setPreset(goal ? 'Custom' : 'This Week');
  setHours(goal ? String(Math.floor(goal.targetMs / 3600000)) : ''); setMinutes(goal ? String(goal.targetMs / 60000 % 60) : '');
  setScopeKind(goal?.scope.kind ?? 'all'); setAreaIds(goal?.scope.kind === 'areas' ? goal.scope.areaIds : []); setActivityId(goal?.scope.kind === 'activity' ? goal.scope.activityId : ''); setFormError(''); setOpen(true);
 }
 async function mutate(input: Record<string, unknown>) {
  if (readOnly || busyRef.current) throw new Error('A goal change is already saving or these records are read-only.');
  busyRef.current = true; setBusy(true); request.current?.abort(); setRefreshing(false);
  try {
   const response = await fetch('/api/goals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({...input,response_mode:'ack'}) }), next = await response.json() as Snapshot;
   if (!response.ok) throw new Error(next.error || 'Could not save. Your input is kept here.');
   if(!(next as Snapshot&{saved?:boolean}).saved)setData(next);setError('');
  } finally { busyRef.current = false; setBusy(false); }
 }
 async function save() {
  setFormError('');
  try {
   const scope: GoalScope = scopeKind === 'all' ? { kind: 'all' } : scopeKind === 'areas' ? { kind: 'areas', areaIds } : { kind: 'activity', activityId };
   const definition = goalInput({ name, startDay, endDay, targetMs: targetDuration(hours, minutes), scope });
   await mutate({ ...definition, id: goalId.current, action: editing ? 'edit' : 'create', revision: editing?.revision });
   setOpen(false); setMessage(editing ? 'Goal updated. Progress recalculated from saved sessions.' : 'Goal created. Saved sessions in its dates are already included.');
  } catch (e) { setFormError(e instanceof Error ? e.message : 'Could not save. Your input is kept here.'); }
 }
 async function remove() {
  if (!deleting) return; setDeleteError('');
  try { await mutate({ id: deleting.id, revision: deleting.revision, action: 'delete' }); setDeleting(null); setMessage('Goal deleted. Your learning sessions are kept.'); }
  catch (e) { setDeleteError(e instanceof Error ? e.message : 'Could not delete. Please retry.'); }
 }
 function backup() {
  if (!data) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), timeZone: 'Asia/Kolkata', resultAsOf: new Date(data.now).toISOString(), goals: data.goals }, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `Learning_Goals_${today}.json`; link.click(); URL.revokeObjectURL(url);
 }
 const ready = !!data && !error, goals = data?.goals ?? [], areas = data?.areas ?? [], activities = data?.activities ?? [];
 const current = goals.filter(g => goalPeriod(g, today) === 'current'), upcoming = goals.filter(g => goalPeriod(g, today) === 'upcoming'), past = goals.filter(g => goalPeriod(g, today) === 'past').reverse();
 function card(goal: GoalResult) {
  const percentage = goal.completedMs / goal.targetMs * 100, reached = goal.completedMs >= goal.targetMs, period = goalPeriod(goal, today);
  return <article className="goal-card" key={goal.id} aria-labelledby={`goal-${goal.id}`}>
   <div className="goal-card-heading"><h3 id={`goal-${goal.id}`}>{goal.name}</h3><span className={`goal-status ${reached ? 'goal-reached' : ''}`}>{reached ? 'Target reached' : period === 'past' ? 'Period complete' : period === 'upcoming' ? 'Upcoming' : 'In progress'}</span></div>
   <p className="goal-dates">{date(goal.startDay)} – {date(goal.endDay)}</p>
   <p className="goal-scope">{scopeDescription(goal.scope, areas, activities)}</p>
   <div className="goal-progress-label"><span><strong>{ready ? duration(goal.completedMs) : '—'}</strong> of {duration(goal.targetMs)}</span><strong>{ready ? `${Math.floor(percentage)}%` : '—'}</strong></div>
   {ready && <progress className="goal-progress" max={100} value={Math.min(100, percentage)} aria-label={`${goal.name} progress`} aria-valuetext={`${Math.floor(percentage)} percent; ${duration(goal.completedMs)} of ${duration(goal.targetMs)}`} />}
   <p className="goal-remaining">{!ready ? 'Refresh to view progress.' : reached ? goal.completedMs > goal.targetMs ? `${duration(goal.completedMs - goal.targetMs)} beyond target` : 'Your target is complete.' : `${duration(goal.targetMs - goal.completedMs)} ${period === 'past' ? 'below target · all time counts' : 'remaining'}`}</p>
   <div className="goal-card-footer"><details className="goal-history"><summary>Goal details{goal.history.length ? ` · ${goal.history.length} ${goal.history.length === 1 ? 'edit' : 'edits'}` : ''}</summary><p>Created {timestamp(goal.createdAt)} · India time</p>{!goal.history.length && <p>No goal edits.</p>}{goal.history.slice().reverse().map((entry, i) => <div key={i}><p>Edited {timestamp(entry.at)}</p><ul>{entry.changes.map(change => <li key={change.field}>{change.field}: {change.from} → {change.to}</li>)}</ul></div>)}</details>
    {!readOnly && <div className="goal-actions"><Button variant="ghost" disabled={busy || !ready} aria-label={`Edit goal ${goal.name}`} onClick={e => openForm(e.currentTarget, goal)}><Pencil size={15} />Edit</Button><Button variant="ghost" disabled={busy || !ready} aria-label={`Delete goal ${goal.name}`} onClick={e => { deleteFocus.current = e.currentTarget; setDeleting(goal); setDeleteError(''); }}><Trash2 size={15} />Delete</Button></div>}
   </div>
  </article>;
 }
 return <section className="goals-screen" aria-labelledby="goals-title">
  <div className="page-heading goals-heading"><div><h1 id="goals-title" tabIndex={-1}>Make time for learning.</h1><p>A flexible target, built around your saved learning.</p></div>{!readOnly && <Button disabled={!ready || busy} onClick={e => openForm(e.currentTarget)}><Plus size={16} />New goal</Button>}</div>
  <p className="goals-convention">Dates include both days · Asia/Kolkata · Weeks start Monday</p>
  <div className="totals-refresh"><p role="status">{refreshing ? 'Refreshing goals…' : error ? 'Refresh failed. Displayed goals may be out of date.' : data ? `Updated ${timestamp(data.now)} · India time` : 'Loading your goals…'}</p><Button variant="outline" disabled={refreshing || busy} onClick={() => void refresh()}><RotateCw size={14} />Refresh goals</Button></div>
  {error && <p className="feedback" role="alert">{error} Progress is unavailable until goals load successfully.</p>}
  {message && <p className="feedback" role="status">{message}</p>}
  {pending && <p className="totals-note" role="status">Your session is still saving. Goals count only completed sessions already saved to the database.</p>}
  {data && <><div className="totals-course-heading"><h2>Current Goals</h2><span>{current.length} {current.length === 1 ? 'goal' : 'goals'}</span></div>
   <div className="goals-grid">{current.map(card)}</div>
   {!current.length && <div className="report-empty"><h3>{goals.length ? 'No goals covering today' : 'A little direction for your learning'}</h3><p>{goals.length ? 'Your upcoming and past goals are below.' : 'Choose a date range and a time target. Your saved learning does the rest.'}</p></div>}
   <details className="goals-section"><summary><ChevronRight size={18} />Upcoming Goals <span>{upcoming.length}</span></summary><div className="goals-grid">{upcoming.map(card)}</div>{!upcoming.length && <p className="totals-note">No upcoming goals.</p>}</details>
   <details className="goals-section"><summary><ChevronRight size={18} />Past Goals <span>{past.length}</span></summary><div className="goals-grid">{past.map(card)}</div>{!past.length && <p className="totals-note">Finished date ranges will appear here automatically.</p>}</details>
   <p className="totals-note">Progress always uses saved sessions, grouped by their start date. Running and paused sessions are excluded. Past results stay linked to your records: session corrections, deletions and activity area changes update them too. Renamed areas and activities keep their identity.</p>
   <p className="totals-note">Archived and retained deleted activities count. Goal edits are recorded under Goal details; automatic changes from sessions or classifications are reflected in progress.</p>
   <Button variant="outline" disabled={!ready || refreshing || busy} onClick={backup}><Download size={14} />Back up goals</Button><p className="field-hint">Downloads goal settings, edit history and current results as JSON. Session CSV stays in History. Goal import is not included.</p>
  </>}
  <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}><DialogContent className="manual-dialog goal-dialog" onCloseAutoFocus={e => { e.preventDefault(); restoreFocus(focus.current); }} onEscapeKeyDown={e => { if (busy) e.preventDefault(); }} onPointerDownOutside={e => { if (busy) e.preventDefault(); }}>
   <DialogHeader><DialogTitle>{editing ? 'Edit learning goal' : 'New learning goal'}</DialogTitle><DialogDescription>Choose your time target and what counts. Sessions already saved within these dates are included.</DialogDescription></DialogHeader>
   <form className="manual-form goal-form" onSubmit={e => { e.preventDefault(); void save(); }}>
    <label htmlFor="goal-name">Goal name<input id="goal-name" autoFocus required maxLength={100} value={name} disabled={busy} onChange={e => setName(e.target.value)} /></label>
    <label htmlFor="goal-preset">Date preset<AppSelect id="goal-preset" className="report-select" value={preset} disabled={busy} onValueChange={value => { setPreset(value); const dates = presetDates(value, Date.parse(today + 'T12:00:00+05:30')); if (dates) { setStartDay(dates.startDay); setEndDay(dates.endDay); } }}>{goalPresets.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</AppSelect></label>
    <div className="goal-form-pair"><label htmlFor="goal-start">Start date<input id="goal-start" type="date" required min="0001-01-01" max="9999-12-31" value={startDay} disabled={busy} onChange={e => { setStartDay(e.target.value); setPreset('Custom'); }} /></label><label htmlFor="goal-end">End date<input id="goal-end" type="date" required min={startDay || '0001-01-01'} max="9999-12-31" value={endDay} disabled={busy} onChange={e => { setEndDay(e.target.value); setPreset('Custom'); }} /></label></div>
    <p className="field-hint">Both days count, using India time. Past and future dates are welcome.</p>
    <fieldset><legend>Target duration</legend><div className="goal-form-pair"><label htmlFor="goal-hours">Hours<input id="goal-hours" type="number" min="0" step="1" inputMode="numeric" placeholder="0" value={hours} disabled={busy} onChange={e => setHours(e.target.value)} /></label><label htmlFor="goal-minutes">Minutes (optional)<input id="goal-minutes" type="number" min="0" max="59" step="1" inputMode="numeric" placeholder="0" value={minutes} disabled={busy} onChange={e => setMinutes(e.target.value)} /></label></div></fieldset>
    <label htmlFor="goal-scope">Count time from<AppSelect id="goal-scope" className="report-select" value={scopeKind} disabled={busy} onValueChange={value => setScopeKind(value as GoalScope['kind'])}><SelectItem value="all">All Learning</SelectItem><SelectItem value="areas">Selected Learning Areas</SelectItem><SelectItem value="activity">Individual Activity</SelectItem></AppSelect></label>
    {scopeKind === 'areas' && <fieldset className="goal-area-options"><legend>Choose one or more Learning Areas</legend>{areas.map(area => <label key={area.id}><input type="checkbox" checked={areaIds.includes(area.id)} disabled={busy} onChange={e => setAreaIds(ids => e.target.checked ? [...ids, area.id] : ids.filter(id => id !== area.id))} /><span>{area.name}</span></label>)}</fieldset>}
    {scopeKind === 'activity' && <label htmlFor="goal-activity">Learning activity<AppSelect id="goal-activity" className="report-select" value={activityId} disabled={busy} onValueChange={setActivityId}><SelectItem value="__empty__">Choose an activity</SelectItem>{activities.map(activity => <SelectItem key={activity.id} value={activity.id!}>{activity.name}{activity.status && activity.status !== 'active' ? ` (${activity.status})` : ''}</SelectItem>)}</AppSelect><span className="field-hint">Includes archived activities and deleted activities with retained records.</span></label>}
    {editing && <p className="area-preserve">Saving updates this goal and recalculates progress. Changes to its name, dates, target or scope appear in Goal details.</p>}
    {formError && <p className="delete-error" role="alert">{formError}</p>}
    <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save goal' : 'Create goal'}</Button></DialogFooter>
   </form>
  </DialogContent></Dialog>
  <AlertDialog open={!!deleting} onOpenChange={value => { if (!value && !busy) setDeleting(null); }}><AlertDialogContent className="delete-dialog" onCloseAutoFocus={e => { e.preventDefault(); restoreFocus(deleteFocus.current); }}>
   <AlertDialogHeader><AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle><AlertDialogDescription>This permanently deletes the goal and its edit history. All your learning sessions, totals and other goals are kept.</AlertDialogDescription></AlertDialogHeader>
   {deleteError && <p className="delete-error" role="alert">{deleteError}</p>}<AlertDialogFooter><AlertDialogCancel disabled={busy}>Keep goal</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={busy} onClick={e => { e.preventDefault(); void remove(); }}>{busy ? 'Deleting…' : 'Delete goal'}</AlertDialogAction></AlertDialogFooter>
  </AlertDialogContent></AlertDialog>
 </section>;
}

export default memo(LearningGoals);
