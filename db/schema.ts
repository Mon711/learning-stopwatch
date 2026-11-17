import { sqliteTable, text, integer, index, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
export const learningGoals = sqliteTable('learning_goals', {
 owner:text('owner').notNull(),id:text('id').notNull(),name:text('name').notNull(),startDay:text('start_day').notNull(),endDay:text('end_day').notNull(),targetMs:integer('target_ms').notNull(),scope:text('scope').notNull(),revision:integer('revision').notNull().default(0),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull(),history:text('history').notNull().default('[]'),
}, t=>[primaryKey({columns:[t.owner,t.id]})]);
export const learningAreas = sqliteTable('learning_areas', {
 owner:text('owner').notNull(),id:text('id').notNull(),name:text('name').notNull(),nameKey:text('name_key').notNull(),revision:integer('revision').notNull().default(0),system:integer('system').notNull().default(0),createdAt:integer('created_at').notNull(),
}, t=>[primaryKey({columns:[t.owner,t.id]}),uniqueIndex('idx_areas_owner_name').on(t.owner,t.nameKey)]);
export const courses = sqliteTable('courses', {
 id: text('id').primaryKey(), owner: text('owner').notNull(), name: text('name').notNull(),
 nameKey: text('name_key').notNull(), link: text('link').notNull().default(''),
 createdAt: integer('created_at').notNull(),areaId:text('area_id'),revision:integer('revision').notNull().default(0),
 status: text('status', { enum: ['active', 'archived', 'deleted'] }).notNull().default('active'),
 type: text('type', { enum: ['Course', 'Skill Practice', 'Project'] }).notNull().default('Course'),
}, t => [uniqueIndex('idx_courses_owner_name').on(t.owner,t.nameKey),index('idx_courses_owner_area').on(t.owner,t.areaId)]);
export const sessions = sqliteTable('sessions', {
 id: text('id').primaryKey(), owner: text('owner').notNull(), activity: text('activity').notNull(),activityId:text('activity_id'),
 state: text('state').notNull(), startedAt: integer('started_at').notNull(), stoppedAt: integer('stopped_at'),
 day: text('day').notNull(), elapsedMs: integer('elapsed_ms').notNull().default(0),
 resumedAt: integer('resumed_at'), version: integer('version').notNull().default(0), what: text('what').notNull().default(''),
 lastOperationId: text('last_operation_id'),
}, t => [index('idx_sessions_owner_started').on(t.owner,t.startedAt),index('idx_sessions_owner_activity_id').on(t.owner,t.activityId), uniqueIndex('idx_one_open_session').on(t.owner).where(sql`${t.state} != 'stopped'`)]);
