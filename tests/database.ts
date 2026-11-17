import type { DatabaseSync } from 'node:sqlite';
export function d1(sqlite:DatabaseSync,onQuery:(sql:string)=>void=()=>{}){
 return {prepare(sql:string){onQuery(sql);const statement={args:[] as (string|number|null)[],bind(...args:(string|number|null)[]){this.args=args;return this;},async all(){return {results:sqlite.prepare(sql).all(...this.args)};},async first(){return sqlite.prepare(sql).get(...this.args)??null;},async run(){return {meta:{changes:sqlite.prepare(sql).run(...this.args).changes}};}};return statement;},async batch(statements:{run:()=>Promise<unknown>}[]){sqlite.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}} as unknown as D1Database;
}
