export function formatNumber(
  value: number | string | null | undefined
): string {
  if (value === null || value === undefined || value === "") {
    return "0"
  }

  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return String(value)
  }

  return new Intl.NumberFormat("en").format(numeric)
}

export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B"
  }

  const units = ["B", "KB", "MB", "GB", "TB"]
  const exponent = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1
  )
  const amount = value / 1024 ** exponent
  return `${new Intl.NumberFormat("en", {
    maximumFractionDigits: exponent === 0 ? 0 : 1,
  }).format(amount)} ${units[exponent]}`
}

export function formatDate(value?: string | null): string {
  if (!value) {
    return "Unknown"
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "Unknown"
  }

  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date)
}

export function formatRelative(value?: string | null): string {
  if (!value) {
    return "Unknown"
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "Unknown"
  }

  const seconds = Math.round((date.getTime() - Date.now()) / 1000)
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["week", 60 * 60 * 24 * 7],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
  ]

  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" })
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) {
      return formatter.format(Math.round(seconds / size), unit)
    }
  }

  return "just now"
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/[\s-_]+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("")
}

export function pluralize(
  count: number,
  singular: string,
  plural = `${singular}s`
): string {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`
}

export function compactDescription(description?: string | null): string {
  return description?.trim() || "No description yet."
}

const NOTIFICATION_LABELS: Record<string, string> = {
  "review.approved": "Review approved",
  "review.rejected": "Changes requested",
  "extension.owner.invited": "Owner invitation",
  "extension.transfer.requested": "Ownership transfer",
  "terms.updated": "Terms updated",
  "token.revoked": "Token revoked",
  "account.role.changed": "Account access changed",
  announcement: "Announcement",
}

export function humanizeKind(kind: string): string {
  if (NOTIFICATION_LABELS[kind]) {
    return NOTIFICATION_LABELS[kind]
  }

  const words = kind.replace(/[._-]+/g, " ").trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Update"
}
