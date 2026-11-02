import { existsSync, statSync } from 'node:fs';
import { Router } from 'express';
import { notFound } from '../errors.js';
import { isAdmin } from '../auth.js';
import { hashFile, sha256Hex } from '../blobs.js';

// A digest is only as secret as the URL carrying it, so the blob route applies
// the same status rule as the download route: anyone can fetch compiled output
// that is published, everything else needs to pass the caller's access check.
const PUBLIC_STATUSES = new Set(['published', 'deprecated', 'yanked']);

export function makeBlobsRouter({ db, blobs }) {
  const router = Router();

  router.get('/blobs/:digest', async (req, res) => {
    // The capture is the only value that reaches the store: a digest that
    // survived this match is pure lowercase hex, so no separator or traversal
    // sequence can be part of the key.
    const digestMatch = /^([0-9a-f]{64})$/.exec(req.params.digest);
    if (!digestMatch) throw notFound();
    const [, digest] = digestMatch;
    // The local backend keeps a path to stream; a remote one is read into
    // memory, which is bounded by the blob size the instance already caps.
    const localPath = blobs.pathFor(digest);
    const present = localPath ? existsSync(localPath) : Boolean(await blobs.stat(digest));
    if (!present) throw notFound();
    const rows = await db.Versions.findMany({
      where: { BlobDigest: digest },
      select: { Namespace: true, ExtensionId: true, Status: true, BlobSize: true },
      orderBy: { Id: 'desc' },
    });
    if (rows.length === 0) throw notFound();
    const [row] = rows;
    const isPublic = rows.some((candidate) => PUBLIC_STATUSES.has(candidate.Status));
    if (isPublic) {
      res.set('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      // Same status rule as the download route: the newest row is the one that
      // was checked out, so an unreviewed version's bytes are for the moderation
      // queue rather than for whoever holds the digest.
      if (!PUBLIC_STATUSES.has(row.Status) && !(row.Status === 'pending' && isAdmin(req.auth)))
        throw notFound();
      res.set('Cache-Control', 'private, no-store');
    }

    if (localPath) {
      if (row.BlobSize !== null && row.BlobSize !== undefined) {
        if (statSync(localPath).size !== Number(row.BlobSize)) {
          throw notFound('Blob integrity check failed.');
        }
      }
      if ((await hashFile(localPath)) !== digest) throw notFound('Blob integrity check failed.');
      res.type('application/javascript');
      res.sendFile(localPath);
      return;
    }

    const body = await blobs.read(digest).catch(() => null);
    if (!body) throw notFound();
    if (
      row.BlobSize !== null &&
      row.BlobSize !== undefined &&
      body.length !== Number(row.BlobSize)
    ) {
      throw notFound('Blob integrity check failed.');
    }
    // A remote read has no file to hash in place, so the check runs on the
    // bytes that are about to be served — which is the same question.
    if (sha256Hex(body) !== digest) throw notFound('Blob integrity check failed.');
    res.type('application/javascript').send(body);
  });

  return router;
}
