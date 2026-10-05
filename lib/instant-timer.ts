import { elapsed, indiaDay, type Session } from './stopwatch';

export type TimerAction='start'|'pause'|'resume'|'stop';
export type TimerCommand={action:TimerAction;id:string;operation_id:string;version?:number;activity:string;what:string;at_ms:number};
export type TimerSnapshot={sessions:Session[];now:number};
export class TimerSaveError extends Error {
 constructor(message:string,public snapshot?:TimerSnapshot,public retryable=false){super(message);}
}
export function timerTransition(sessions:Session[],command:TimerCommand):Session[]{
 if(command.action==='start')return [{id:command.id,activity:command.activity,state:'running',started_at:command.at_ms,stopped_at:null,day:indiaDay(command.at_ms),elapsed_ms:0,resumed_at:command.at_ms,version:0,what:''},...sessions];
 return sessions.map(s=>{
  if(s.id!==command.id)return s;
  const at=Math.max(command.at_ms,s.started_at,s.resumed_at??s.started_at);
  const base={...s,version:s.version+1};
  if(command.action==='pause')return {...base,state:'paused',elapsed_ms:elapsed(s,at),resumed_at:null};
  if(command.action==='resume')return {...base,state:'running',resumed_at:at};
  return {...base,state:'stopped',elapsed_ms:elapsed(s,at),resumed_at:null,stopped_at:at,what:command.what.trim()};
 });
}

type Pending={command:TimerCommand;resolve:(value:TimerSnapshot)=>void;reject:(error:Error)=>void};
export class InstantTimer {
 private confirmed:Session[]=[];
 private pending:Pending[]=[];
 private sending=false;
 private failure:Error|null=null;
 revision=0;
 constructor(private send:(command:TimerCommand)=>Promise<TimerSnapshot>,private update:(sessions:Session[],pending:number,error:Error|null)=>void){}
 get count(){return this.pending.length;}
 get blocked(){return this.failure!==null;}
 get sessions(){return this.pending.reduce((view,p)=>timerTransition(view,p.command),this.confirmed);}
 sync(sessions:Session[]){if(this.count)return;this.confirmed=sessions;this.revision++;this.emit();}
 enqueue(action:TimerAction,activity:string,what:string,at:number,id:string,operationId:string):Promise<TimerSnapshot>{
  if(this.failure)throw new Error('Retry saving your timer before continuing.');
  const active=this.sessions.find(s=>s.state!=='stopped');
  if(action==='start'&&active)throw new Error('A session is already open.');
  if(action!=='start'&&(!active||(action==='pause'&&active.state!=='running')||(action==='resume'&&active.state!=='paused')))throw new Error('The timer state has changed.');
  const command:TimerCommand={action,id:active?.id??id,operation_id:operationId,version:active?.version,activity:active?.activity??activity,what,at_ms:at};
  const saved=new Promise<TimerSnapshot>((resolve,reject)=>this.pending.push({command,resolve,reject}));
  this.revision++;this.emit();void this.drain();return saved;
 }
 retry(){if(!this.failure)return;this.failure=null;this.revision++;this.emit();void this.drain();}
 private emit(){this.update(this.sessions,this.count,this.failure);}
 private async drain(){
  if(this.sending||this.failure)return;this.sending=true;
  try{while(this.pending.length){
   const item=this.pending[0];
   try{const data=await this.send(item.command);this.confirmed=data.sessions;this.pending.shift();this.revision++;this.emit();item.resolve(data);}
   catch(error){
    const failure=error instanceof Error?error:new Error('Your timer has not saved yet. Retry saving.');
    if(failure instanceof TimerSaveError&&!failure.retryable){
     if(failure.snapshot)this.confirmed=failure.snapshot.sessions;
     const abandoned=this.pending.splice(0);this.revision++;this.emit();for(const p of abandoned)p.reject(failure);
    }else{this.failure=failure;this.revision++;this.emit();}
    return;
   }
  }}finally{this.sending=false;}
 }
}
