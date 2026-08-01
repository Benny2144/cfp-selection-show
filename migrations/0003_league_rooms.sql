PRAGMA foreign_keys = ON;

CREATE TABLE league_rooms (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  season TEXT NOT NULL,
  workspace_json TEXT NOT NULL,
  workspace_version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by_user_id TEXT,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX league_rooms_owner_idx ON league_rooms(owner_user_id, updated_at DESC);
CREATE INDEX league_rooms_code_idx ON league_rooms(code);

CREATE TABLE league_members (
  league_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  joined_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  PRIMARY KEY (league_id, user_id),
  FOREIGN KEY (league_id) REFERENCES league_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX league_members_user_idx ON league_members(user_id, last_seen_at DESC);

CREATE TABLE league_activity (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  actor_user_id TEXT,
  event_type TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (league_id) REFERENCES league_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX league_activity_room_idx ON league_activity(league_id, created_at DESC);
