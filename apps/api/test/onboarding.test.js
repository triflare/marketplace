import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config.js';
import { applyOnboarding, onboardingStatus } from '../src/onboarding.js';
import { TEST_DATABASE_URL } from './helpers.mjs';

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'triflare-onboarding-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('a fresh config asks for onboarding and names the file it will write', (t) => {
  const dir = tempDir(t);
  const file = path.join(dir, 'config.yaml');
  const config = loadConfig(file);
  const status = onboardingStatus(config);

  assert.equal(status.required, true);
  assert.equal(status.editable, true, 'a missing file is writable when its directory is');
  assert.equal(status.configPath, file);
  assert.ok(status.fields.some((field) => field.key === 'database.url' && field.required));
  assert.ok(status.fields.some((field) => field.key === 'environment'));
});

test('onboarding writes the settings through the document and marks it complete', async (t) => {
  const dir = tempDir(t);
  const file = path.join(dir, 'config.yaml');
  // A comment and key order are the operator's; the write has to keep them.
  fs.writeFileSync(file, '# keep this\nport: 3000\n');
  const config = loadConfig(file);

  const { config: next, changed } = await applyOnboarding(config, {
    'database.url': TEST_DATABASE_URL,
    publicBaseUrl: 'https://registry.example.com/',
    environment: 'production',
    'auth.policy.registration': 'closed',
  });

  assert.equal(next.setupRequired, false);
  assert.equal(next.onboarding.completed, true);
  assert.equal(next.publicBaseUrl, 'https://registry.example.com');
  assert.equal(next.environment, 'production');
  assert.equal(next.auth.policy.registration, 'closed');
  assert.ok(changed.includes('database.url'));

  const written = fs.readFileSync(file, 'utf8');
  assert.match(written, /# keep this/);
  assert.match(written, /onboarding:\n\s+completed: true/);
  assert.equal(loadConfig(file).setupRequired, false);
});

test('a rejected value leaves the original file untouched', async (t) => {
  const dir = tempDir(t);
  const file = path.join(dir, 'config.yaml');
  const original = '# unchanged\nport: 3000\n';
  fs.writeFileSync(file, original);
  const config = loadConfig(file);

  await assert.rejects(
    () => applyOnboarding(config, { 'database.url': TEST_DATABASE_URL, environment: 'staging' }),
    (error) =>
      error.errors?.some(
        (entry) =>
          entry.field === 'environment' &&
          /Must be one of: production, development/.test(entry.message),
      ),
  );
  assert.equal(fs.readFileSync(file, 'utf8'), original);

  await assert.rejects(
    () => applyOnboarding(config, { 'database.url': 'not a url' }),
    (error) =>
      error.errors?.some(
        (entry) =>
          entry.field === 'database.url' &&
          /Must be a PostgreSQL connection URL/.test(entry.message),
      ),
  );
  assert.equal(fs.readFileSync(file, 'utf8'), original);
});

test('onboarding refuses a file the process cannot write', async (t) => {
  const dir = tempDir(t);
  const file = path.join(dir, 'config.yaml');
  fs.writeFileSync(file, 'port: 3000\n');
  fs.chmodSync(file, 0o400);
  t.after(() => {
    try {
      fs.chmodSync(file, 0o600);
    } catch {
      // The directory cleanup may have run first.
    }
  });
  const config = loadConfig(file);

  assert.equal(onboardingStatus(config).editable, false);
  await assert.rejects(
    () => applyOnboarding(config, { 'database.url': TEST_DATABASE_URL }),
    (error) => error.status === 409,
  );
});

test('a config path whose parent does not exist yet is still writable', async (t) => {
  const dir = tempDir(t);
  const file = path.join(dir, 'volume', 'nested', 'config.yaml');
  const config = loadConfig(file);

  assert.equal(onboardingStatus(config).editable, true);
  await applyOnboarding(config, { 'database.url': TEST_DATABASE_URL });
  assert.equal(fs.existsSync(file), true);
  assert.equal(loadConfig(file).setupRequired, false);
});
