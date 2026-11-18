import { logFailure } from './diagnostics';
import { AreaInputError,writeArea } from './learning-areas';
import { handleSessionRead } from './session-api';
export async function handleAreaWrite(request:Request,owner:string|null,database:()=>D1Database){
 const response=(error:string,status:number)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
 if(!owner)return response('Please sign in to manage Learning Areas.',401);
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return response('Invalid request origin.',403);
 let input:Record<string,unknown>;
 try{input=await request.json();if(!input||Array.isArray(input)||typeof input!=='object')throw new Error();}catch{return response('Invalid Learning Area request.',400);}
 try{await writeArea(database(),owner,input);return input.response_mode==='ack'?Response.json({saved:true,id:input.id},{headers:{'Cache-Control':'no-store'}}):handleSessionRead(owner,database);}
 catch(e){if(e instanceof AreaInputError)return response(e.message,409);logFailure('Learning Area save failed',e);return response('Could not confirm this change. Reload your records before retrying; your input is kept here.',503);}
}
