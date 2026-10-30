import { createHash } from 'node:crypto';
import { HttpError } from './errors.js';

// A revision validator names the state of a document, not the bytes one caller
// happens to receive: the owner's view of an account and a passer-by's differ,
// and an edit has to be checked against the document either way. Every write to
// the document moves the revision, so an If-Match from before the edit no
// longer matches.
function tag(parts) {
  return `"${createHash('sha256').update(parts.join('\u0000')).digest('base64url').slice(0, 24)}"`;
}

export function userEtag(row) {
  const revision = row.UpdatedAt ?? row.CreatedAt;
  return tag(['user', String(row.Id), new Date(revision).getTime()]);
}

export function versionEtag(row) {
  return tag([
    'version',
    String(row.Id),
    row.Status,
    row.DeprecationMessage ?? '',
    row.RejectionReason ?? '',
    row.PublishedAt ? new Date(row.PublishedAt).getTime() : '',
  ]);
}

// If-Match is the header a conditional write needs: without it the server
// cannot tell "apply this to the document I read" from "apply this to whatever
// is there now", and a second editor's change would be lost silently.
export function requireIfMatch(req, etag) {
  const header = req.get('if-match');
  if (header === undefined) {
    throw new HttpError(428, {
      detail: 'Send If-Match with the ETag of the document this change is based on.',
    });
  }
  const candidates = header
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  // `*` says any current representation will do, which is a client choosing
  // last-write-wins on purpose.
  if (candidates.includes('*') || candidates.includes(etag)) return;
  throw new HttpError(412, {
    detail: 'The document changed since it was read. Read it again and reapply the change.',
  });
}
