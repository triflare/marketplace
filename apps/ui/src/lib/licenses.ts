import * as spdxLicenseList from "spdx-license-list"

type SpdxEntry = { name?: string }

const byLowerId = new Map<string, string>()
for (const [id, entry] of Object.entries(
  spdxLicenseList as unknown as Record<string, SpdxEntry | undefined>
)) {
  if (entry?.name) {
    byLowerId.set(id.toLowerCase(), entry.name)
  }
}

// Extension metadata stores an SPDX identifier, so show the name people
// recognize and leave unknown or custom values untouched.
export function licenseName(value?: string | null): string {
  const id = value?.trim()
  if (!id) {
    return "No license listed"
  }

  return byLowerId.get(id.toLowerCase()) ?? id
}
