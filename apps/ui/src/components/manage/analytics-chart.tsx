import type { AnalyticsDay } from "@/lib/api"

export type AnalyticsSeries = "views" | "impressions" | "downloads"

export const ANALYTICS_SERIES: Array<{
  key: AnalyticsSeries
  label: string
  color: string
}> = [
  { key: "views", label: "Views", color: "var(--chart-2)" },
  { key: "impressions", label: "Impressions", color: "var(--chart-1)" },
  { key: "downloads", label: "Downloads", color: "var(--chart-4)" },
]

const WIDTH = 720
const HEIGHT = 240
const PADDING = { top: 12, right: 12, bottom: 28, left: 48 }

function dayLabel(day: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`))
}

export function AnalyticsChart({
  points,
  visible,
}: {
  points: AnalyticsDay[]
  visible: AnalyticsSeries[]
}) {
  const series = ANALYTICS_SERIES.filter((entry) => visible.includes(entry.key))
  const max = Math.max(
    1,
    ...points.flatMap((point) => series.map((entry) => point[entry.key]))
  )
  const innerWidth = WIDTH - PADDING.left - PADDING.right
  const innerHeight = HEIGHT - PADDING.top - PADDING.bottom
  const x = (index: number) =>
    PADDING.left +
    (points.length <= 1
      ? innerWidth / 2
      : (index / (points.length - 1)) * innerWidth)
  const y = (value: number) =>
    PADDING.top + innerHeight - (value / max) * innerHeight
  const ticks = [0, 0.5, 1].map((fraction) => Math.round(max * fraction))
  const labels =
    points.length === 0
      ? []
      : [
          ...new Set([
            0,
            Math.floor((points.length - 1) / 2),
            points.length - 1,
          ]),
        ]

  return (
    <figure className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Daily views, impressions, and downloads"
        className="w-full text-muted-foreground"
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="currentColor"
              strokeOpacity={0.15}
            />
            <text
              x={PADDING.left - 8}
              y={y(tick) + 3}
              textAnchor="end"
              fontSize={10}
              fill="currentColor"
            >
              {tick}
            </text>
          </g>
        ))}

        {labels.map((index) => (
          <text
            key={index}
            x={x(index)}
            y={HEIGHT - 8}
            textAnchor={
              index === 0
                ? "start"
                : index === points.length - 1
                  ? "end"
                  : "middle"
            }
            fontSize={10}
            fill="currentColor"
          >
            {dayLabel(points[index].day)}
          </text>
        ))}

        {series.map((entry) => (
          <polyline
            key={entry.key}
            fill="none"
            stroke={entry.color}
            strokeWidth={2}
            strokeLinejoin="round"
            points={points
              .map((point, index) => `${x(index)},${y(point[entry.key])}`)
              .join(" ")}
          />
        ))}
      </svg>

      <table className="sr-only">
        <caption>Daily views, impressions, and downloads</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            {series.map((entry) => (
              <th key={entry.key} scope="col">
                {entry.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.day}>
              <th scope="row">{point.day}</th>
              {series.map((entry) => (
                <td key={entry.key}>{point[entry.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
