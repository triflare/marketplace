import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import http from 'node:http';
import request from 'supertest';
import {
  apiPath,
  bearer,
  boot,
  publishProject,
  resetDb,
  signupAndAccept,
  uniqNs,
} from './helpers.mjs';

// A stand-in for an object store. It answers the four requests the blob store
// makes and records the signature each one carried, so the tests exercise the
// real driver — signing included — rather than a stub of it.
const objects = new Map();
const requests = [];
let server;
let port;

let app;
let db;
let config;
let blobs;

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

before(async () => {
  server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const pathname = new URL(req.url, 'http://store.invalid').pathname;
      requests.push({
        method: req.method,
        pathname,
        authorization: req.headers.authorization ?? null,
        payloadHash: req.headers['x-amz-content-sha256'] ?? null,
      });

      if (!String(req.headers.authorization ?? '').startsWith('AWS4-HMAC-SHA256 ')) {
        res.writeHead(403, { 'content-type': 'text/plain' });
        return res.end('missing signature');
      }
      // The bucket itself, asked about by the probe.
      if (pathname === '/bucket/' || pathname === '/bucket') {
        res.writeHead(req.method === 'HEAD' ? 200 : 405);
        return res.end();
      }
      const present = objects.get(pathname);
      if (req.method === 'PUT') {
        objects.set(pathname, { body, modifiedAt: new Date().toUTCString() });
        res.writeHead(200);
        return res.end();
      }
      if (req.method === 'HEAD') {
        if (!present) {
          res.writeHead(404);
          return res.end();
        }
        res.writeHead(200, {
          'content-length': String(present.body.length),
          'last-modified': present.modifiedAt,
        });
        return res.end();
      }
      if (req.method === 'GET') {
        if (!present) {
          res.writeHead(404);
          return res.end();
        }
        res.writeHead(200, { 'content-length': String(present.body.length) });
        return res.end(present.body);
      }
      if (req.method === 'DELETE') {
        if (!present) {
          res.writeHead(404);
          return res.end();
        }
        objects.delete(pathname);
        res.writeHead(204);
        return res.end();
      }
      res.writeHead(405);
      res.end();
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;

  ({ app, db, config, blobs } = await boot({
    drivers: {
      storage: {
        driver: 's3',
        options: {
          bucket: 'bucket',
          accessKeyId: 'test-access-key',
          secretAccessKey: 'test-secret-key',
          region: 'us-east-1',
          endpoint: `http://127.0.0.1:${port}`,
          pathStyle: true,
        },
      },
    },
  }));
});

after(async () => {
  await db?.$disconnect();
  await new Promise((resolve) => server.close(resolve));
});

test('the store writes a digest where the local layout would put it, remotely', async () => {
  await resetDb();
  const bytes = Buffer.from('// a compiled extension');
  const stored = await blobs.put(bytes);

  assert.match(stored.digest, /^[0-9a-f]{64}$/);
  assert.equal(blobs.pathFor(stored.digest), null);
  assert.equal(blobs.canSweep(), false);

  const key = `/bucket/blobs/${stored.digest.slice(0, 2)}/${stored.digest.slice(2)}`;
  assert.ok(objects.has(key), 'the object is in the bucket under the digest key');
  assert.deepEqual(objects.get(key).body, bytes);

  // Every request carries a signature and the hash of what it sent, which is
  // what makes the request verifiable by the store.
  for (const entry of requests) {
    assert.match(
      entry.authorization,
      /^AWS4-HMAC-SHA256 Credential=test-access-key\/\d{8}\/us-east-1\/s3\/aws4_request, SignedHeaders=[a-z0-9;-]+, Signature=[0-9a-f]{64}$/,
    );
    assert.match(entry.payloadHash, /^[0-9a-f]{64}$/);
  }
  assert.equal(requests.at(-1).payloadHash, sha256(bytes));

  // Reading it back goes through the driver, not the filesystem.
  assert.deepEqual(await blobs.read(stored.digest), bytes);
  assert.equal((await blobs.stat(stored.digest)).bytes, bytes.length);
  assert.equal(await blobs.remove(stored.digest), true);
  assert.equal(await blobs.stat(stored.digest), null);
});

test('a publish and its download both go through the object store', async () => {
  await resetDb();
  const admin = await signupAndAccept(app, uniqNs());
  const owner = await signupAndAccept(app, uniqNs());
  const code = '// stored in the bucket';

  await publishProject(app, owner.user.namespace, 'bucket', owner.token, { code });
  await request(app)
    .patch(apiPath(`/@${owner.user.namespace}/bucket/versions/1.0.0`))
    .set('If-Match', '*')
    .set(bearer(admin.token))
    .send({ status: 'approved' })
    .expect(200);

  const [row] = await db.$queryRaw`
    SELECT "BlobDigest" AS digest, "BlobSize" AS size FROM "Versions"
    WHERE "ExtensionId" = 'bucket' AND "BlobDigest" IS NOT NULL
  `;
  assert.ok(row, 'the version carries a digest');
  const key = `/bucket/blobs/${row.digest.slice(0, 2)}/${row.digest.slice(2)}`;
  assert.ok(objects.has(key), 'the compiled output is in the bucket');
  // The publish build output, not the file that was uploaded, is what the
  // digest addresses.
  assert.equal(sha256(objects.get(key).body), row.digest);
  assert.match(objects.get(key).body.toString(), /extensions\.register/);

  // Not on this disk: a local path is what a digest-addressed blob does not
  // have once the store is remote.
  assert.equal(blobs.pathFor(row.digest), null);

  const download = await request(app)
    .get(apiPath(`/@${owner.user.namespace}/bucket/versions/1.0.0/download`))
    .redirects(1)
    .expect(200);
  assert.equal(download.text, objects.get(key).body.toString());

  const served = await request(app)
    .get(apiPath(`/blobs/${row.digest}`))
    .expect(200);
  assert.equal(served.text, download.text);
});

test('a digest the bucket does not hold is a 404, not a 500', async () => {
  await resetDb();
  const digest = 'c'.repeat(64);
  await request(app)
    .get(apiPath(`/blobs/${digest}`))
    .expect(404);
});

test('a bucket that refuses the probe refuses the configuration', async () => {
  // The probe is a HEAD on the bucket; the fake answers 404 for any bucket but
  // its own, so a wrong name is caught before the instance serves a request.
  const { createDriverHost } = await import('../src/drivers/host.js');
  const host = createDriverHost({ config, db });
  await assert.rejects(
    () =>
      host.verify('storage', [
        {
          driver: 's3',
          options: {
            bucket: 'not-the-bucket',
            accessKeyId: 'test-access-key',
            secretAccessKey: 'test-secret-key',
            region: 'us-east-1',
            endpoint: `http://127.0.0.1:${port}`,
            pathStyle: true,
          },
        },
      ]),
    /does not exist/,
  );
});
