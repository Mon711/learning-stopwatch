export const activityTypes = ['Course', 'Skill Practice', 'Project'] as const;
export type ActivityType = typeof activityTypes[number];
export type Activity={id?:string;name:string;short:string;description:string;link:string;type:ActivityType;status?:'active'|'archived'|'deleted';recordId?:string;areaId?:string;areaName?:string;revision?:number};
export const activities:Activity[] = [
 {id:'00000000-0000-4000-8000-000000000001',type:'Course',name:'Scrimba Full Stack',short:'Scrimba',description:'Full Stack Developer Path',link:'https://scrimba.com/fullstack-path-c0fullstack'},
 {id:'00000000-0000-4000-8000-000000000002',type:'Course',name:'Ed Donner AI Engineering',short:'Ed Donner',description:'AI / LLM Engineering',link:'https://www.udemy.com/course/llm-engineering-master-ai-and-large-language-models/'},
 {id:'00000000-0000-4000-8000-000000000003',type:'Course',name:'Exercism JavaScript',short:'Exercism',description:'JavaScript Track',link:'https://exercism.org/tracks/javascript'},
];
export type Session={id:string;activity:string;activity_id?:string|null;state:'running'|'paused'|'stopped';started_at:number;stopped_at:number|null;day:string;elapsed_ms:number;resumed_at:number|null;version:number;what:string};
export function indiaDay(ms:number) {return new Date(ms+19800000).toISOString().slice(0,10);}
export function indiaTimestamp(ms:number) {return new Date(ms+19800000).toISOString().slice(0,16);}
export function manualRange(start:unknown,end:unknown,now=Date.now()) {
 const parse=(value:unknown)=>{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw new Error('Enter a start and end date and time.');
  const ms=Date.parse(value+'+05:30');
  if(!Number.isFinite(ms)||indiaTimestamp(ms)!==value)throw new Error('Enter valid dates and times.');
  return ms;
 };
 const startedAt=parse(start),stoppedAt=parse(end);
 if(stoppedAt<=startedAt)throw new Error('End time must be after start time. Choose the next date for an overnight session.');
 if(stoppedAt>now)throw new Error('A learning session cannot end in the future.');
 if(stoppedAt-startedAt>100000*60000)throw new Error('That time range is too long. Please check the dates.');
 return {startedAt,stoppedAt,elapsedMs:stoppedAt-startedAt,day:indiaDay(startedAt)};
}
export function elapsed(s:Session|null,now:number) {return s?s.elapsed_ms+(s.state==='running'&&s.resumed_at!==null?Math.max(0,now-s.resumed_at):0):0;}
export function clock(ms:number) {const sec=Math.floor(ms/1000);return [Math.floor(sec/3600),Math.floor(sec/60)%60,sec%60].map(n=>String(n).padStart(2,'0')).join(':');}
export function duration(ms:number) {const s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor(s/60)%60;return h?`${h}h ${m}m`:m?`${m}m ${s%60}s`:`${s}s`;}
export function dailyTotals(sessions:Session[]) {const days:Record<string,{sessions:Session[];total:number;activities:Record<string,number>}>={};for(const s of sessions){if(s.state!=='stopped')continue;const d=days[s.day]??={sessions:[],total:0,activities:Object.create(null)};d.sessions.push(s);d.total+=s.elapsed_ms;d.activities[s.activity]=(d.activities[s.activity]??0)+s.elapsed_ms;}return Object.entries(days).sort((a,b)=>b[0].localeCompare(a[0]));}
const safeCell=(v:string)=>/^[=+@\-\t\r]/.test(v)?`'${v}`:v;
export function csv(sessions:Session[], knownActivities:Activity[]=activities) {const rows=[['Date','Learning Activity','Duration (minutes)','Activity Type','What I Did','Optional Notes'],...sessions.filter(s=>s.state==='stopped').slice().reverse().map(s=>[s.day,s.activity,(s.elapsed_ms/60000).toFixed(4),knownActivities.find(a=>a.name===s.activity)?.type??'Course',s.what,`Stopwatch session ${s.id}`])];return '\uFEFF'+rows.map(r=>r.map(c=>'"'+safeCell(c).replaceAll('"','""')+'"').join(',')).join('\r\n');}
