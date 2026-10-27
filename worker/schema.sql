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

-- Adresses de serveur `<nom>.aloriamc.fr` (SRV vers le tunnel du serveur ; voir src/addresses.ts)
CREATE TABLE IF NOT EXISTS addresses (
  name TEXT PRIMARY KEY,
  uuid TEXT NOT NULL,
  -- Relais du tunnel (machine *.ply.gg…) et port ; NULL tant que le serveur n'a pas démarré
  target TEXT,
  port INTEGER,
  -- Enregistrement SRV chez Cloudflare
  record_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS addresses_uuid ON addresses (uuid);
