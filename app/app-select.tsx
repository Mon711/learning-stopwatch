import type { ReactNode } from 'react';
import { Select,SelectTrigger,SelectValue,SelectContent } from '@/components/ui/select';

export default function AppSelect({id,value,onValueChange,disabled,required,className='',children}:{id?:string;value:string;onValueChange:(value:string)=>void;disabled?:boolean;required?:boolean;className?:string;children:ReactNode}){
 return <Select value={value||'__empty__'} onValueChange={value=>onValueChange(value==='__empty__'?'':value)} disabled={disabled} required={required}><SelectTrigger id={id} className={`report-select ${className}`}><SelectValue/></SelectTrigger><SelectContent className="activity-options app-select-options" position="popper" align="start" sideOffset={4}>{children}</SelectContent></Select>;
}
