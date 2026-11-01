import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'prisma/config';
import YAML from 'yaml';

// Read `database.url` from the same config.yaml the server uses. This file is
// loaded by the Prisma CLI before `prisma generate` has written its client, so
// it deliberately parses the YAML itself instead of importing `src/config.js`.
// There is no user-facing DATABASE_URL: the file is the configuration. The
// variable is only the internal channel `runMigrations` uses when it spawns the
// CLI against a database other than the one in the file (the test suite's
// template and its clones).
function readDatabaseUrl() {
  const internal = process.env.DATABASE_URL?.trim();
  if (internal) return internal;

  let filename = 'config.yaml';
  try {
    const product = YAML.parse(readFileSync(path.resolve('product.yml'), 'utf8'));
    filename = product?.defaults?.configFilename ?? filename;
  } catch {
    // A checkout without product.yml keeps the conventional filename.
  }

  for (const file of [path.resolve(filename), path.resolve('data', filename)]) {
    if (!existsSync(file)) continue;
    const parsed = YAML.parse(readFileSync(file, 'utf8'));
    const url = parsed?.database?.url;
    if (typeof url === 'string' && url.trim() !== '') return url.trim();
  }

  return 'postgres://postgres:postgres@localhost:5432/triflare';
}

export default defineConfig({
  schema: './prisma/schema.prisma',
  migrations: { path: './prisma/migrations' },
  datasource: { url: readDatabaseUrl() },
});
