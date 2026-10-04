import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
export const sessions = sqliteTable('sessions', {
 id: text('id').primaryKey(), owner: text('owner').notNull(), activity: text('activity').notNull(),
 state: text('state').notNull(), startedAt: integer('started_at').notNull(), stoppedAt: integer('stopped_at'),
 day: text('day').notNull(), elapsedMs: integer('elapsed_ms').notNull().default(0),
 resumedAt: integer('resumed_at'), version: integer('version').notNull().default(0), what: text('what').notNull().default(''),
}, t => [index('idx_sessions_owner_started').on(t.owner,t.startedAt), uniqueIndex('idx_one_open_session').on(t.owner).where(sql`${t.state} != 'stopped'`)]);
