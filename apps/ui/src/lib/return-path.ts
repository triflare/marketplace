const FALLBACK = "/dashboard"

/**
 * A post-login destination must stay on this origin. Browsers treat backslashes
 * and control characters as URL syntax, so `/\evil.example` resolves to another
 * origin even though it starts with one slash. The API has the same rule in
 * `return-to.js`; this is the browser-side equivalent.
 */
export function safeReturnPath(
  value: string | null | undefined,
  fallback = FALLBACK
): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback
  }
  if (value.includes("\\") || value.length > 2048) {
    return fallback
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x1f || code === 0x7f) return fallback
  }
  try {
    const base = new URL("http://return-path.invalid")
    const target = new URL(value, base)
    return target.origin === base.origin ? value : fallback
  } catch {
    return fallback
  }
}
