import type { Activity,Session } from './stopwatch';
import { unassignedArea } from './learning-areas';
export type LearningFilters={areaId:string;type:string;activityId:string};
export const emptyFilters:LearningFilters={areaId:'',type:'',activityId:''};
export const activityKey=(a:Pick<Activity,'id'|'name'>)=>a.id??a.name;
export function sessionActivity(s:Session,activities:Activity[]):Activity{
 return activities.find(a=>s.activity_id?(a.recordId===s.activity_id||a.id===s.activity_id):a.name===s.activity)??{id:s.activity_id??s.activity,name:s.activity,short:s.activity,description:'',link:'',type:'Course',status:'deleted',areaId:unassignedArea.id,areaName:'Unassigned'};
}
export function matchesActivity(a:Pick<Activity,'id'|'name'|'type'|'areaId'>,filters:LearningFilters){return (!filters.areaId||(a.areaId??unassignedArea.id)===filters.areaId)&&(!filters.type||a.type===filters.type)&&(!filters.activityId||activityKey(a)===filters.activityId);}
export function filterSessions(sessions:Session[],activities:Activity[],filters:LearningFilters){return sessions.filter(s=>matchesActivity(sessionActivity(s,activities),filters));}
