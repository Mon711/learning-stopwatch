export const activities = [
 {name:'Scrimba Full Stack',short:'Scrimba',description:'Full Stack Developer Path',link:'https://scrimba.com/fullstack-path-c0fullstack'},
 {name:'Ed Donner AI Engineering',short:'Ed Donner',description:'AI / LLM Engineering',link:'https://www.udemy.com/course/llm-engineering-master-ai-and-large-language-models/'},
 {name:'Exercism JavaScript',short:'Exercism',description:'JavaScript Track',link:'https://exercism.org/tracks/javascript'},
];
export type Session={id:string;activity:string;state:'running'|'paused'|'stopped';started_at:number;stopped_at:number|null;day:string;elapsed_ms:number;resumed_at:number|null;version:number;what:string};
export function indiaDay(ms:number) {return new Date(ms+19800000).toISOString().slice(0,10);}
export function elapsed(s:Session|null,now:number) {return s?s.elapsed_ms+(s.state==='running'&&s.resumed_at!==null?Math.max(0,now-s.resumed_at):0):0;}
export function clock(ms:number) {const sec=Math.floor(ms/1000);return [Math.floor(sec/3600),Math.floor(sec/60)%60,sec%60].map(n=>String(n).padStart(2,'0')).join(':');}
export function duration(ms:number) {const s=Math.floor(ms/1000),h=Math.floor(s/3600),m=Math.floor(s/60)%60;return h?`${h}h ${m}m`:m?`${m}m ${s%60}s`:`${s}s`;}
export function dailyTotals(sessions:Session[]) {const days:Record<string,{sessions:Session[];total:number;activities:Record<string,number>}>={};for(const s of sessions){if(s.state!=='stopped')continue;const d=days[s.day]??={sessions:[],total:0,activities:{}};d.sessions.push(s);d.total+=s.elapsed_ms;d.activities[s.activity]=(d.activities[s.activity]??0)+s.elapsed_ms;}return Object.entries(days).sort((a,b)=>b[0].localeCompare(a[0]));}
const safeCell=(v:string)=>/^[=+@\-\t\r]/.test(v)?`'${v}`:v;
export function csv(sessions:Session[]) {const rows=[['Date','Learning Activity','Duration (minutes)','Activity Type','What I Did','Optional Notes'],...sessions.filter(s=>s.state==='stopped').slice().reverse().map(s=>[s.day,s.activity,(s.elapsed_ms/60000).toFixed(4),'',s.what,`Stopwatch session ${s.id}`])];return '\uFEFF'+rows.map(r=>r.map(c=>'"'+safeCell(c).replaceAll('"','""')+'"').join(',')).join('\r\n');}
