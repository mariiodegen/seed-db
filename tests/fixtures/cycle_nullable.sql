-- Fixture 4: cycle_nullable
-- Proves automatic resolution of circular foreign keys when at least one foreign key is nullable.
-- teams.captain_id points to players.id (nullable).
-- players.team_id points to teams.id (NOT NULL).
-- seed-db severs captain_id, seeds teams, seeds players, and runs an UPDATE patch pass.

CREATE TABLE teams (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  captain_id INT
);

CREATE TABLE players (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  team_id INT NOT NULL REFERENCES teams(id) ON DELETE CASCADE
);

ALTER TABLE teams
  ADD CONSTRAINT fk_teams_captain
  FOREIGN KEY (captain_id)
  REFERENCES players(id)
  ON DELETE SET NULL;
