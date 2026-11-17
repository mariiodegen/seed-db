-- Fixture 9: identity
-- Proves Tier 1 of the 6-tier waterfall: GENERATED ALWAYS columns are skipped in INSERTs.
-- Tests both:
-- 1. GENERATED ALWAYS AS IDENTITY (SQL standard auto-increment)
-- 2. GENERATED ALWAYS AS (...) STORED (virtual computed columns)

CREATE TABLE generated_items (
  id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  full_name TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
  quantity INT NOT NULL,
  unit_price NUMERIC(10, 2) NOT NULL,
  total_price NUMERIC(12, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED
);
