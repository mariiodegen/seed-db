-- Fixture 5: cycle_strict
-- Proves detection of strict circular dependencies (all FKs are NOT NULL).
-- Neither table can be inserted first without violating constraints.
-- seed-db must halt cleanly with E_CIRCULAR_DEPENDENCY (exit code 3) and print actionable fix SQL.

CREATE TABLE team_strict (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  captain_id INT NOT NULL
);

CREATE TABLE player_strict (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  team_id INT NOT NULL REFERENCES team_strict(id) ON DELETE CASCADE
);

ALTER TABLE team_strict
  ADD CONSTRAINT fk_strict_captain
  FOREIGN KEY (captain_id)
  REFERENCES player_strict(id)
  ON DELETE CASCADE;
