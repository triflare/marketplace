import { readFile, stat, unlink } from 'node:fs/promises';
import {
  BLOB_GC_LOCK_KEY,
  blobPathFor,
  sha256Hex,
  sha512Base64,
  storeBlob,
  storeBlobBuffer,
} from './blobs.js';
import { withLocks } from './locks.js';

// Where a blob digest lives, as a key a storage driver understands. The layout
// is the one the local store has always used, so an instance that switches to a
// remote backend finds its keys where a copy of the data directory would put
// them: blobs/<first two hex>/<rest>.
export function storageKeyFor(digest) {
  return `blobs/${digest.slice(0, 2)}/${digest.slice(2)}`;
}

// The blob store the request path uses. It resolves the storage driver on every
// call, so switching backends through the driver host takes effect on the next
// request, and keeps the local filesystem fast paths (streaming a response,
// deduplicating by inode, unlinking under the GC lock) for the backend that has
// them. A remote driver is addressed by the same digest keys, so the two are
// interchangeable as long as the data itself was moved.
export function createBlobStore({ config, drivers, log = console }) {
  function instance() {
    return drivers?.get?.('storage') ?? null;
  }

  function kind() {
    return instance()?.driver ?? 'local';
  }

  const store = {
    kind,
    get isLocal() {
      return kind() === 'local';
    },

    // The absolute path, for the local backend only. Routes use it to stream a
    // response rather than buffering one.
    pathFor(digest) {
      return store.isLocal ? blobPathFor(config.dataDir, digest) : null;
    },

    async put(buffer) {
      if (store.isLocal) return storeBlobBuffer(config.dataDir, buffer);
      const digest = sha256Hex(buffer);
      // Digest addressed, so the object that is already there is the object
      // this call would write. Asking first keeps a re-publish of the same
      // bytes from uploading them again.
      if (await store.stat(digest)) {
        return { digest, size: buffer.length, sha512: sha512Base64(buffer) };
      }
      await instance().put(storageKeyFor(digest), buffer);
      return { digest, size: buffer.length, sha512: sha512Base64(buffer) };
    },

    // The same write for a caller that already staged the upload on disk. The
    // local backend stages through that path so a large file is moved rather
    // than copied twice; a remote one has to read the bytes, because there is
    // no rename across the network.
    async putStaged(tmpPath, buffer) {
      if (store.isLocal) return storeBlob(config.dataDir, tmpPath, buffer);
      return store.put(buffer);
    },

    async read(digest) {
      if (store.isLocal) return readFile(blobPathFor(config.dataDir, digest));
      return instance().get(storageKeyFor(digest));
    },

    async stat(digest) {
      if (store.isLocal) {
        try {
          return { bytes: (await stat(blobPathFor(config.dataDir, digest))).size };
        } catch (error) {
          if (error.code === 'ENOENT') return null;
          throw error;
        }
      }
      return instance().stat(storageKeyFor(digest));
    },

    async remove(digest) {
      if (store.isLocal) {
        try {
          await unlink(blobPathFor(config.dataDir, digest));
          return true;
        } catch (error) {
          if (error.code === 'ENOENT') return false;
          throw error;
        }
      }
      return Boolean(await instance().delete(storageKeyFor(digest)));
    },

    // True when no version and no profile image points at the digest any more.
    // The two reads are one query each against the transaction the caller
    // already holds, so the answer is a fact about the same snapshot the delete
    // belongs to.
    async unusedInTx(tx, digest, exceptId) {
      if (!digest) return false;
      // `id != NULL` is never true in SQL, so a null exceptId has to drop the
      // clause entirely rather than filter on it.
      const keeper = await tx.Versions.findFirst({
        where: {
          BlobDigest: digest,
          ...(exceptId === null || exceptId === undefined ? {} : { Id: { not: exceptId } }),
        },
        select: { Id: true },
      });
      if (keeper) return false;
      const profile = await tx.Users.findFirst({
        where: { OR: [{ AvatarBlobDigest: digest }, { BannerBlobDigest: digest }] },
        select: { Id: true },
      });
      return !profile;
    },
  };

  // The GC lock keeps a publish of the same digest from landing between the
  // reference check and the delete: publishers hold the shared lock from before
  // their write until the version row commits.
  store.removeIfUnused = async (db, digest, exceptId) => {
    if (!digest) return false;
    return withLocks(db, [BLOB_GC_LOCK_KEY], async (tx) => {
      if (!(await store.unusedInTx(tx, digest, exceptId))) return false;
      return store.remove(digest);
    });
  };

  store.removeIfUnusedInTx = async (tx, digest, exceptId) => {
    if (!digest) return false;
    if (!(await store.unusedInTx(tx, digest, exceptId))) return false;
    return store.remove(digest);
  };

  // A sweep enumerates the backend, which the driver interface has no call for:
  // a remote bucket is listed by the operator's own lifecycle rules or an
  // out-of-band job, not by the server. Local disk is swept as it always was.
  store.canSweep = () => store.isLocal;

  store.sweepHint = () =>
    `The ${kind()} storage driver cannot be swept from inside the server; leave collection to a bucket lifecycle rule.`;

  void log;
  return store;
}
