import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import YAML from 'yaml';

// Where a kind's instances live in the file. Auth and mail predate the
// registry and keep their own sections; everything else is under `drivers`.
function pathFor(kind) {
  if (kind === 'auth') return ['auth', 'methods'];
  if (kind === 'mail') return ['mail', 'drivers'];
  return ['drivers', kind];
}

function fileShape(kind, instances) {
  const shaped = instances.map((entry) => {
    const options = Object.fromEntries(
      Object.entries(entry.options ?? {}).filter(
        ([, value]) => value !== null && value !== undefined,
      ),
    );
    return {
      driver: entry.driver,
      ...(entry.id && entry.id !== entry.driver ? { id: entry.id } : {}),
      ...(Object.keys(options).length ? { options } : {}),
    };
  });
  // A single kind is one object in the file, which is how an operator writes
  // it by hand; the two multi-instance kinds are always lists.
  return kind === 'auth' || kind === 'mail' ? shaped : (shaped[0] ?? null);
}

// Edits the YAML document rather than re-serialising the merged object, so the
// operator's comments and key order survive the write, the same way the
// settings endpoint edits its keys.
export function writeDriverInstances({ configPath, kind, instances }) {
  // The first such change on an environment-only deployment creates the file.
  const document = YAML.parseDocument(
    existsSync(configPath) ? readFileSync(configPath, 'utf8') : '',
  );
  if (document.contents === null) document.contents = document.createNode({});
  document.setIn(pathFor(kind), fileShape(kind, instances));
  writeFileSync(configPath, document.toString(), 'utf8');
}

// The secret options an admin did not resend are kept: the read side masks
// them to `{ set: true }`, so a form that submits what it was given must not
// write that placeholder over the real value. An explicit null clears one.
export function keepSecrets({ incoming, previous }) {
  return incoming.map((entry) => {
    const stored =
      previous.find((candidate) => candidate.id === entry.id) ??
      previous.find((candidate) => candidate.driver === entry.driver);
    const options = { ...(entry.options ?? {}) };
    for (const [key, value] of Object.entries(options)) {
      if (value && typeof value === 'object' && value.set === true) {
        options[key] = stored?.options?.[key] ?? null;
      }
    }
    return { ...entry, options };
  });
}

// The counts an admin is shown before a change that would affect accounts
// already on the instance. A change with none of these applies without a
// confirmation.
export async function destructiveCounts({ db, kind, current, next }) {
  const counts = { identities: 0, passkeys: 0, storage: false };
  if (kind === 'auth') {
    const nextDrivers = new Set(next.map((entry) => entry.driver));
    const removed = current.filter((entry) => !nextDrivers.has(entry.driver));
    for (const entry of removed) {
      const model = db.AuthIdentities ?? db.UserIdentities;
      if (!model) continue;
      if (entry.driver === 'passkey') {
        counts.passkeys += await db.Passkeys.count();
      } else if (db.AuthIdentities) {
        counts.identities += await db.AuthIdentities.count({ where: { Driver: entry.driver } });
      }
    }
    // A passkey is bound to the relying party it was created for, so changing
    // the id is the same loss as removing the method.
    const before = current.find((entry) => entry.driver === 'passkey');
    const after = next.find((entry) => entry.driver === 'passkey');
    if (before && after && (before.options?.rpId ?? null) !== (after.options?.rpId ?? null)) {
      counts.passkeys = await db.Passkeys.count();
    }
  }
  if (kind === 'storage') {
    const before = current[0]?.driver ?? 'local';
    const after = next[0]?.driver ?? 'local';
    counts.storage = before !== after;
  }
  return counts;
}

export function needsConfirmation(counts) {
  return counts.identities > 0 || counts.passkeys > 0 || counts.storage === true;
}
