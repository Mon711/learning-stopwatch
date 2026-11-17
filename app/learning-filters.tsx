import { SelectItem } from '@/components/ui/select';
import AppSelect from './app-select';
import { useEffect,useId,useState } from 'react';
import { SlidersHorizontal,X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { activityTypes,type Activity } from '@/lib/stopwatch';
import type { LearningArea } from '@/lib/learning-areas';
import { activityKey,emptyFilters,matchesActivity,type LearningFilters } from '@/lib/learning-filters';

export default function LearningFilterControls({areas,activities,value,onChange}:{areas:LearningArea[];activities:Activity[];value:LearningFilters;onChange:(value:LearningFilters)=>void}){
 const [open,setOpen]=useState(false),[notice,setNotice]=useState(''),id=useId();
 const available=activities.filter(a=>matchesActivity(a,{...value,activityId:''}));
 const count=Object.values(value).filter(Boolean).length;
 useEffect(()=>{
  const next={...value};
  if(next.areaId&&!areas.some(a=>a.id===next.areaId))next.areaId='';
  if(next.activityId&&!activities.some(a=>activityKey(a)===next.activityId))next.activityId='';
  if(next.areaId!==value.areaId||next.activityId!==value.activityId){onChange(next);setNotice('A removed filter was cleared. Your saved history is preserved.');}
 },[areas,activities,value,onChange]);
 function change(key:keyof LearningFilters,selected:string){const next={...value,[key]:selected};if(key!=='activityId'&&next.activityId&&!activities.some(a=>matchesActivity(a,next))){next.activityId='';setNotice('Activity filter cleared because it does not match the selected area and type.');}else setNotice('');onChange(next);}
 const labels={areaId:areas.find(a=>a.id===value.areaId)?.name,type:value.type,activityId:activities.find(a=>activityKey(a)===value.activityId)?.name};
 return <div className="learning-filter-controls"><Button variant="outline" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(!open)}><SlidersHorizontal size={15}/>Filters{count?` · ${count}`:''}</Button>
 {open&&<div id={id} className="learning-filter-panel"><div className="learning-filter-fields">
 <label>Learning Area<AppSelect className="report-select" value={value.areaId} onValueChange={value=>change('areaId',value)}><SelectItem value="__empty__">All areas</SelectItem>{areas.filter(a=>!a.system||activities.some(x=>x.areaId===a.id)).map(a=><SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</AppSelect></label>
 <label>Activity Type<AppSelect className="report-select" value={value.type} onValueChange={value=>change('type',value)}><SelectItem value="__empty__">All types</SelectItem>{activityTypes.map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</AppSelect></label>
 <label>Activity<AppSelect className="report-select" value={value.activityId} onValueChange={value=>change('activityId',value)}><SelectItem value="__empty__">All matching activities</SelectItem>{available.map(a=><SelectItem key={activityKey(a)} value={activityKey(a)}>{a.name}{a.status&&a.status!=='active'?` (${a.status})`:''}</SelectItem>)}</AppSelect></label>
 </div><div className="learning-filter-footer"><p>All selected filters apply together.<br/>Archived and retained deleted history are included.</p><Button variant="ghost" onClick={()=>setOpen(false)}>Hide filters</Button></div></div>}
 {count>0&&<div className="learning-filter-chips" aria-label="Active filters">{(Object.keys(value) as (keyof LearningFilters)[]).filter(k=>value[k]).map(key=><Button key={key} variant="outline" className="filter-chip" aria-label={`Remove ${key==='areaId'?'Learning Area':key==='activityId'?'Activity':'Activity Type'} filter: ${labels[key]}`} onClick={()=>change(key,'')}>{labels[key]}<X size={12}/></Button>)}<Button variant="ghost" onClick={()=>{onChange({...emptyFilters});setNotice('Filters cleared. Showing all saved history.');}}>Clear all</Button></div>}
 {notice&&<p className="filter-notice" role="status">{notice}</p>}</div>;
}
