-- UPSC Revision Vault schema

CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS microthemes (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tag TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  microtheme_id TEXT NOT NULL REFERENCES microthemes(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS summary_lines (
  id TEXT PRIMARY KEY,
  microtheme_id TEXT NOT NULL REFERENCES microthemes(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  microtheme_id TEXT NOT NULL REFERENCES microthemes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tag TEXT DEFAULT '',
  photo_url TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS people_bullets (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sections (
  id TEXT PRIMARY KEY,
  microtheme_id TEXT NOT NULL REFERENCES microthemes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  starred INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  indent INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pyqs (
  id TEXT PRIMARY KEY,
  microtheme_id TEXT NOT NULL REFERENCES microthemes(id) ON DELETE CASCADE,
  year INTEGER,
  marks INTEGER,
  question TEXT,
  aspect TEXT
);

CREATE TABLE IF NOT EXISTS aspects (
  id TEXT PRIMARY KEY,
  microtheme_id TEXT NOT NULL REFERENCES microthemes(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  memorised INTEGER DEFAULT 0,
  content TEXT DEFAULT '',
  last_recall TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS revisions (
  id TEXT PRIMARY KEY,
  microtheme_id TEXT NOT NULL REFERENCES microthemes(id) ON DELETE CASCADE,
  date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS time_log (
  id TEXT PRIMARY KEY,
  microtheme_id TEXT NOT NULL REFERENCES microthemes(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  minutes INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  microtheme_id TEXT NOT NULL REFERENCES microthemes(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS dashboard_notes (
  id TEXT PRIMARY KEY,
  content TEXT DEFAULT '',
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_microthemes_subject ON microthemes(subject_id);
CREATE INDEX IF NOT EXISTS idx_sections_mt ON sections(microtheme_id);
CREATE INDEX IF NOT EXISTS idx_items_section ON items(section_id);
CREATE INDEX IF NOT EXISTS idx_timelog_mt_date ON time_log(microtheme_id, date);
