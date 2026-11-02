// Run the API suite against a migrated template database. Each test file boots
// its own app; test/helpers.mjs clones the template for the file when the
// isolation flag is set, so the files cannot truncate each other's rows.
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { createDb, runMigrations } from '../src/db.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const TEST_DATABASE_URL =
  process.env.TRIFLARE_TEST_DATABASE_URL ??
  'postgres://postgres:postgres@localhost:5432/triflare_test';

const baseName = decodeURIComponent(new URL(TEST_DATABASE_URL).pathname.slice(1));
if (!baseName) throw new Error('TRIFLARE_TEST_DATABASE_URL must name a database.');

const adminUrl = new URL(TEST_DATABASE_URL);
adminUrl.pathname = '/postgres';

function quoteIdentifier(name) {
  return `"${name.replaceAll('"', '""')}"`;
}

async function withAdmin(callback) {
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end().catch(() => {});
  }
}

async function ensureTemplate() {
  await withAdmin(async (client) => {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      baseName,
    ]);
    if (rowCount === 0) {
      await client.query(`CREATE DATABASE ${quoteIdentifier(baseName)}`);
    }
  });

  const config = {
    database: {
      url: TEST_DATABASE_URL,
      maxConnections: 2,
      connectTimeoutSeconds: 30,
      idleTimeoutSeconds: 60,
    },
  };
  const db = createDb(config);
  try {
    await runMigrations(db, config);
  } finally {
    await db.$disconnect();
  }
}
function testFiles() {
  return readdirSync(path.join(ROOT, 'test'))
    .filter((name) => name.endsWith('.test.js'))
    .sort()
    .map((name) => path.join('test', name));
}

function runTests(runId, files) {
  return new Promise((resolve, reject) => {
    // The suite boots the app in every file and leaves its pools and timers
    // open; force-exit makes the runner end the file once its tests finish
    // instead of waiting on those handles forever.
    const child = spawn(
      process.execPath,
      ['--test', '--test-concurrency=4', '--test-force-exit', ...files],
      {
        cwd: ROOT,
        stdio: 'inherit',
        env: {
          ...process.env,
          TRIFLARE_TEST_DATABASE_URL: TEST_DATABASE_URL,
          TRIFLARE_TEST_ISOLATED: '1',
          TRIFLARE_TEST_RUN_ID: runId,
        },
      },
    );
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
}

async function dropClones(runId) {
  const prefix = `${baseName}_w${runId}_`;
  await withAdmin(async (client) => {
    const { rows } = await client.query('SELECT datname FROM pg_database');
    for (const { datname } of rows) {
      if (!datname.startsWith(prefix)) continue;
      await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(datname)} WITH (FORCE)`);
    }
  });
}

async function main() {
  const runId = String(Date.now());
  const requested = process.argv.slice(2);
  let code = 1;
  try {
    await ensureTemplate();
    code = await runTests(runId, requested.length > 0 ? requested : testFiles());
  } catch (error) {
    console.error(error.stack ?? error.message);
  } finally {
    await dropClones(runId).catch((error) => {
      console.warn(`could not remove test database clones: ${error.message}`);
    });
  }
  process.exitCode = code;
}

await main();
