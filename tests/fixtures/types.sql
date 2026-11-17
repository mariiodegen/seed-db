-- Fixture 8: types
-- Proves type mapping for complex PostgreSQL native data types.
-- Tests: arrays, jsonb, uuid, inet, bytea, timestamptz, date, and boolean.

CREATE TABLE special_types (
  id SERIAL PRIMARY KEY,
  tags TEXT[] NOT NULL,
  metadata JSONB NOT NULL,
  tracking_id UUID NOT NULL,
  ip_address INET NOT NULL,
  payload BYTEA NOT NULL,
  is_active BOOLEAN NOT NULL,
  event_date DATE NOT NULL,
  event_timestamp TIMESTAMPTZ NOT NULL
);
