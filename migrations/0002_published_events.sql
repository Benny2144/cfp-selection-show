PRAGMA foreign_keys = ON;

CREATE TABLE published_events (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  league_name TEXT NOT NULL,
  season TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_viewed_at INTEGER,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX published_events_owner_idx
  ON published_events(owner_user_id, updated_at DESC);
CREATE INDEX published_events_code_idx ON published_events(code);

CREATE TABLE event_activity (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  actor_user_id TEXT,
  event_type TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (event_id) REFERENCES published_events(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX event_activity_event_idx
  ON event_activity(event_id, created_at DESC);
