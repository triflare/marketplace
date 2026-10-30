import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { boot, publishProject, resetDb, signupAndAccept, uniqNs } from './helpers.mjs';

// A stand-in for clamd. It reads the INSTREAM protocol the driver speaks and
// answers with a detection for anything containing the test signature, which is
// what a real daemon does with known-bad bytes.
let server;
let port;
const scanned = [];

before(async () => {
  server = net.createServer((socket) => {
    let buffer = Buffer.alloc(0);
    let started = false;
    let content = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!started) {
        const end = buffer.indexOf(0);
        if (end === -1) return;
        assert.equal(buffer.subarray(0, end).toString(), 'zINSTREAM');
        buffer = buffer.subarray(end + 1);
        started = true;
      }
      while (buffer.length >= 4) {
        const length = buffer.readUInt32BE(0);
        if (buffer.length < 4 + length) return;
        if (length === 0) {
          buffer = buffer.subarray(4);
          scanned.push(content.toString('latin1'));
          const found = content.includes('EICAR-TEST-SIGNATURE');
          socket.write(found ? 'stream: Eicar-Test-Signature FOUND\0' : 'stream: OK\0');
          content = Buffer.alloc(0);
          continue;
        }
        content = Buffer.concat([content, buffer.subarray(4, 4 + length)]);
        buffer = buffer.subarray(4 + length);
      }
    });
    socket.on('error', () => {});
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;

  await boot({
    drivers: {
      scanner: {
        driver: 'clamav',
        options: { host: '127.0.0.1', port, timeoutMs: 5000 },
      },
    },
  });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test('a clean project is scanned and published without warnings', async () => {
  await resetDb();
  const { app } = await boot();
  const owner = await signupAndAccept(app, uniqNs());
  const published = await publishProject(app, owner.user.namespace, 'clean', owner.token, {
    code: '// nothing to see',
  });
  assert.equal(published.body.warnings, undefined);
  assert.ok(scanned.some((entry) => entry.includes('nothing to see')));
});

test('a detection becomes a warning on the version', async () => {
  await resetDb();
  const { app } = await boot();
  const owner = await signupAndAccept(app, uniqNs());
  const published = await publishProject(app, owner.user.namespace, 'infected', owner.token, {
    code: '// EICAR-TEST-SIGNATURE',
  });
  assert.equal(published.body.warnings.length, 1);
  assert.equal(published.body.warnings[0].code, 'malware');
  assert.match(published.body.warnings[0].message, /Eicar-Test-Signature/);
  assert.ok(
    published.body.warnings[0].file.endsWith('index.js') ||
      published.body.warnings[0].file.length > 0,
  );
});
