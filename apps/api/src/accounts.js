import { randomBytes } from 'node:crypto';
import { isValidNamespace } from './util.js';

// A namespace taken by somebody else gets a numeric suffix, and only then a
// random one. The caller holds the signup lock, so the answer cannot be taken
// between the check and the insert.
export async function freeNamespace(tx, base) {
  const taken = (namespace) =>
    tx.Users.findFirst({ where: { Namespace: namespace }, select: { Id: true } });
  if (base) {
    if (!(await taken(base))) return base;
    for (let suffix = 2; suffix <= 50; suffix += 1) {
      const candidate = `${base.slice(0, 36)}-${suffix}`;
      if (!(await taken(candidate))) return candidate;
    }
  }
  for (;;) {
    const candidate = `user-${randomBytes(6).toString('hex')}`;
    if (!(await taken(candidate))) return candidate;
  }
}

// The part of an address a namespace can be built from. An address whose local
// part has no usable characters falls back to nothing, and the caller gets a
// random namespace instead.
export function namespaceFromEmail(email) {
  const local = String(email ?? '')
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
    .replace(/-$/, '');
  return local && isValidNamespace(local) ? local : null;
}

export function displayNameFromEmail(email) {
  const local = String(email ?? '')
    .split('@')[0]
    .trim();
  return local ? local.slice(0, 80) : 'Account';
}
