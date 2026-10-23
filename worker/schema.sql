-- Base D1 « aloria-cosmetics » : npx wrangler d1 execute aloria-cosmetics --remote --file schema.sql
CREATE TABLE IF NOT EXISTS players (
  uuid TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  -- Temps de jeu compté par le Worker (battements du launcher)
  play_seconds INTEGER NOT NULL DEFAULT 0,
  last_beat INTEGER,
  -- Cosmétiques équipés (id du catalogue, ou NULL)
  cape TEXT,
  hat TEXT
);

CREATE TABLE IF NOT EXISTS owned (
  uuid TEXT NOT NULL,
  cosmetic TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (uuid, cosmetic)
);
