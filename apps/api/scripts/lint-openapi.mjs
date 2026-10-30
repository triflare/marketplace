// Structural checks on openapi/v1.yml that a YAML parser alone cannot make:
// the description has to agree with product.yml, every reference has to
// resolve, operation ids have to be unique (a generator names methods after
// them), and an error response has to describe the problem document the
// server actually sends.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const specPath = fileURLToPath(new URL('../openapi/v1.yml', import.meta.url));
const productPath = fileURLToPath(new URL('../product.yml', import.meta.url));

const spec = YAML.parse(readFileSync(specPath, 'utf8'));
const product = YAML.parse(readFileSync(productPath, 'utf8'));
const problems = [];

const METHODS = new Set(['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace']);

function fail(message) {
  problems.push(message);
}

// Every $ref in the document, with the path it was found at so a failure names
// the place to fix.
function walkRefs(node, where = '#') {
  if (Array.isArray(node)) {
    node.forEach((entry, index) => walkRefs(entry, `${where}/${index}`));
    return;
  }
  if (!node || typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node)) {
    if (key === '$ref' && typeof value === 'string') {
      if (!value.startsWith('#/')) {
        fail(`${where}: $ref "${value}" is not a local reference`);
        continue;
      }
      if (resolve(value.slice(1)) === undefined) {
        fail(`${where}: $ref "${value}" does not resolve`);
      }
      continue;
    }
    walkRefs(value, `${where}/${key}`);
  }
}

function resolve(pointer) {
  let node = spec;
  for (const raw of pointer.split('/').slice(1)) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!node || typeof node !== 'object' || !(key in node)) return undefined;
    node = node[key];
  }
  return node;
}

if (!String(spec.openapi ?? '').startsWith('3.1')) {
  fail(`openapi must be 3.1.x, found ${String(spec.openapi)}`);
}
if (spec.info?.version !== product.version) {
  fail(`info.version ${spec.info?.version} does not match product.yml ${product.version}`);
}

const apiRoot = product.defaults?.apiRoot ?? '/v1';
const server = spec.servers?.[0]?.url ?? '';
if (!server.endsWith(apiRoot)) {
  fail(`servers[0].url "${server}" does not end with the configured API root ${apiRoot}`);
}

const declaredTags = new Set((spec.tags ?? []).map((tag) => tag.name));
const operationIds = new Map();

for (const [path, item] of Object.entries(spec.paths ?? {})) {
  if (path.startsWith(apiRoot)) {
    fail(`${path}: paths are relative to the server URL, so it must not repeat ${apiRoot}`);
  }
  for (const [method, operation] of Object.entries(item ?? {})) {
    if (!METHODS.has(method)) continue;
    const where = `${method.toUpperCase()} ${path}`;

    if (typeof operation.operationId !== 'string' || operation.operationId === '') {
      fail(`${where}: missing operationId`);
    } else if (operationIds.has(operation.operationId)) {
      fail(
        `${where}: operationId "${operation.operationId}" is also used by ${operationIds.get(operation.operationId)}`,
      );
    } else {
      operationIds.set(operation.operationId, where);
    }

    if (typeof operation.summary !== 'string' || operation.summary === '') {
      fail(`${where}: missing summary`);
    }
    for (const tag of operation.tags ?? []) {
      if (!declaredTags.has(tag)) fail(`${where}: tag "${tag}" is not declared under tags`);
    }

    for (const [status, response] of Object.entries(operation.responses ?? {})) {
      if (response?.$ref) continue;
      if (!/^[45]/.test(status)) continue;
      const media = Object.keys(response?.content ?? {});
      if (!media.includes('application/problem+json')) {
        fail(`${where}: ${status} response does not describe application/problem+json`);
      }
      if (!response?.description) fail(`${where}: ${status} response has no description`);
    }
  }
}

walkRefs(spec);

if (problems.length > 0) {
  console.error(`openapi/v1.yml: ${problems.length} problem(s)`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log(`openapi/v1.yml: ${operationIds.size} operations, all structural checks pass`);
