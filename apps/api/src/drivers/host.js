import { HttpError } from '../errors.js';
import { checkOptions, getDescriptor, getKind, listKinds } from './registry.js';

// How long a swapped-out driver waits for the calls it is already serving. A
// call that outlives this is not worth blocking a reload for: close() still
// runs, and the call fails the way any request fails when a process goes away.
const DRAIN_TIMEOUT_MS = 5000;

// A configuration the registry cannot build. The errors are already shaped for
// the response body, so the startup path and the admin endpoint say the same
// thing about the same mistake.
export class DriverConfigError extends Error {
  constructor(errors) {
    super(errors.map((error) => `${error.field}: ${error.message}`).join('\n'));
    this.name = 'DriverConfigError';
    this.errors = errors;
  }
}

function coerceOption(option, value) {
  if (value === undefined || value === null || value === '') return option.default ?? null;
  if (option.type === 'number') return Number(value);
  if (option.type === 'boolean') return value === true || value === 'true';
  return value;
}

function normalizeOptions(kind, entry) {
  const schema = getDescriptor(kind, entry.driver)?.options ?? [];
  const options = {};
  for (const option of schema)
    options[option.key] = coerceOption(option, entry.options?.[option.key]);
  // An option the schema does not declare is appended rather than dropped so
  // the change that introduced it is still visible; checkOptions refuses it
  // before the instance is ever built.
  for (const [key, value] of Object.entries(entry.options ?? {})) {
    if (!Object.hasOwn(options, key)) options[key] = value;
  }
  return options;
}

// The id an instance is addressed by. The driver name is the id for the first
// instance of that driver, and repeats are numbered, so `oidc` and `oidc-2` are
// two providers in the order the configuration lists them.
function assignIds(entries) {
  const seen = new Map();
  return entries.map((entry) => {
    const count = (seen.get(entry.driver) ?? 0) + 1;
    seen.set(entry.driver, count);
    return { ...entry, id: entry.id ?? (count === 1 ? entry.driver : `${entry.driver}-${count}`) };
  });
}

function describeDriver(kind, descriptor) {
  return {
    driver: descriptor.id,
    label: descriptor.label,
    capabilities: descriptor.capabilities ?? {},
    requirements: descriptor.requirements ?? {},
    options: descriptor.options ?? [],
  };
}

