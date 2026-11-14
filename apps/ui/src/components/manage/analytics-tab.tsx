import { useState } from "react"
import { toast } from "sonner"

import type { ExtensionDetail } from "@/lib/api"

import {
  EmptyState,
  ErrorState,
  LoadingRows,
} from "@/components/common/async-state"
import {
  ANALYTICS_SERIES,
  AnalyticsChart,
  type AnalyticsSeries,
} from "@/components/manage/analytics-chart"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useAsync } from "@/hooks/use-async"
import { formatNumber } from "@/lib/format"
import { errorMessage, th } from "@/lib/registry"

const RANGES = [7, 30, 90] as const

const SURFACE_LABELS: Record<string, string> = {
  explore: "Explore",
  search: "Search",
  profile: "Profile",
  trending: "Trending",
}

export function AnalyticsTab({ extension }: { extension: ExtensionDetail }) {
  const [days, setDays] = useState<number>(30)
  const [visible, setVisible] = useState<AnalyticsSeries[]>(
    ANALYTICS_SERIES.map((entry) => entry.key)
  )
  const [override, setOverride] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)

  const analytics = useAsync(
    (signal) =>
      th.extensions.analytics.get(
        extension.namespace,
        extension.id,
        { days },
        { signal }
      ),
    [extension.namespace, extension.id, days]
  )

  const data = analytics.status === "success" ? analytics.data : null
  const enabled = override ?? analytics.data?.enabled ?? true
  const empty = data
    ? data.daily.every(
        (point) =>
          point.views === 0 && point.impressions === 0 && point.downloads === 0
      )
    : false

  async function toggle(checked: boolean) {
    setOverride(checked)
    setSaving(true)
    try {
      await th.extensions.analytics.setEnabled(
        extension.namespace,
        extension.id,
        checked
      )
      toast.success(
        checked
          ? "Collecting views and impressions again."
          : "Collection stopped. Existing history stays."
      )
      analytics.reload()
    } catch (error) {
      setOverride(null)
      toast.error(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  function toggleSeries(key: AnalyticsSeries, checked: boolean) {
    setVisible((current) =>
      checked
        ? current.includes(key)
          ? current
          : [...current, key]
        : current.filter((entry) => entry !== key)
    )
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border p-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-medium">Collect views and impressions</p>
          <p className="max-w-xl text-xs text-muted-foreground">
            Turning this off stops new views and impressions. Daily totals
            already recorded stay.
          </p>
        </div>
        <Switch
          aria-label="Collect views and impressions"
          checked={enabled}
          disabled={saving}
          onCheckedChange={(checked) => void toggle(checked === true)}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          {RANGES.map((range) => (
            <Button
              key={range}
              size="sm"
              variant={days === range ? "secondary" : "ghost"}
              onClick={() => setDays(range)}
            >
              {range} days
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {ANALYTICS_SERIES.map((entry) => (
            <label
              key={entry.key}
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <Checkbox
                checked={visible.includes(entry.key)}
                onCheckedChange={(checked) =>
                  toggleSeries(entry.key, checked === true)
                }
              />
              <span
                aria-hidden="true"
                className="inline-block size-2 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              {entry.label}
            </label>
          ))}
        </div>
      </div>

      <section className="grid grid-cols-3 divide-x overflow-hidden rounded-lg border">
        {[
          { label: "Views", value: data?.totals.views ?? 0 },
          { label: "Impressions", value: data?.totals.impressions ?? 0 },
          { label: "Downloads", value: data?.totals.downloads ?? 0 },
        ].map((stat) => (
          <div key={stat.label} className="px-4 py-3">
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <div className="mt-0.5 font-mono text-xl tabular-nums">
              {data ? formatNumber(stat.value) : "—"}
            </div>
          </div>
        ))}
      </section>

      {analytics.status === "error" ? (
        <ErrorState
          message={analytics.error ?? "We couldn’t load these analytics."}
          onRetry={analytics.reload}
        />
      ) : !data ? (
        <LoadingRows rows={4} />
      ) : empty ? (
        <EmptyState
          title="No activity in this range"
          description="Views and impressions appear here once people open the extension or find it in a listing."
        />
      ) : (
        <AnalyticsChart points={data.daily} visible={visible} />
      )}

      {data && data.surfaces.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Where people found it</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Surface</TableHead>
                <TableHead className="text-right">Impressions</TableHead>
                <TableHead className="text-right">Distinct</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.surfaces.map((surface) => (
                <TableRow key={surface.surface}>
                  <TableCell>
                    {SURFACE_LABELS[surface.surface] ?? surface.surface}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatNumber(surface.impressions)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatNumber(surface.distinctImpressions)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {data && data.versions.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">By version</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Version</TableHead>
                <TableHead className="text-right">Views</TableHead>
                <TableHead className="text-right">Impressions</TableHead>
                <TableHead className="text-right">Downloads</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.versions.map((version) => (
                <TableRow key={version.version}>
                  <TableCell className="font-mono">{version.version}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatNumber(version.views)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatNumber(version.impressions)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatNumber(version.downloads)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  )
}
