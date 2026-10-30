import { createHash, createHmac } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { compilerCommand } from '../compiler.js';
import { renderRegistryMetrics } from '../observability.js';
import { notifyUser } from '../notify.js';
import { scanSourceWarnings } from '../risky-patterns.js';

const TIMEOUT_MS = 10_000;

function rootOf(ctx) {
  const dir = ctx.driver.options?.dir;
  return dir ? path.resolve(ctx.config.dataDir, dir) : ctx.config.dataDir;
}

// A key is a relative path under the root. It is resolved and checked against
// the root rather than joined and trusted: a key with `..` in it would
// otherwise read or write outside the instance's data directory.
function keyPath(ctx, key) {
  if (typeof key !== 'string' || key === '') throw new Error('A storage key is required.');
  const root = rootOf(ctx);
  const abs = path.resolve(root, key);
  if (abs !== root && !abs.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Storage key "${key}" leaves the data directory.`);
  }
  return abs;
}

export const local = {
  id: 'local',
  kind: 'storage',
  label: 'Local disk',
  capabilities: { read: true, write: true, delete: true },
  requirements: {},
  options: [{ key: 'dir', label: 'Directory', type: 'text', default: null }],
  put(key, buffer, ctx) {
    const abs = keyPath(ctx, key);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, buffer);
    return { key, bytes: buffer.length };
  },
  get(key, ctx) {
    return readFileSync(keyPath(ctx, key));
  },
  delete(key, ctx) {
    rmSync(keyPath(ctx, key), { force: true });
  },
  stat(key, ctx) {
    const stats = statSync(keyPath(ctx, key));
    return { bytes: stats.size, modifiedAt: stats.mtime.toISOString() };
  },
  probe(ctx) {
    mkdirSync(rootOf(ctx), { recursive: true });
    return true;
  },
};

// Inline is what the server did before the kind existed: the work runs in the
// caller's request. The outbox kinds put it somewhere durable instead.
export const inline = {
  id: 'inline',
  kind: 'jobs',
  label: 'Inline',
  capabilities: { durable: false },
  requirements: {},
  options: [],
  async enqueue(name, payload, handler) {
    if (typeof handler !== 'function') throw new Error('An inline job needs its handler.');
    await handler(payload);
    return { name, ran: true };
  },
};

// Ranked by trigram similarity, which is a database operator rather than
// something a typed Prisma query can express.
async function searchPostgres(term, { limit = 20 } = {}, ctx) {
  if (typeof term !== 'string' || term.trim() === '') return [];
  const folded = term.toLowerCase();
  return ctx.db.$queryRaw`
    SELECT "Namespace", "ExtensionId", "Version", "Name"
    FROM "Versions"
    WHERE "Status" = 'published' AND "SearchText" % ${folded}
    ORDER BY similarity("SearchText", ${folded}) DESC
    LIMIT ${Math.min(Math.max(Number(limit) || 20, 1), 100)}
  `;
}

export const postgres = {
  id: 'postgres',
  kind: 'search',
  label: 'Postgres trigram',
  capabilities: { prefix: false, typo: false },
  requirements: {},
  options: [],
  search: searchPostgres,
};

export const none = {
  id: 'none',
  kind: 'captcha',
  label: 'No captcha',
  capabilities: { challenge: false },
  requirements: {},
  options: [],
  verify: () => true,
};

function captchaDriver({ id, label, url, body }) {
  return {
    id,
    kind: 'captcha',
    label,
    capabilities: { challenge: true },
    requirements: {},
    options: [
      { key: 'secret', label: 'Secret key', type: 'secret', required: true, secret: true },
      { key: 'siteKey', label: 'Site key', type: 'text' },
    ],
    async verify(token, { ip } = {}, ctx) {
      if (typeof token !== 'string' || token === '') return false;
      const form = body(ctx.driver.options, token, ip);
      let response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: form,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch {
        // An unreachable verifier is not a solved challenge; the caller
        // refuses the request either way.
        return false;
      }
      const answer = await response.json().catch(() => null);
      return Boolean(answer?.success);
    },
    async health(ctx) {
      return Boolean(ctx.driver.options?.secret);
    },
  };
}

export const turnstile = captchaDriver({
  id: 'turnstile',
  label: 'Cloudflare Turnstile',
  url: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
  body: (options, token, ip) => {
    const form = new URLSearchParams({ secret: options.secret, response: token });
    if (ip) form.set('remoteip', ip);
    return form;
  },
});

export const hcaptcha = captchaDriver({
  id: 'hcaptcha',
  label: 'hCaptcha',
  url: 'https://api.hcaptcha.com/siteverify',
  body: (options, token, ip) => {
    const form = new URLSearchParams({ secret: options.secret, response: token });
    if (ip) form.set('remoteip', ip);
    return form;
  },
});

export const recaptcha = captchaDriver({
  id: 'recaptcha',
  label: 'reCAPTCHA',
  url: 'https://www.google.com/recaptcha/api/siteverify',
  body: (options, token, ip) => {
    const form = new URLSearchParams({ secret: options.secret, response: token });
    if (ip) form.set('remoteip', ip);
    return form;
  },
});

// The pattern scan that already runs on every publish, behind the host so
// another scanner can replace it without touching the publish path.
export const patterns = {
  id: 'patterns',
  kind: 'scanner',
  label: 'Risky patterns',
  capabilities: { malware: false, heuristics: true },
  requirements: {},
  options: [],
  scan(projectDir, files) {
    return scanSourceWarnings(projectDir, files);
  },
  verify: () => true,
};

export const inApp = {
  id: 'in-app',
  kind: 'notify',
  label: 'In-app',
  capabilities: { channels: ['in-app'] },
  requirements: {},
  options: [],
  async send(tx, userId, kind, message, payload = {}) {
    await notifyUser(tx, userId, kind, message, payload);
  },
  verify: () => true,
};

// ClamAV speaks a small line protocol over TCP: `zINSTREAM\0`, then the file as
// length-prefixed chunks, then a zero-length chunk, and one line back. That is
// the whole client, so it is written here rather than taking a dependency.
function clamavInstream(options, bytes) {
  const host = options.host ?? '127.0.0.1';
  const port = Number(options.port ?? 3310);
  const timeoutMs = Number(options.timeoutMs ?? 15_000);
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let answer = '';
    let settled = false;
    const finish = (error, line) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve(line);
    };
    socket.setTimeout(timeoutMs, () => {
      finish(new Error(`ClamAV did not answer within ${timeoutMs}ms.`));
    });
    socket.on('error', (error) => {
      finish(
        new Error(`Could not reach ClamAV at ${host}:${port}: ${error.message}`, {
          cause: error,
        }),
      );
    });
    socket.on('data', (chunk) => {
      answer += chunk.toString('utf8');
      // A reply is one line, terminated by NUL or a newline.
      if (!answer.includes('\0') && !answer.includes('\n')) return;
      finish(null, answer.split(/[\0\n]/)[0].trim());
    });
    socket.on('connect', () => {
      socket.write('zINSTREAM\0');
      const length = Buffer.alloc(4);
      length.writeUInt32BE(bytes.length, 0);
      socket.write(length);
      socket.write(bytes);
      socket.write(Buffer.alloc(4));
    });
  });
}

export const clamav = {
  id: 'clamav',
  kind: 'scanner',
  label: 'ClamAV',
  capabilities: { malware: true, heuristics: false },
  requirements: {},
  options: [
    { key: 'host', label: 'Host', type: 'text', default: '127.0.0.1' },
    { key: 'port', label: 'Port', type: 'number', default: 3310 },
    { key: 'timeoutMs', label: 'Timeout (ms)', type: 'number', default: 15000 },
  ],
  // Every extracted file is streamed to the daemon. A detection is reported in
  // the same shape the pattern scan uses, so a reviewer sees one list.
  async scan(projectDir, files, ctx) {
    const options = ctx.driver.options;
    const warnings = [];
    for (const file of files) {
      let bytes;
      try {
        bytes = await readFile(path.join(projectDir, file));
      } catch {
        continue;
      }
      if (bytes.length === 0) continue;
      const answer = await clamavInstream(options, bytes);
      if (!/FOUND$/i.test(answer)) continue;
      warnings.push({
        code: 'malware',
        file,
        line: 0,
        message: answer.replace(/^stream:\s*/i, '').trim() || 'ClamAV reported a detection.',
      });
      if (warnings.length >= 50) break;
    }
    return warnings;
  },
  async verify(ctx) {
    await clamavInstream(ctx.driver.options, Buffer.from('registry probe'));
    return true;
  },
  async health(ctx) {
    return Boolean(ctx.driver.options?.host);
  },
};

// The two ways a project is built. `extend` is the bundled CLI; `custom-cli`
// runs the script the operator names, which is how a fork or a wrapper joins in
// without replacing the image. The driver hands back a path; the sandbox that
// runs it stays in compiler.js, shared by both.
export const extendCompiler = {
  id: 'extend',
  kind: 'compiler',
  label: 'Triflare Extend',
  capabilities: { sandboxed: true },
  requirements: {},
  options: [],
  command(ctx) {
    return compilerCommand({ ...ctx.config, compiler: { ...ctx.config.compiler, command: null } });
  },
  verify: () => true,
};

export const customCliCompiler = {
  id: 'custom-cli',
  kind: 'compiler',
  label: 'Custom CLI',
  capabilities: { sandboxed: true },
  requirements: {},
  options: [
    {
      key: 'command',
      label: 'Script path',
      type: 'text',
      required: true,
      help: 'A .js, .mjs, or .cjs script that accepts `build -o <file>`.',
    },
  ],
  command(ctx) {
    return compilerCommand({
      ...ctx.config,
      compiler: { ...ctx.config.compiler, command: ctx.driver.options.command },
    });
  },
  verify(ctx) {
    // Resolving the path here is the check: a missing file or a wrong extension
    // is refused before the new instance is swapped in.
    customCliCompiler.command(ctx);
    return true;
  },
};

export const prometheus = {
  id: 'prometheus',
  kind: 'metrics',
  label: 'Prometheus text',
  capabilities: { format: 'text/plain' },
  requirements: {},
  options: [],
  render(db, telemetry) {
    return renderRegistryMetrics(db, telemetry);
  },
  verify: () => true,
};

// ---- S3 and anything that speaks its API ----------------------------------
//
// One object store interface, signed by hand rather than through an SDK: the
// server ships no provider packages, and the four requests a blob store makes
// (PUT, GET, HEAD, DELETE) are small enough to sign here. R2 and MinIO take the
// same signature; only the endpoint and whether the bucket is in the host
// change.

const S3_TIMEOUT_MS = 15_000;

function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex');
}

function hmac(key, data) {
  return createHmac('sha256', key).update(data).digest();
}

// RFC 3986. encodeURIComponent leaves !'()* alone, and the canonical URI has to
// encode them too or the signature the server computes differs from ours.
function encodeSegment(value) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function s3Region(options) {
  return options.region || 'us-east-1';
}

function s3ObjectKey(options, key) {
  const prefix = String(options.prefix ?? '').replace(/^\/+|\/+$/g, '');
  return prefix && key ? `${prefix}/${key}` : prefix || key || '';
}

function s3Target(options, key) {
  const region = s3Region(options);
  const endpoint = new URL(
    options.endpoint ? options.endpoint.replace(/\/+$/, '') : `https://s3.${region}.amazonaws.com`,
  );
  const bucket = encodeSegment(options.bucket);
  const objectKey = s3ObjectKey(options, key);
  const segments = objectKey.split('/').filter(Boolean).map(encodeSegment);
  if (options.pathStyle) {
    // MinIO and most self-hosted gateways answer on a single host with the
    // bucket in the path; a wildcard DNS name per bucket is not always there.
    return {
      url: `${endpoint.origin}/${bucket}/${segments.join('/')}`,
      host: endpoint.host,
      canonicalUri: `/${bucket}/${segments.join('/')}`,
    };
  }
  return {
    url: `${endpoint.protocol}//${options.bucket}.${endpoint.host}/${segments.join('/')}`,
    host: `${options.bucket}.${endpoint.host}`,
    canonicalUri: `/${segments.join('/')}`,
  };
}

