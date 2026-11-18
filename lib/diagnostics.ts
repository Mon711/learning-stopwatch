export function logFailure(phase:string,error:unknown,context:{operationId?:string;action?:string;durationMs?:number}={}){
 const e=error instanceof Error?error:new Error('Unknown error');
 console.error({...context,phase,name:e.name,message:e.message,cause:e.cause instanceof Error?e.cause.message:undefined});
}
