import type { Activity, Session } from './stopwatch';

export function learningTotals(sessions: Session[], activities: Activity[]) {
 const courses = new Map(activities.map(a => [a.name, { name: a.name, type: a.type, elapsedMs: 0, sessionCount: 0 }]));
 let elapsedMs = 0, sessionCount = 0;
 for (const session of sessions) {
  if (session.state !== 'stopped') continue;
  const course = courses.get(session.activity) ?? { name: session.activity, type: 'Course' as const, elapsedMs: 0, sessionCount: 0 };
  course.elapsedMs += session.elapsed_ms;
  course.sessionCount++;
  courses.set(session.activity, course);
  elapsedMs += session.elapsed_ms;
  sessionCount++;
 }
 return { elapsedMs, sessionCount, courses: [...courses.values()] };
}
