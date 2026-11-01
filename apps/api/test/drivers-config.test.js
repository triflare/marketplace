import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { loadConfig } from '../src/config.js';

function withConfig(t, write) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'triflare-drivers-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'config.yaml');
  fs.writeFileSync(
    file,
    YAML.stringify({ database: { url: 'postgres://u@localhost:5432/db' }, ...write }),
  );
  return file;
}

test('a mail-using method without a mail driver is refused', (t) => {
  const file = withConfig(t, {
    auth: { methods: [{ driver: 'password' }, { driver: 'magic-link' }] },
  });
  assert.throws(() => loadConfig(file), /sends mail, and mail\.drivers is none/);
});

test('the log mail driver is refused in production', (t) => {
  const file = withConfig(t, {
    environment: 'production',
    auth: { methods: [{ driver: 'password' }, { driver: 'magic-link' }] },
    mail: { drivers: [{ driver: 'log' }] },
  });
  assert.throws(() => loadConfig(file), /log mail driver is refused in production/);
});

test('an unknown driver names what is available', (t) => {
  const file = withConfig(t, { mail: { drivers: [{ driver: 'pigeon' }] } });
  assert.throws(() => loadConfig(file), /Unknown driver "pigeon"\. Available: /);
});

test('two instances sharing an id are refused', (t) => {
  const file = withConfig(t, {
    auth: {
      methods: [
        { driver: 'password', id: 'same' },
        { driver: 'passkey', id: 'same' },
      ],
    },
  });
  assert.throws(() => loadConfig(file), /share an id/);
});

test('an empty method set is refused', (t) => {
  const file = withConfig(t, { auth: { methods: [] } });
  assert.throws(() => loadConfig(file), /At least one sign-in method/);
});

test('an OIDC method without an issuer and client id is refused', (t) => {
  const file = withConfig(t, {
    auth: { methods: [{ driver: 'oidc', options: { issuer: 'https://id.example.com' } }] },
  });
  assert.throws(() => loadConfig(file), /clientId/);
});

test('the method set is projected onto the settings the routers read', (t) => {
  const file = withConfig(t, {
    auth: {
      methods: [
        {
          driver: 'oidc',
          options: {
            issuer: 'https://id.example.com',
            clientId: 'marketplace',
            clientSecret: 'shh',
          },
        },
        { driver: 'passkey', options: { rpId: 'example.com', rpName: 'Example' } },
      ],
    },
    mail: { drivers: [{ driver: 'file' }] },
  });
  const config = loadConfig(file);
  assert.equal(config.auth.passwordEnabled, false);
  assert.equal(config.auth.oidc.issuer, 'https://id.example.com');
  assert.equal(config.auth.oidc.clientId, 'marketplace');
  assert.equal(config.auth.webauthn.rpId, 'example.com');
  assert.deepEqual(
    config.driverInstances.auth.map((entry) => entry.id),
    ['oidc', 'passkey'],
  );
});

test('the old oidc settings still derive the same method set', (t) => {
  const file = withConfig(t, {
    auth: { oidc: { issuer: 'https://id.example.com', clientId: 'marketplace', required: true } },
  });
  const config = loadConfig(file);
  assert.equal(config.auth.passwordEnabled, false);
  assert.deepEqual(
    config.auth.methods.map((entry) => entry.driver),
    ['oidc', 'passkey'],
  );
});
