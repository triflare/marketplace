/**
 * One account this browser is signed in to. It is the part of a session the
 * browser is allowed to see: the token that stands for it stays in the
 * HTTP-only cookie, and the app only ever names an account by its namespace.
 */
export interface AccountSummary {
  namespace: string
  displayName: string
  avatarUrl?: string | null
}