export function createDriverHost({ config, db, log = console }) {
  // kind -> { revision, entries: Map<id, entry> }. An entry is one configured
  // driver: the descriptor it came from, its options, the object callers get,
  // and the calls still running against it.
  const state = new Map();
  let closed = false;

  for (const kind of listKinds()) {
    state.set(kind.id, { revision: 0, entries: new Map() });
  }

  function buildEntry(kind, raw) {
    const descriptor = getDescriptor(kind, raw.driver);
    if (!descriptor) {
      const available = (getKind(kind) ? [...getKind(kind).drivers.keys()] : []).join(', ');
      throw new DriverConfigError([
        {
          field: `${kind}.driver`,
          message: `Unknown driver "${raw.driver}". Available: ${available}.`,
        },
      ]);
    }
    const errors = checkOptions(kind, raw.driver, raw.options);
    if (errors.length) throw new DriverConfigError(errors);
    return {
      id: raw.id ?? raw.driver,
      driver: descriptor.id,
      descriptor,
      options: normalizeOptions(kind, raw),
      inflight: 0,
      failing: null,
      instance: null,
    };
  }

  // The object a caller holds. Every method resolves the descriptor and builds
  // a fresh context, so a swap is visible on the next call and no closure
  // captured an old driver.
  function materialize(kind, entry) {
    const kindDef = getKind(kind);
    const instance = { id: entry.id, driver: entry.driver, kind, options: entry.options };

    const call = (method, request) => {
      const fn = entry.descriptor[method]?.bind(entry.descriptor);
      if (!fn) return undefined;
      return (...args) => {
        if (closed) throw new HttpError(503, { detail: 'The server is shutting down.' });
        const ctx = context(request, kind, entry);
        entry.inflight += 1;
        let result;
        try {
          result = kindDef.ctxFirst.has(method) ? fn(ctx, ...args) : fn(...args, ctx);
        } catch (error) {
          entry.inflight -= 1;
          throw error;
        }
        if (result && typeof result.then === 'function') {
          return result.finally(() => {
            entry.inflight -= 1;
          });
        }
        entry.inflight -= 1;
        return result;
      };
    };

    for (const method of kindDef.methods) instance[method] = call(method);
    // A caller with a request gets a context whose `request` is the Express
    // one, for the drivers that need to read a cookie or an Accept header.
    instance.withRequest = (request) => {
      const bound = { ...instance };
      for (const method of kindDef.methods) bound[method] = call(method, request);
      return bound;
    };
    entry.instance = instance;
    return instance;
  }

  // Every message is written down before it is sent, so a provider that
  // refuses it leaves a row an admin can see and retry rather than a log line
  // nobody reads. A failure to write the row is not fatal: the message is
  // still worth sending, and the send result is what the caller acts on.
  async function recordOutbox(message) {
    if (!db.MailOutbox) return null;
    try {
      return await db.MailOutbox.create({
        data: {
          To: Array.isArray(message.to) ? message.to.join(', ') : String(message.to ?? ''),
          Subject: String(message.subject ?? ''),
          Purpose: message.purpose ?? null,
          Message: message,
          Status: 'pending',
        },
      });
    } catch (error) {
      log.warn?.(`could not record an outbound message: ${error.message}`);
      return null;
    }
  }

  async function markOutbox(row, status, driver, error) {
    if (!row) return;
    try {
      await db.MailOutbox.update({
        where: { Id: row.Id },
        data: {
          Status: status,
          Driver: driver ?? null,
          Attempts: { increment: 1 },
          LastError: error?.message ?? null,
          SentAt: status === 'sent' ? new Date() : null,
          UpdatedAt: new Date(),
        },
      });
    } catch {
      // The row is bookkeeping; a failure to update it does not change whether
      // the message was delivered.
    }
  }

  // One message's trip down the chain. Split out of sendMail so a retry from
  // the admin outbox goes the same way and lands on the row it is retrying
  // instead of writing a second row for the same message.
  async function deliver(message, row, request) {
    const entries = [...state.get('mail').entries.values()];
    if (entries.length === 0) throw new HttpError(500, { detail: 'No mail driver is configured.' });
    let lastError = null;
    for (const entry of entries) {
      const instance = entry.instance.withRequest(request);
      try {
        const result = await instance.send(message);
        entry.failing = null;
        await markOutbox(row, 'sent', entry.id, null);
        return result;
      } catch (error) {
        entry.failing = error.message;
        lastError = error;
        // A rejected recipient is the provider's answer about this message;
        // trying the next provider with the same address cannot help. Only a
        // transport failure moves down the chain.
        if (!error?.transport) {
          await markOutbox(row, 'failed', entry.id, error);
          throw error;
        }
      }
    }
    await markOutbox(row, 'failed', null, lastError);
    throw lastError;
  }

  function sendMail(request) {
    return async (message) => deliver(message, await recordOutbox(message), request);
  }

  // `entry` is the instance the call is being made for: a driver reads its own
  // options from ctx.driver.options rather than from the configuration object,
  // which is what lets one descriptor serve several instances of itself.
  function context(request, kind = null, entry = null) {
    const ctx = {
      config,
      db,
      log,
      request,
      now: () => new Date(),
      driver: entry ? { id: entry.id, kind, driver: entry.driver, options: entry.options } : null,
      drivers: {},
    };
    for (const kind of listKinds()) {
      const entries = () => [...state.get(kind.id).entries.values()];
      const ctxKind = {
        get(id) {
          const entry = id === undefined ? entries()[0] : state.get(kind.id).entries.get(id);
          return entry ? entry.instance.withRequest(request) : null;
        },
        all() {
          return entries().map((entry) => entry.instance.withRequest(request));
        },
        revisions() {
          return state.get(kind.id).revision;
        },
      };
      // The mail chain is what `ctx.mail.send(...)` means: try each instance in
      // order and stop at the first one that accepts the message.
      if (kind.id === 'mail') {
        ctxKind.send = sendMail(request);
        ctxKind.verify = async () => {
          for (const entry of entries())
            await entry.descriptor.verify(context(request, 'mail', entry));
        };
      }
      ctx[kind.id] = ctxKind;
    }
    return ctx;
  }

  // Building is synchronous so createApp stays synchronous: a driver that
  // needs a connection opens it lazily on the first call instead of during
  // boot, which also keeps a slow provider from holding up startup.
  function instantiate(kind, rawEntries) {
    const entries = assignIds(rawEntries);
    const built = [];
    for (const raw of entries) {
      const entry = buildEntry(kind, raw);
      entry.descriptor.init?.(context(null, kind, entry));
      materialize(kind, entry);
      built.push(entry);
    }
    return built;
  }

  function replace(kind, built) {
    const previous = state.get(kind);
    const next = { revision: previous.revision + 1, entries: new Map() };
    for (const entry of built) next.entries.set(entry.id, entry);
    state.set(kind, next);
    return previous;
  }

  async function drain(entry) {
    const deadline = Date.now() + DRAIN_TIMEOUT_MS;
    while (entry.inflight > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await entry.descriptor.close?.();
  }

  // Built-in defaults plus whatever the file said, as the configuration module
  // resolves them. Kept out of the host so one place
  // decides what a kind's instances are.
  function bootKinds(resolved) {
    for (const kind of listKinds()) {
      replace(kind.id, instantiate(kind.id, resolved[kind.id] ?? []));
    }
  }

  return {
    context,
    get(kind, id, request) {
      const entry =
        id === undefined
          ? [...state.get(kind).entries.values()][0]
          : state.get(kind).entries.get(id);
      return entry ? entry.instance.withRequest(request) : null;
    },
    all(kind) {
      return [...state.get(kind).entries.values()].map((entry) => entry.instance);
    },
    entries(kind) {
      return [...state.get(kind).entries.values()].map((entry) => ({
        id: entry.id,
        ...describeDriver(kind, entry.descriptor),
        options: entry.options,
        state: entry.failing ? 'error' : 'active',
      }));
    },
    revision(kind) {
      return kind === undefined
        ? Object.fromEntries([...state].map(([id, value]) => [id, value.revision]))
        : state.get(kind).revision;
    },
    // The live instances a kind is serving, in the shape the configuration
    // module and the admin endpoint hand to reload().
    instances(kind) {
      return [...state.get(kind).entries.values()].map((entry) => ({
        id: entry.id,
        driver: entry.driver,
        options: entry.options,
      }));
    },
    // Builds the candidates and runs their probes without swapping anything
    // in. The admin endpoint calls this before it writes the file, so a driver
    // that refuses its configuration leaves both the file and the running
    // instance untouched.
    async verify(kind, nextInstances) {
      const built = instantiate(kind, nextInstances);
      try {
        for (const entry of built) {
          // `verify` is the generic probe; a storage driver calls the same idea
          // `probe` and reports the same way.
          const probe =
            entry.descriptor.verify ?? entry.descriptor.probe ?? entry.descriptor.health;
          if (!probe) continue;
          const answer = await probe(context(null, kind, entry));
          if (answer === false) throw new Error(`${entry.driver} refused verification`);
        }
      } catch (error) {
        await Promise.all(built.map((entry) => entry.descriptor.close?.()));
        throw error;
      }
      return true;
    },
    async reload(kind, nextInstances, { verified = false } = {}) {
      if (!verified) await this.verify(kind, nextInstances);
      const built = instantiate(kind, nextInstances);
      const previous = replace(kind, built);
      await Promise.all([...previous.entries.values()].map(drain));
      return state.get(kind).revision;
    },
    // An admin picked a message out of the outbox and asked for another try.
    // The row is the record of that message, so the attempt is written back to
    // it -- status, attempt count, driver, error -- rather than added as a new
    // message the viewer would then show twice.
    async retryOutbox(id, request) {
      const row = await db.MailOutbox.update({
        where: { Id: id },
        data: { Status: 'pending', LastError: null, UpdatedAt: new Date() },
      });
      return deliver(row.Message, row, request);
    },
    boot(resolved) {
      bootKinds(resolved);
    },
    async close() {
      closed = true;
      await Promise.all(
        [...state.values()].flatMap((kind) =>
          [...kind.entries.values()].map((entry) => entry.descriptor.close?.()),
        ),
      );
      for (const kind of state.values()) kind.entries.clear();
    },
  };
}