function amzTimestamp(date) {
  const iso = date.toISOString();
  return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`;
}

async function s3Fetch(options, method, key, { body = null } = {}) {
  const target = s3Target(options, key);
  const region = s3Region(options);
  const amzDate = amzTimestamp(new Date());
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body ?? '');

  const headers = {
    host: target.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (options.sessionToken) headers['x-amz-security-token'] = options.sessionToken;

  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((name) => `${name}:${headers[name]}\n`).join('');
  const signedHeaders = names.join(';');
  const canonicalRequest = [
    method,
    target.canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const signature = hmac(
    hmac(hmac(hmac(`AWS4${options.secretAccessKey}`, dateStamp), region), 's3'),
    'aws4_request',
  );
  const signed = createHmac('sha256', signature).update(stringToSign).digest('hex');

  const requestHeaders = {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${options.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signed}`,
  };
  if (body) requestHeaders['content-length'] = String(body.length);

  try {
    return await fetch(target.url, {
      method,
      headers: requestHeaders,
      body: body ?? undefined,
      signal: AbortSignal.timeout(S3_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(`Could not reach the object store: ${error.message}`, { cause: error });
  }
}

async function s3Failure(response, action) {
  const detail = await response.text().catch(() => '');
  return new Error(
    `The object store answered ${response.status} to ${action}${detail ? `: ${detail.slice(0, 200)}` : ''}.`,
  );
}

function s3Options() {
  return [
    { key: 'bucket', label: 'Bucket', type: 'text', required: true },
    { key: 'accessKeyId', label: 'Access key id', type: 'text', required: true },
    {
      key: 'secretAccessKey',
      label: 'Secret access key',
      type: 'secret',
      required: true,
      secret: true,
    },
    { key: 'region', label: 'Region', type: 'text', default: 'us-east-1' },
    { key: 'endpoint', label: 'Endpoint', type: 'url' },
    { key: 'prefix', label: 'Key prefix', type: 'text' },
    { key: 'pathStyle', label: 'Bucket in the path', type: 'boolean', default: false },
    { key: 'sessionToken', label: 'Session token', type: 'secret', secret: true },
  ];
}

export const s3 = {
  id: 's3',
  kind: 'storage',
  label: 'S3-compatible',
  capabilities: { read: true, write: true, delete: true, remote: true },
  requirements: {},
  options: s3Options(),
  async put(key, buffer, ctx) {
    const response = await s3Fetch(ctx.driver.options, 'PUT', key, { body: buffer });
    if (!response.ok) throw await s3Failure(response, `put ${key}`);
    return { key, bytes: buffer.length };
  },
  async get(key, ctx) {
    const response = await s3Fetch(ctx.driver.options, 'GET', key);
    if (response.status === 404) {
      const error = new Error(`The object store has no ${key}.`);
      error.code = 'ENOENT';
      throw error;
    }
    if (!response.ok) throw await s3Failure(response, `get ${key}`);
    return Buffer.from(await response.arrayBuffer());
  },
  async delete(key, ctx) {
    const response = await s3Fetch(ctx.driver.options, 'DELETE', key);
    if (response.status === 404) return false;
    if (!response.ok) throw await s3Failure(response, `delete ${key}`);
    return true;
  },
  async stat(key, ctx) {
    const response = await s3Fetch(ctx.driver.options, 'HEAD', key);
    if (response.status === 404) return null;
    if (!response.ok) throw await s3Failure(response, `head ${key}`);
    const modified = response.headers.get('last-modified');
    return {
      bytes: Number(response.headers.get('content-length') ?? 0),
      ...(modified ? { modifiedAt: new Date(modified).toISOString() } : {}),
    };
  },
  // A probe is a HEAD on the bucket itself: it says the credentials work, the
  // bucket exists, and the endpoint is the one the operator meant.
  async probe(ctx) {
    const response = await s3Fetch(ctx.driver.options, 'HEAD', null);
    if (response.status === 404) {
      throw new Error(`The bucket "${ctx.driver.options.bucket}" does not exist.`);
    }
    if (!response.ok) throw await s3Failure(response, 'probe the bucket');
    return true;
  },
  async health(ctx) {
    return Boolean(ctx.driver.options?.bucket && ctx.driver.options?.accessKeyId);
  },
};

export const DESCRIPTORS = [
  local,
  s3,
  inline,
  postgres,
  none,
  turnstile,
  hcaptcha,
  recaptcha,
  patterns,
  clamav,
  inApp,
  extendCompiler,
  customCliCompiler,
  prometheus,
];
