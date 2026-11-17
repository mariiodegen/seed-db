-- Fixture 7: uniques
-- Proves unique constraint handling and collision resolution.
-- Single-column unique constraints and multi-column composite unique constraints.
-- seed-db tracks generated values in memory and invokes its retry loop to prevent collisions.

CREATE TABLE members (
  id SERIAL PRIMARY KEY,
  username VARCHAR(60) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  membership_code VARCHAR(30) UNIQUE NOT NULL,
  dept_code VARCHAR(10) NOT NULL,
  member_number INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_dept_member UNIQUE (dept_code, member_number)
);
