import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const directory=mkdtempSync(join(tmpdir(),'learning-stopwatch-tests-'));
const tests=['activities','instant-timer','learning-mcp','log-access','learning-areas'];
function run(args){const result=spawnSync(process.execPath,args,{stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)throw new Error(`Check failed (${result.status})`);}
try {
 run(['node_modules/typescript/bin/tsc','--noEmit','--incremental','false']);
 run(['node_modules/typescript/bin/tsc','--module','commonjs','--moduleResolution','node','--target','es2022','--outDir',directory,'--noEmit','false','--esModuleInterop','--skipLibCheck','--types','node,@cloudflare/workers-types',...tests.map(t=>`tests/${t}.test.ts`)]);
 run(['--experimental-sqlite','--test',...tests.map(t=>join(directory,'tests',`${t}.test.js`))]);
} finally {rmSync(directory,{recursive:true,force:true});}
