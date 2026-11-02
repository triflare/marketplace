import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import request from 'supertest';
import { writeDriverInstances } from '../src/drivers/admin.js';
import { apiPath, bearer, boot, makeConfig, resetDb, signupAndAccept } from './helpers.mjs';

let app;
let configPath;
let token;

before(async () => {
  const base = makeConfig({
    auth: { methods: [{ driver: 'password' }, { driver: 'magic-link' }] },
    mail: {
      drivers: [
        { driver: 'file' },
        {
          id: 'relay',
          driver: 'resend',
          options: {
            apiKey: 're_secret',
            from: 'no-reply@example.com',
          },
        },
      ],
    },
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'triflare-admin-drivers-'));
  configPath = path.join(dir, 'config.yaml');
  fs.writeFileSync(
    configPath,
    YAML.stringify({
      database: { url: base.database.url },
      auth: { methods: base.auth.methods },
      mail: { drivers: base.mail.drivers },
    }),
  );
  const booted = await boot(
    { ...base, configPath },
    // The temp directory is not a mount of its own, and the check that decides
    // whether the file survives a recreate is told so rather than left to the
    // machine the suite runs on.
    { storageProbe: { mountInfo: null, container: false } },
  );
  app = booted.app;
  await resetDb();
  const account = await signupAndAccept(app, 'admin');
  token = account.token;
});

// The image carries no config.yaml, so the first driver change on a fresh
// instance is what brings the file into being.
test('a driver change creates the config file when there is none', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'triflare-admin-drivers-'));
  const target = path.join(dir, 'config.yaml');
  writeDriverInstances({ configPath: target, kind: 'storage', instances: [{ driver: 'local' }] });
  assert.deepEqual(YAML.parse(fs.readFileSync(target, 'utf8')), {
    drivers: { storage: { driver: 'local' } },
  });
});

test('GET /admin/drivers lists the instances, their options and what could run', async () => {
  const r = await request(app).get(apiPath('/admin/drivers')).set(bearer(token)).expect(200);
  assert.deepEqual(
    r.body.drivers.auth.instances.map((entry) => entry.driver),
    ['password', 'magic-link'],
  );
  assert.ok(r.body.drivers.auth.available.some((entry) => entry.driver === 'magic-password'));
  assert.ok(r.body.drivers.mail.available.some((entry) => entry.driver === 'smtp'));

  const relay = r.body.drivers.mail.instances.find((entry) => entry.id === 'relay');
  assert.deepEqual(relay.options.apiKey, { set: true });
  assert.equal(relay.options.from, 'no-reply@example.com');
});

test('a dry run reports the change without writing it', async () => {
  const before = fs.readFileSync(configPath, 'utf8');
  const r = await request(app)
    .put(apiPath('/admin/drivers/auth?dryRun=1'))
    .set(bearer(token))
    .send({
      instances: [{ driver: 'password' }, { driver: 'magic-link' }, { driver: 'magic-password' }],
    })
    .expect(200);
  assert.equal(r.body.dryRun, true);
  assert.equal(fs.readFileSync(configPath, 'utf8'), before);
});

test('a method set is written to the file and swapped in', async () => {
  const r = await request(app)
    .put(apiPath('/admin/drivers/auth'))
    .set(bearer(token))
    .send({
      instances: [{ driver: 'password' }, { driver: 'magic-link' }, { driver: 'magic-password' }],
    })
    .expect(200);
  assert.equal(r.body.kind, 'auth');
  assert.ok(['live', 'restart'].includes(r.body.applied));
  assert.ok(r.body.revision >= 1);

  const saved = YAML.parse(fs.readFileSync(configPath, 'utf8'));
  assert.deepEqual(
    saved.auth.methods.map((entry) => entry.driver),
    ['password', 'magic-link', 'magic-password'],
  );
});

test('an unknown driver is refused and the file is left alone', async () => {
  const before = fs.readFileSync(configPath, 'utf8');
  const r = await request(app)
    .put(apiPath('/admin/drivers/auth'))
    .set(bearer(token))
    .send({ instances: [{ driver: 'pigeon' }] })
    .expect(422);
  assert.match(r.body.errors[0].message, /Unknown driver/);
  assert.equal(fs.readFileSync(configPath, 'utf8'), before);
});

test('a secret submitted as its mask keeps the stored value', async () => {
  await request(app)
    .put(apiPath('/admin/drivers/mail'))
    .set(bearer(token))
    .send({
      instances: [
        { driver: 'file' },
        {
          id: 'relay',
          driver: 'resend',
          options: {
            apiKey: { set: true },
            from: 'no-reply@example.com',
          },
        },
      ],
    })
    .expect(200);
  const saved = YAML.parse(fs.readFileSync(configPath, 'utf8'));
  const relay = saved.mail.drivers.find((entry) => entry.id === 'relay');
  assert.equal(relay.options.apiKey, 're_secret');
});

test('the system endpoint describes the process and refuses what it cannot do', async () => {
  const system = await request(app).get(apiPath('/admin/system')).set(bearer(token)).expect(200);
  assert.equal(system.body.supervised, false);
  assert.equal(system.body.configPath, configPath);
  assert.ok(system.body.driversRevision.auth >= 1);

  await request(app).post(apiPath('/admin/system/reload')).set(bearer(token)).expect(409);
  await request(app)
    .post(apiPath('/admin/system/restart'))
    .set(bearer(token))
    .send({ confirm: 'restart' })
    .expect(409);
});

test('only an admin reaches the driver surface', async () => {
  await request(app).get(apiPath('/admin/drivers')).expect(401);
  const normal = await signupAndAccept(app, 'normaluser');
  await request(app).get(apiPath('/admin/drivers')).set(bearer(normal.token)).expect(403);
});
