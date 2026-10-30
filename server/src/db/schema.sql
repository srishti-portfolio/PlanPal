-- PlanPal schema. Idempotent: safe to run on every deploy.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(80)  NOT NULL,
  email          VARCHAR(254) NOT NULL UNIQUE,
  password_hash  TEXT         NOT NULL,
  token_version  INTEGER      NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- One-time codes for forgot-password, change-password and change-email flows.
CREATE TABLE IF NOT EXISTS email_otps (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose      VARCHAR(32) NOT NULL CHECK (purpose IN ('reset_password', 'change_password', 'change_email')),
  code_hash    TEXT        NOT NULL,
  payload      JSONB,
  attempts     INTEGER     NOT NULL DEFAULT 0,
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_otps_lookup_idx ON email_otps (user_id, purpose, created_at DESC);

CREATE TABLE IF NOT EXISTS events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         VARCHAR(12)  NOT NULL UNIQUE,
  name         VARCHAR(120) NOT NULL,
  event_type   VARCHAR(60),
  description  TEXT,
  start_date   DATE,
  end_date     DATE,
  budget       NUMERIC(14, 2) CHECK (budget IS NULL OR budget >= 0),
  status       VARCHAR(20)  NOT NULL DEFAULT 'not_started'
               CHECK (status IN ('not_started', 'in_progress', 'finished')),
  created_by   UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT events_dates_order CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS event_members (
  event_id   UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  role       VARCHAR(10) NOT NULL CHECK (role IN ('head', 'editor', 'viewer')),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX IF NOT EXISTS event_members_user_idx ON event_members (user_id);

CREATE TABLE IF NOT EXISTS important_dates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID         NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  date        DATE         NOT NULL,
  title       VARCHAR(200) NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS important_dates_event_idx ON important_dates (event_id, date);

CREATE TABLE IF NOT EXISTS tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID         NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title         VARCHAR(160) NOT NULL,
  description   TEXT,
  start_date    DATE,
  due_date      DATE,
  status        VARCHAR(20)  NOT NULL DEFAULT 'not_started'
                CHECK (status IN ('not_started', 'in_progress', 'completed')),
  ai_generated  BOOLEAN      NOT NULL DEFAULT false,
  created_by    UUID         REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT tasks_dates_order CHECK (start_date IS NULL OR due_date IS NULL OR due_date >= start_date)
);
CREATE INDEX IF NOT EXISTS tasks_event_idx ON tasks (event_id, due_date);

CREATE TABLE IF NOT EXISTS chats (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID         NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  event_id    UUID         REFERENCES events(id) ON DELETE SET NULL,
  title       VARCHAR(120) NOT NULL DEFAULT 'New chat',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chats_user_idx ON chats (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id     UUID        NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role        VARCHAR(10) NOT NULL CHECK (role IN ('user', 'model')),
  content     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS chat_messages_chat_idx ON chat_messages (chat_id, created_at);

CREATE TABLE IF NOT EXISTS notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  event_id    UUID        REFERENCES events(id) ON DELETE SET NULL,
  content     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notes_user_idx ON notes (user_id, updated_at DESC);
