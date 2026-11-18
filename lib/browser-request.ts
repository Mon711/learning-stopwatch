// A deadline releases controls; it does not cancel a committed database write.
export async function boundedFetch(input:RequestInfo|URL,init:RequestInit={}){
 const deadline=AbortSignal.timeout(init.method&&init.method!=='GET'?15000:10000);
 const signal=init.signal?AbortSignal.any([init.signal,deadline]):deadline;
 try{return await globalThis.fetch(input,{...init,signal});}catch(e){if(deadline.aborted)throw new Error('Request timed out. Your input is kept here; retry when connected.');throw e;}
}
