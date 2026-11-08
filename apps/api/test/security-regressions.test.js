// Regression tests for the nine CodeQL code-scanning findings that were fixed in
// apps/api. Each test exercises the code that changed rather than the scanner:
// the helper below is the fix, and a regression here is what would put the alert
// back. The tests that need the database live with the feature suites; these run
// without one (`node --test test/security-regressions.test.js`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { readFileIfPresent, sanitizeLogText, stripTrailingSlashes } from '../src/util.js';
import { readBoundedOutput } from '../src/compiler.js';
import { isGzipArchive, storeSource } from '../src/sources.js';
import { makeRouteLimiter } from '../src/http-rate-limit.js';
import { hashToken } from '../src/auth.js';
import { accountAuthority } from '../src/routes/users.js';
import { getKind } from '../src/drivers/registry.js';
// Registering the kinds is a side effect of importing the driver table; without
// it getKind() has nothing to look up.
import '../src/drivers/index.js';

function tempDir(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'triflare-security-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('js/polynomial-redos: a long run of trailing slashes normalises in linear time', () => {
  assert.equal(
    stripTrailingSlashes('https://registry.example.com/'),
    'https://registry.example.com',
  );
  assert.equal(
    stripTrailingSlashes('https://registry.example.com///'),
    'https://registry.example.com',
  );
  assert.equal(stripTrailingSlashes('no-trailing-slash'), 'no-trailing-slash');
  assert.equal(stripTrailingSlashes('///'), '');

  // The old /\/+$/ pattern backtracked over a run this long; this measures the
  // replacement so a reintroduced regex fails the test instead of a request.
  const started = Date.now();
  const stripped = stripTrailingSlashes('https://registry.example.com' + '/'.repeat(200_000));
  const elapsed = Date.now() - started;
  assert.equal(stripped, 'https://registry.example.com');
  assert.ok(elapsed < 1000, `stripping 200k slashes took ${elapsed}ms`);
});

test('js/log-injection: a control character in a logged value cannot start a new line', () => {
  assert.equal(sanitizeLogText('plain'), 'plain');
  assert.equal(sanitizeLogText('ns\nforged line'), 'ns forged line');
  assert.equal(sanitizeLogText('a\r\nb\tc\u0000d'), 'a b c d');
  assert.equal(sanitizeLogText('x\u2028y\u2029z'), 'x y z');
});

test('js/file-system-race (compiler): output is capped and read through one descriptor', async (t) => {
  const dir = tempDir(t);
  const text = 'export const answer = 42;\n';
  const small = path.join(dir, 'small.js');
  writeFileSync(small, text);

  const read = await readBoundedOutput(small, 1024);
  assert.equal(read.ok, true);
  assert.equal(read.size, Buffer.byteLength(text));
  assert.equal(read.buffer.toString('utf8'), text);

  const large = path.join(dir, 'large.js');
  writeFileSync(large, 'x'.repeat(4096));
  const capped = await readBoundedOutput(large, 1024);
  assert.equal(capped.ok, false);
  assert.equal(capped.reason, 'too-large');
  assert.equal(capped.size, 4096);

  const directory = path.join(dir, 'directory');
  mkdirSync(directory);
  const notFile = await readBoundedOutput(directory, 1024);
  assert.equal(notFile.ok, false);
  assert.equal(notFile.reason, 'not-a-file');
});

test('compiler output that grows after stat is read only up to the cap plus one', async (t) => {
  const file = path.join(tempDir(t), 'growing.js');
  writeFileSync(file, 'x');
  const handle = await open(file, 'r');
  const prototype = Object.getPrototypeOf(handle);
  const stat = prototype.stat;
  await handle.close();
  t.mock.method(prototype, 'stat', async function (...args) {
    const info = await stat.apply(this, args);
    writeFileSync(file, 'x'.repeat(4096));
    return info;
  });

  const capped = await readBoundedOutput(file, 1024);
  assert.deepEqual(capped, { ok: false, reason: 'too-large', size: 1025 });
});

test('js/file-system-race (onboarding): a missing config is null, not an exception', (t) => {
  const dir = tempDir(t);
  const file = path.join(dir, 'config.yaml');
  assert.equal(readFileIfPresent(file), null);
  writeFileSync(file, 'port: 3000\n');
  assert.equal(readFileIfPresent(file).toString('utf8'), 'port: 3000\n');
});

test('js/http-to-file-access: only a gzip archive reaches the source store', async (t) => {
  const gzip = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00]);
  assert.equal(isGzipArchive(gzip), true);
  assert.equal(isGzipArchive(Buffer.from('not a gzip stream')), false);
  assert.equal(isGzipArchive(Buffer.alloc(0)), false);
  assert.equal(isGzipArchive('1f8b'), false);

  const dir = tempDir(t);
  await assert.rejects(() => storeSource(dir, Buffer.from('plain bytes')), /gzip/);
  const stored = await storeSource(dir, gzip);
  assert.match(stored.digest, /^[0-9a-f]{64}$/);
  assert.equal(stored.size, gzip.length);
  assert.ok(existsSync(path.join(dir, stored.path)), 'the archive lands at its content address');
});

test('js/remote-property-injection: a driver kind can only name a registered slot', () => {
  assert.equal(getKind('storage')?.id, 'storage');
  for (const name of ['__proto__', 'constructor', 'prototype', 'toString', '']) {
    assert.equal(getKind(name), null, `${JSON.stringify(name)} is not a kind`);
  }
});

test('js/clear-text-storage: the flow binding is stored as a digest, not the secret', () => {
  const binding = 'a-flow-binding-value';
  const digest = hashToken(binding);
  assert.notEqual(digest, binding);
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.equal(hashToken(binding), digest, 'hashing is deterministic');
});

test('js/user-controlled-bypass: authority comes from the session and target, not the body', () => {
  const session = { user: { Id: 7, Namespace: 'ns', Role: 'normal' }, scopes: [] };
  assert.deepEqual(accountAuthority(session, { Id: 7 }), {
    admin: false,
    self: true,
    allowed: true,
  });
  assert.deepEqual(accountAuthority(session, { Id: 8 }), {
    admin: false,
    self: false,
    allowed: false,
  });
});

test('js/missing-rate-limiting: a route limiter rejects past its cap', async () => {
  const app = express();
  app.post('/setup', makeRouteLimiter({ limit: 2, windowMs: 60_000 }), (req, res) => {
    res.json({ ok: true });
  });
  app.use((error, req, res, _next) => {
    res.status(error.status ?? 500).json({ title: error.title ?? null });
  });

  const first = await request(app).post('/setup');
  const second = await request(app).post('/setup');
  const third = await request(app).post('/setup');
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(third.status, 429, 'the third request is over the cap of two');
});
