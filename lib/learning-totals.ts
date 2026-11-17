import { unassignedArea } from './learning-areas';
import type { Activity, Session } from './stopwatch';
import { sessionActivity,activityKey } from './learning-filters';

export function learningTotals(sessions: Session[], activities: Activity[]) {
 const total=(a:Activity)=>({id:activityKey(a),name:a.name,type:a.type,status:a.status??'active',areaId:a.areaId??unassignedArea.id,areaName:a.areaName??'Unassigned',elapsedMs:0,sessionCount:0});
 const courses = new Map(activities.filter(a=>!a.status||a.status==='active').map(a => [activityKey(a),total(a)]));
 let elapsedMs = 0, sessionCount = 0;
 for (const session of sessions) {
  if (session.state !== 'stopped') continue;
  const activity=sessionActivity(session,activities),key=activityKey(activity);
  const course = courses.get(key) ?? total(activity);
  course.elapsedMs += session.elapsed_ms;
  course.sessionCount++;
  courses.set(key, course);
  elapsedMs += session.elapsed_ms;
  sessionCount++;
 }
 return { elapsedMs, sessionCount, courses: [...courses.values()] };
}
