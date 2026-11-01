import { Router } from 'express';
import { requireAdmin } from '../auth.js';
import { audit } from '../audit.js';
import { loadConfig } from '../config.js';
import { configStorage } from '../server-config.js';
import { fieldErrors, HttpError, notFound } from '../errors.js';
import { maskOptions, normalizeDriverConfig } from '../drivers/config.js';
import { DriverConfigError } from '../drivers/host.js';
import { getKind, listDescriptors, listKinds } from '../drivers/registry.js';
import {
  destructiveCounts,
  keepSecrets,
  needsConfirmation,
  writeDriverInstances,
} from '../drivers/admin.js';
import { requireObjectBody } from './shared.js';

// The instance's driver mixture: what is running, what could run, and the
// endpoint that swaps one for the other. Admin only, because every instance
// here is a way into the account database or a way out of it.
export function makeDriversRouter(shared) {
  const { db, config, drivers, storageProbe = {} } = shared;
  const router = Router();

  function catalog() {
    const entries = {};
    for (const kind of listKinds()) {
      entries[kind.id] = {
        label: kind.label,
        instances: drivers.entries(kind.id).map((entry) => ({
          ...entry,
          options: maskOptions(kind.id, entry),
        })),
        available: listDescriptors(kind.id).map((descriptor) => ({
          driver: descriptor.id,
          label: descriptor.label,
          capabilities: descriptor.capabilities,
          requirements: descriptor.requirements,
          options: descriptor.options,
        })),
      };
    }
    return entries;
  }

  router.get('/admin/drivers', requireAdmin, (req, res) => {
    res.json({ drivers: catalog(), revision: drivers.revision() });
  });

  router.put('/admin/drivers/:kind', requireAdmin, async (req, res) => {
    const kind = req.params.kind;
    if (!getKind(kind)) throw notFound('No such driver kind.');
    requireObjectBody(req);
    const instances = req.body.instances;
    if (!Array.isArray(instances)) {
      throw fieldErrors([{ field: 'instances', message: 'Must be an array of instances.' }]);
    }
    const incoming = instances.map((entry) => {
      if (!entry || typeof entry !== 'object' || typeof entry.driver !== 'string') {
        throw fieldErrors([{ field: 'instances', message: 'Each instance needs a driver.' }]);
      }
      return {
        driver: entry.driver,
        ...(typeof entry.id === 'string' && entry.id !== '' ? { id: entry.id } : {}),
        options: entry.options ?? {},
      };
    });
    const withSecrets = keepSecrets({ incoming, previous: drivers.instances(kind) });

    // Everything the change would mean is checked against a copy of the live
    // configuration, so a refused change leaves both the file and the running
    // instance exactly as they were.
    const candidate = structuredClone(config);
    if (kind === 'auth') candidate.auth.methods = withSecrets;
    else if (kind === 'mail') candidate.mail.drivers = withSecrets;
    else candidate.drivers[kind] = withSecrets.length === 1 ? withSecrets[0] : withSecrets;
    let resolved;
    try {
      normalizeDriverConfig(candidate);
      resolved = candidate.driverInstances[kind];
    } catch (error) {
      if (error instanceof DriverConfigError) throw fieldErrors(error.errors);
      throw error;
    }

    const counts = await destructiveCounts({
      db,
      kind,
      current: drivers.instances(kind),
      next: resolved,
    });
    const confirmationNeeded = needsConfirmation(counts);
    if (req.query.dryRun === '1') {
      return res.json({
        dryRun: true,
        kind,
        instances: resolved,
        destructive: counts,
        requiresConfirmation: confirmationNeeded,
      });
    }
    if (confirmationNeeded && req.body.confirm !== true) {
      throw new HttpError(409, {
        slug: 'confirmation-required',
        detail: `This change affects ${counts.passkeys} passkey(s) and ${counts.identities} linked identity(ies). Send confirm: true to apply it.`,
        extra: { destructive: counts },
      });
    }

    const storage = configStorage(config.configPath ?? 'config.yaml', storageProbe);
    if (!storage.persistent) {
      throw new HttpError(409, { slug: 'configuration-read-only', detail: storage.reason });
    }
    // Probed before the file is touched: a provider that cannot be reached is
    // a refused change, not a written file the running instance then has to
    // disagree with.
    try {
      await drivers.verify(kind, resolved);
    } catch (error) {
      throw new HttpError(502, {
        slug: 'driver-verification-failed',
        detail: `The new ${kind} instances were not applied: ${error.message}`,
      });
    }
    writeDriverInstances({ configPath: storage.path, kind, instances: resolved });

    // The same object the routers hold is updated in place, so a setting the
    // request path reads per call reflects the file the moment it is written.
    Object.assign(config, loadConfig(storage.path));
    const revision = await drivers.reload(kind, config.driverInstances[kind], {
      verified: true,
    });

    let rebuilt = false;
    if (typeof req.app.locals.system?.reload === 'function') {
      try {
        await req.app.locals.system.reload();
        rebuilt = true;
      } catch (error) {
        // The file and the driver host already carry the change; a rebuild
        // that failed says what is left to pick up on the next restart rather
        // than pretending the write did not happen.
        req.app.locals.system.lastReloadError = error.message;
      }
    }

    await audit(db, req.auth.user, 'drivers.update', {}, { kind, instances: resolved });
    res.json({
      kind,
      applied: rebuilt || !['auth', 'mail'].includes(kind) ? 'live' : 'restart',
      revision,
      instances: drivers.entries(kind).map((entry) => ({
        ...entry,
        options: maskOptions(kind, entry),
      })),
    });
  });

  router.get('/admin/system', requireAdmin, (req, res) => {
    const system = req.app.locals.system ?? {};
    res.json({
      supervised: Boolean(system.supervised),
      startedAt: (system.startedAt ?? new Date()).toISOString(),
      configPath: system.configPath ?? config.configPath ?? null,
      driversRevision: drivers.revision(),
      lastReload: system.lastReload ? new Date(system.lastReload).toISOString() : null,
    });
  });

  router.post('/admin/system/reload', requireAdmin, async (req, res) => {
    const system = req.app.locals.system ?? {};
    if (typeof system.reload !== 'function') {
      throw new HttpError(409, {
        slug: 'reload-unavailable',
        detail:
          'This process was not started in a way that can rebuild itself. Restart it instead.',
      });
    }
    const result = (await system.reload()) ?? {};
    res.json({ reloaded: true, ...result });
  });

  // Exiting unsupervised is an outage with extra steps, so the process only
  // agrees to do it when something outside is set up to start it again.
  router.post('/admin/system/restart', requireAdmin, async (req, res) => {
    const system = req.app.locals.system ?? {};
    requireObjectBody(req);
    if (req.body.confirm !== 'restart') {
      throw fieldErrors([{ field: 'confirm', message: 'Send confirm: "restart".' }]);
    }
    if (!system.supervised) {
      throw new HttpError(409, {
        slug: 'not-supervised',
        detail:
          'This process is not supervised, so exiting would end the service. Start it under a supervisor and set process.supervised to true.',
      });
    }
    if (typeof system.restart !== 'function') {
      throw new HttpError(409, {
        slug: 'restart-unavailable',
        detail: 'This process cannot restart itself.',
      });
    }
    res.status(202).json({ restarting: true });
    setImmediate(() => system.restart());
  });

  return router;
}
