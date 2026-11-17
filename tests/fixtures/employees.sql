-- Fixture 3: employees
-- Proves self-referencing foreign key resolution.
-- A table that references itself (manager_id -> employees.id) must be inserted with
-- manager_id = NULL in Phase 1, then patched with valid manager IDs in Phase 2.

CREATE TABLE employees (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  title VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  manager_id INT REFERENCES employees(id) ON DELETE SET NULL
);
