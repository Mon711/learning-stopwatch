import {readdir,readFile,mkdir,copyFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const [previous,current]=process.argv.slice(2);
if(!previous||!current)throw new Error('Provide previous and current dist/client/_next/static directories.');
if(resolve(previous)===resolve(current))throw new Error('Asset directories must differ.');
async function copy(relative=''){
 for(const entry of await readdir(join(previous,relative),{withFileTypes:true})){
  const name=join(relative,entry.name);
  if(entry.isDirectory()){await copy(name);continue;}
  if(!entry.isFile()||entry.name.startsWith('._')||!/[.-][A-Za-z0-9_-]{8,}\.(js|css|woff2?)$/.test(entry.name))continue;
  const target=join(current,name),source=join(previous,name);
  try{const existing=await readFile(target);const old=await readFile(source);if(createHash('sha256').update(existing).digest('hex')!==createHash('sha256').update(old).digest('hex'))throw new Error('Asset collision: '+name);}
  catch(error){if(error.code!=='ENOENT')throw error;await mkdir(join(target,'..'),{recursive:true});await copyFile(source,target);}
 }
}
await copy();
console.log('Previous hashed client assets retained; current assets unchanged.');
