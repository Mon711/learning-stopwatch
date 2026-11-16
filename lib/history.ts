import { dailyTotals, type Activity, type Session } from './stopwatch';

export function historyGroups(sessions:Session[],activities:Activity[]) {
 const statuses=new Map(activities.map(a=>[a.name,a.status??'active']));
 return [
  {id:'active',label:'Active'},
  {id:'inactive',label:'Archived & inactive'},
 ].map(group=>{
  const records=sessions.filter(s=>s.state==='stopped'&&((statuses.get(s.activity)??'active')==='active')===(group.id==='active'));
  return {...group,days:dailyTotals(records),count:records.length,total:records.reduce((n,s)=>n+s.elapsed_ms,0)};
 });
}
