import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { DEFAULTS, loadConfig } from '../src/config.js';

test('loadConfig validates the device approval page', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'triflare-config-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'config.yaml');
  const previous = process.env.TRIFLARE_DEVICE_VERIFICATION_URL;
  delete process.env.TRIFLARE_DEVICE_VERIFICATION_URL;
  t.after(() => {
    if (previous === undefined) delete process.env.TRIFLARE_DEVICE_VERIFICATION_URL;
    else process.env.TRIFLARE_DEVICE_VERIFICATION_URL = previous;
  });
  function writeConfig(verificationUrl) {
    fs.writeFileSync(
      file,
      YAML.stringify({
        database: { url: 'postgres://u@localhost:5432/db' },
        auth: { device: { verificationUrl } },
      }),
    );
  }

  for (const value of [5, {}, true, 'not a url', 'ftp://app.test/device']) {
    writeConfig(value);
    assert.throws(() => loadConfig(file), /auth\.device\.verificationUrl must be/);
  }
  for (const value of [null, undefined, '']) {
    writeConfig(value);
    assert.equal(loadConfig(file).auth.device.verificationUrl, null);
  }
  writeConfig('https://app.test/device');
  assert.equal(loadConfig(file).auth.device.verificationUrl, 'https://app.test/device');
});

test('loadConfig validates and normalizes the recent-authentication window', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'triflare-config-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'config.yaml');
  const previous = process.env.TRIFLARE_REAUTH_WINDOW_MINUTES;
  delete process.env.TRIFLARE_REAUTH_WINDOW_MINUTES;
  t.after(() => {
    if (previous === undefined) delete process.env.TRIFLARE_REAUTH_WINDOW_MINUTES;
    else process.env.TRIFLARE_REAUTH_WINDOW_MINUTES = previous;
  });
  function writeConfig(reauthWindowMinutes) {
    fs.writeFileSync(
      file,
      YAML.stringify({
        database: { url: 'postgres://u@localhost:5432/db' },
        auth: { reauthWindowMinutes },
      }),
    );
  }

  for (const value of [
    0,
    -1,
    NaN,
    Infinity,
    -Infinity,
    '',
    'bad',
    'NaN',
    'Infinity',
    true,
    false,
    [],
    [10],
    {},
  ]) {
    writeConfig(value);
    assert.throws(
      () => loadConfig(file),
      /auth\.reauthWindowMinutes must be a finite positive number/,
    );
  }
  for (const value of [10, 0.5, '15', '2.5']) {
    writeConfig(value);
    assert.equal(loadConfig(file).auth.reauthWindowMinutes, Number(value));
  }
  // Null means "not set" under the configuration merge rules.
  for (const value of [null, undefined]) {
    writeConfig(value);
    assert.equal(loadConfig(file).auth.reauthWindowMinutes, DEFAULTS.auth.reauthWindowMinutes);
  }
});

test('a registration policy that is not implemented is refused, not opened', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'triflare-config-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'config.yaml');

  for (const registration of ['invite', 'allowlist', 'nobody', true]) {
    fs.writeFileSync(
      file,
      YAML.stringify({
        database: { url: 'postgres://u@localhost:5432/db' },
        auth: { policy: { registration } },
      }),
    );
    // Refusing here is the difference between a closed registry and one that
    // quietly lets everyone in under a policy name it does not enforce.
    assert.throws(() => loadConfig(file), /auth\.policy\.registration must be "open" or "closed"/);
  }

  for (const registration of ['open', 'closed']) {
    fs.writeFileSync(
      file,
      YAML.stringify({
        database: { url: 'postgres://u@localhost:5432/db' },
        auth: { policy: { registration } },
      }),
    );
    assert.equal(loadConfig(file).auth.policy.registration, registration);
  }
});

test('the announcement banner is one line, and a link without a message is dropped', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'triflare-config-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'config.yaml');
  const previous = {
    TRIFLARE_BANNER_MESSAGE: process.env.TRIFLARE_BANNER_MESSAGE,
    TRIFLARE_BANNER_LINK: process.env.TRIFLARE_BANNER_LINK,
  };
  delete process.env.TRIFLARE_BANNER_MESSAGE;
  delete process.env.TRIFLARE_BANNER_LINK;
  t.after(() => {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  function writeConfig(banner) {
    fs.writeFileSync(
      file,
      YAML.stringify({
        database: { url: 'postgres://u@localhost:5432/db' },
        banner,
      }),
    );
  }

  // The marquee is a single line, so the whitespace a pasted paragraph brings
  // is folded here rather than left for the page to strip.
  writeConfig({ message: 'Maintenance\n\nat 02:00   UTC.', link: 'https://status.test/incidents' });
  assert.deepEqual(loadConfig(file).banner, {
    message: 'Maintenance at 02:00 UTC.',
    link: 'https://status.test/incidents',
  });

  // Nothing to attach the link to, so there is no banner and no link.
  writeConfig({ link: 'https://status.test' });
  assert.deepEqual(loadConfig(file).banner, { message: null, link: null });

  writeConfig({ message: '' });
  assert.deepEqual(loadConfig(file).banner, { message: null, link: null });

  writeConfig(undefined);
  assert.deepEqual(loadConfig(file).banner, { message: null, link: null });

  for (const banner of [
    { message: 'x'.repeat(281) },
    { message: 'Maintenance', link: 'javascript:alert(1)' },
    { message: 'Maintenance', link: 'not a url' },
    { message: 'Maintenance', link: 42 },
  ]) {
    writeConfig(banner);
    assert.throws(() => loadConfig(file), /banner\.(message|link) must be/);
  }
});

// The image carries no config.yaml and the deployment is configured through
// environment variables, so a file named by default has to land where the volume
// is -- otherwise the settings an admin saves belong to the container's own
// writable layer and vanish on the next deploy.
test('keeps the default file in the data directory when the working directory has none', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'triflare-config-'));
  const cwd = process.cwd();
  const previous = {
    TRIFLARE_DATABASE_URL: process.env.TRIFLARE_DATABASE_URL,
    TRIFLARE_DATA_DIR: process.env.TRIFLARE_DATA_DIR,
  };
  t.after(() => {
    process.chdir(cwd);
    fs.rmSync(dir, { recursive: true, force: true });
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  process.chdir(dir);
  process.env.TRIFLARE_DATABASE_URL = 'postgres://u@localhost:5432/db';
  delete process.env.TRIFLARE_DATA_DIR;

  assert.equal(loadConfig().configPath, path.join(dir, 'data', 'config.yaml'));

  // A file in the working directory, whether from the checkout or mounted
  // there, is the one the operator meant.
  fs.writeFileSync(path.join(dir, 'config.yaml'), '');
  assert.equal(loadConfig().configPath, path.join(dir, 'config.yaml'));

  // A data directory named in the environment is where the fallback goes.
  process.env.TRIFLARE_DATA_DIR = path.join(dir, 'volume');
  fs.rmSync(path.join(dir, 'config.yaml'));
  assert.equal(loadConfig().configPath, path.join(dir, 'volume', 'config.yaml'));
});
