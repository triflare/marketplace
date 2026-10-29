import { formatBytes, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"

// The registry resolves an account with no cap of its own to
// limits.maxAccountBlobBytes. This documented default is only used when the
// admin config cannot be read, so the meter still has a real scale.
export const FALLBACK_ACCOUNT_QUOTA = 64 * 1024 * 1024

export function StorageUsage({
  namespace,
  usedBytes,
  maxBlobBytes,
  defaultLimit,
  defaultIsAssumed = false,
}: {
  namespace: string
  usedBytes: number
  /** The account's own cap, or null when it follows the registry default. */
  maxBlobBytes: number | null
  defaultLimit: number
  defaultIsAssumed?: boolean
}) {
  const isDefault = maxBlobBytes === null
  const limit = maxBlobBytes ?? defaultLimit
  const percent = limit > 0 ? (usedBytes / limit) * 100 : 0
  const fill = Math.min(Math.max(percent, 0), 100)
  const rounded = Math.round(percent)
  const remaining = limit - usedBytes
  const over = percent >= 100
  const near = !over && percent >= 80
  const readout = `${formatBytes(usedBytes)} of ${formatBytes(limit)} used (${rounded}%)`

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm">
          <span className="font-mono text-xs">@{namespace}</span> uses{" "}
          <span className="font-medium">{formatBytes(usedBytes)}</span> of{" "}
          <span className="font-medium">{formatBytes(limit)}</span>
        </p>
        <span
          className={cn(
            "font-mono text-xs",
            over
              ? "text-destructive"
              : near
                ? "text-amber-600 dark:text-amber-400"
                : "text-muted-foreground"
          )}
        >
          {rounded}%
        </span>
      </div>

      <div
        role="progressbar"
        aria-label={`Storage used by @${namespace}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fill)}
        aria-valuetext={readout}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            over ? "bg-destructive" : near ? "bg-amber-500" : "bg-primary"
          )}
          style={{ width: `${fill}%` }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="rounded border px-1.5 py-0.5">
          {isDefault ? "Default limit" : "Custom limit"}
        </span>
        <span>
          {over
            ? `${formatBytes(Math.abs(remaining))} over`
            : `${formatBytes(remaining)} left`}
        </span>
        {isDefault ? (
          <span>
            · registry default {formatBytes(defaultLimit)}
            {defaultIsAssumed ? " (settings unreadable, assumed)" : ""}
          </span>
        ) : null}
        <span className="font-mono text-[10px]">
          · {formatNumber(usedBytes)} / {formatNumber(limit)} bytes
        </span>
      </div>

      {over ? (
        <p className="text-xs text-destructive">
          Over the limit: publishes and source uploads for this handle are
          refused until usage drops or the limit is raised.
        </p>
      ) : near ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Close to the limit. The next publish may be refused.
        </p>
      ) : null}
    </div>
  )
}
