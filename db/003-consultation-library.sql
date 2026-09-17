ALTER TABLE consultations ADD COLUMN favorite boolean NOT NULL DEFAULT false;
ALTER TABLE consultations ADD COLUMN deleted_at timestamptz;
CREATE INDEX consultations_visible_owner ON consultations(owner_id,created_at DESC,id DESC) WHERE deleted_at IS NULL;
