CREATE TABLE learning_areas (
 owner text NOT NULL, id text NOT NULL, name text NOT NULL, name_key text NOT NULL,
 revision integer NOT NULL DEFAULT 0, system integer NOT NULL DEFAULT 0, created_at integer NOT NULL,
 PRIMARY KEY (owner,id)
);
CREATE UNIQUE INDEX idx_areas_owner_name ON learning_areas(owner,name_key);
--> statement-breakpoint
ALTER TABLE courses ADD area_id text;
--> statement-breakpoint
ALTER TABLE courses ADD revision integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE sessions ADD activity_id text;
--> statement-breakpoint
CREATE INDEX idx_sessions_owner_activity_id ON sessions(owner,activity_id);
--> statement-breakpoint
CREATE INDEX idx_courses_owner_area ON courses(owner,area_id);
--> statement-breakpoint
