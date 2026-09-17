CREATE TABLE users (
  id uuid PRIMARY KEY,
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE invitations (
  code_hash text PRIMARY KEY,
  trial_consultations integer NOT NULL CHECK (trial_consultations BETWEEN 0 AND 20),
  follow_ups integer NOT NULL CHECK (follow_ups BETWEEN 0 AND 20),
  expires_at timestamptz NOT NULL,
  claimed_by uuid UNIQUE REFERENCES users(id),
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE trial_accounts (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  available integer NOT NULL CHECK (available >= 0),
  follow_ups_per_consultation integer NOT NULL CHECK (follow_ups_per_consultation >= 0)
);
CREATE TABLE consultations (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id),
  request_key text NOT NULL,
  request_hash text NOT NULL,
  question text NOT NULL,
  topic text NOT NULL,
  background jsonb NOT NULL,
  time_window text,
  timezone text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','chart_ready')),
  chart jsonb,
  cast_request_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id, request_key)
);
CREATE INDEX consultations_owner ON consultations(owner_id, created_at DESC);
CREATE TABLE trial_reservations (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id),
  consultation_id uuid NOT NULL REFERENCES consultations(id),
  request_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('reserved','settled','released')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id, request_key)
);
CREATE UNIQUE INDEX trial_one_live_reservation ON trial_reservations(consultation_id)
  WHERE status IN ('reserved','settled');
CREATE TABLE entitlement_ledger (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id),
  reservation_id uuid REFERENCES trial_reservations(id),
  kind text NOT NULL CHECK (kind IN ('grant','reserve','settle','release')),
  delta integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(reservation_id, kind)
);
