// The stored column is an integer even when the request spelled the version as
// a string. Anything else is passed through as null so the normal check turns
// it into a field error.
export function privacyVersionNumber(value) {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return null;
}

// What an account-creating request has to say about the privacy policy. A
// registry that publishes none has nothing to accept, so registration stays
// open there and no record is written.
export async function checkPrivacyAcceptance(db, value, { path = '/privacy' } = {}) {
  const document = await db.LegalDocuments.findUnique({
    where: { Kind: 'privacy' },
    select: { Version: true },
  });
  if (!document) return { version: null, errors: [] };

  const version = Number(document.Version);
  if (value === undefined) {
    return {
      version,
      errors: [
        {
          field: 'privacyAcceptedVersion',
          message: 'Accept the privacy policy to create an account.',
        },
      ],
    };
  }

  const wellFormed =
    (typeof value === 'number' && Number.isInteger(value)) ||
    (typeof value === 'string' && /^\d+$/.test(value));
  if (!wellFormed || String(value) !== String(version)) {
    return {
      version,
      errors: [
        {
          field: 'privacyAcceptedVersion',
          message: `Must be the current privacy policy version ${version}. Read GET ${path} to see it.`,
        },
      ],
    };
  }
  return { version, errors: [] };
}
