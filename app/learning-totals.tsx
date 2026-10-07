import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { duration, type Session } from '@/lib/stopwatch';
import type { learningTotals } from '@/lib/learning-totals';
type Totals = ReturnType<typeof learningTotals> & { updatedAt: number };

export default function LearningTotals({ active, pending, savedRevision }: { active: Session | null; pending: boolean; savedRevision: number }) {
 const [totals,setTotals]=useState<Totals|null>(null),[refreshing,setRefreshing]=useState(false),[error,setError]=useState('');
 const request=useRef<AbortController|null>(null);
 const refresh=useCallback(async()=>{
  request.current?.abort();const controller=new AbortController();request.current=controller;setRefreshing(true);
  try {
   const response=await fetch('/api/totals',{cache:'no-store',signal:controller.signal});
   const data=await response.json() as Totals & { error?: string };
   if(!response.ok)throw new Error(data.error||'Could not load totals. Please retry.');
   if(!controller.signal.aborted){setTotals(data as Totals);setError('');}
  } catch(e) {if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Could not load totals. Please retry.');}
  finally {if(request.current===controller&&!controller.signal.aborted)setRefreshing(false);}
 },[]);
 useEffect(()=>{void refresh();return()=>request.current?.abort();},[savedRevision,refresh]);
 const count = (n: number) => `${n} ${n === 1 ? 'session' : 'sessions'}`;
 const ready = !!totals && !error;
 return <section aria-labelledby="totals-title" className="totals-screen">
  <div className="page-heading"><h1 id="totals-title">Your learning adds up.</h1><p>All-time learning totals across your saved history.</p></div>
  <div className="overall-totals"><div><div className="section-eyebrow">ALL COURSES · ALL TIME</div><div className="overall-time">{ready ? duration(totals!.elapsedMs) : '—'}</div><p className="secondary">Saved learning time</p></div><div className="overall-count"><strong>{ready ? totals!.sessionCount : '—'}</strong><span>Completed sessions</span></div></div>
  <div className="totals-refresh"><p role="status">{refreshing?'Refreshing totals…':error?'Refresh failed.':totals?'Updated '+new Date(totals.updatedAt).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata',hour:'numeric',minute:'2-digit',second:'2-digit'})+' · India time':'Loading your learning totals…'}</p><Button variant="outline" disabled={refreshing} onClick={()=>void refresh()}><RotateCw size={14}/>Refresh totals</Button></div>
  {error && <p className="feedback" role="alert">{error} Totals are unavailable until your records load successfully.</p>}
  {pending && <p className="totals-note" role="status">Your session is still saving. These totals include only records already saved to the database.</p>}
  <div className="totals-course-heading"><h2>Time per course</h2><span>{ready ? count(totals!.sessionCount) : '—'} across all courses</span></div>
  <div className="course-totals">{(totals?.courses??[]).map(course => <article className="course-total" key={course.name}><h3>{course.name}</h3><strong>{ready ? duration(course.elapsedMs) : '—'}</strong><p>{ready ? count(course.sessionCount) : '—'}</p></article>)}</div>
  {ready && !totals!.sessionCount && <p className="totals-note">No completed sessions yet. Stop and save a stopwatch session, or add one manually, to start building your totals.</p>}
  <p className="totals-note">Completed stopwatch sessions and manually added sessions are included. Paused time is excluded. Corrections and deletions update these totals.</p>
  {active && <p className="totals-active" role="status">Your {active.activity} session is {active.state === 'running' ? 'still running' : 'paused'}. Its time will join these totals when you stop and save it. <a href="#stopwatch">Return to stopwatch →</a></p>}
 </section>;
}
