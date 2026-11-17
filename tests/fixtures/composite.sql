-- Fixture 6: composite
-- Proves composite primary keys and composite foreign keys remain relationally consistent.
-- tenant_users has a 2-column composite primary key: (tenant_id, user_id).
-- tenant_documents has a 2-column composite foreign key pointing to tenant_users.
-- seed-db samples composite keys as an atomic tuple, guaranteeing referential integrity.

CREATE TABLE tenants (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE tenant_users (
  tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL,
  PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE tenant_documents (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL,
  author_user_id INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  FOREIGN KEY (tenant_id, author_user_id) REFERENCES tenant_users(tenant_id, user_id) ON DELETE CASCADE
);
