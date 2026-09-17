ALTER TABLE consultations ADD COLUMN framing jsonb;
CREATE TABLE ai_runs (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id),
  consultation_id uuid NOT NULL REFERENCES consultations(id),
  request_key text NOT NULL,
  request_hash text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('framing','initial','follow_up')),
  question text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','succeeded','failed')),
  partial_text text NOT NULL DEFAULT '',
  result jsonb,
  error_message text,
  reservation_id uuid REFERENCES trial_reservations(id),
  model text NOT NULL,
  skill_hash text NOT NULL,
  usage jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  deadline timestamptz,
  UNIQUE(owner_id,request_key)
);
CREATE UNIQUE INDEX ai_one_active ON ai_runs(consultation_id) WHERE status IN ('queued','running');
CREATE UNIQUE INDEX ai_one_initial ON ai_runs(consultation_id) WHERE kind='initial' AND status='succeeded';
CREATE INDEX ai_owner_day ON ai_runs(owner_id,created_at);
CREATE TABLE ai_daily_budget (
  day date PRIMARY KEY,
  reserved_tokens bigint NOT NULL DEFAULT 0 CHECK(reserved_tokens >= 0)
);
