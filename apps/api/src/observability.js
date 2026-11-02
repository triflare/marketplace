import { getIntegrityErrors } from './maintenance.js';
import { productSlug } from './product.js';

// Metric names carry the product, so one Prometheus can hold several registries.
const METRIC_PREFIX = productSlug().replaceAll('-', '_');

function escapeLabel(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n');
}

// Counts requests and accumulates durations in memory, and (optionally) writes
// one JSON log line per request. The route label comes from the matched
// Express route at finish time, so unmatched requests report as "unmatched"
// rather than echoing raw paths into the metrics cardinality.
export function makeRequestTelemetry({ logRequests = false } = {}) {
  const requests = new Map();
  const durations = new Map();

  function middleware(req, res, next) {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const route = req.route ? `${req.baseUrl || ''}${req.route.path}` : 'unmatched';
      const durationMs = Number(process.hrtime.bigint() - started) / 1e6;

      const requestKey = `${req.method}|${route}|${res.statusCode}`;
      requests.set(requestKey, (requests.get(requestKey) ?? 0) + 1);

      const durationKey = `${req.method}|${route}`;
      const agg = durations.get(durationKey) ?? { sum: 0, count: 0 };
      agg.sum += durationMs / 1000;
      agg.count += 1;
      durations.set(durationKey, agg);

      if (logRequests) {
        console.log(
          JSON.stringify({
            time: new Date().toISOString(),
            msg: 'request',
            method: req.method,
            path: `${req.baseUrl || ''}${req.path}`,
            route,
            status: res.statusCode,
            durationMs: Math.round(durationMs * 100) / 100,
            ip: req.ip,
          }),
        );
      }
    });
    next();
  }

  function render() {
    const lines = [
      `# HELP ${METRIC_PREFIX}_http_requests_total HTTP requests handled, by method, route, and status.`,
      `# TYPE ${METRIC_PREFIX}_http_requests_total counter`,
    ];
    for (const [key, count] of requests) {
      const [method, route, status] = key.split('|');
      lines.push(
        `${METRIC_PREFIX}_http_requests_total{method="${escapeLabel(method)}",route="${escapeLabel(route)}",status="${status}"} ${count}`,
      );
    }
    lines.push(
      `# HELP ${METRIC_PREFIX}_http_request_duration_seconds Cumulative request duration.`,
    );
    lines.push(`# TYPE ${METRIC_PREFIX}_http_request_duration_seconds summary`);
    for (const [key, agg] of durations) {
      const [method, route] = key.split('|');
      const labels = `method="${escapeLabel(method)}",route="${escapeLabel(route)}"`;
      lines.push(
        `${METRIC_PREFIX}_http_request_duration_seconds_sum{${labels}} ${agg.sum.toFixed(6)}`,
      );
      lines.push(`${METRIC_PREFIX}_http_request_duration_seconds_count{${labels}} ${agg.count}`);
    }
    return lines;
  }

  return { middleware, render };
}

// Grouped counts are kept as raw reads: each is one aggregate the typed client
// would still issue as its own round trip, and the BigInt results are folded to
// numbers at the gauge.
export async function renderRegistryMetrics(db, telemetry) {
  const [byStatus, users, extensions, downloads, storage] = await Promise.all([
    db.$queryRaw`SELECT "Status", COUNT(*)::bigint AS count FROM "Versions" GROUP BY "Status"`,
    db.$queryRaw`SELECT COUNT(*)::bigint AS count FROM "Users"`,
    db.$queryRaw`SELECT COUNT(DISTINCT ("Namespace", "ExtensionId"))::bigint AS count FROM "Versions"
        WHERE "Status" IN ('published', 'deprecated')`,
    db.$queryRaw`SELECT COALESCE(SUM("TotalDownloads"), 0)::bigint AS total FROM "ExtensionDailyDownloads"`,
    db.$queryRaw`SELECT COALESCE(SUM("BlobSize"), 0)::bigint AS blob,
               COALESCE(SUM("SourceSize"), 0)::bigint AS source
        FROM "Versions"`,
  ]);

  const lines = [];
  const gauge = (name, help, value, labels = '') => {
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} gauge`);
    lines.push(`${name}${labels} ${value}`);
  };

  gauge(`${METRIC_PREFIX}_users_total`, 'Registered accounts.', Number(users[0].count));
  gauge(
    `${METRIC_PREFIX}_extensions_published_total`,
    'Extensions with at least one published version.',
    Number(extensions[0].count),
  );
  for (const row of byStatus) {
    gauge(
      `${METRIC_PREFIX}_versions_total`,
      'Versions by review status.',
      Number(row.count),
      `{status="${escapeLabel(row.Status)}"}`,
    );
  }
  gauge(
    `${METRIC_PREFIX}_downloads_total`,
    'Total recorded downloads.',
    Number(downloads[0].total),
  );
  gauge(
    `${METRIC_PREFIX}_storage_bytes`,
    'Charged storage by artifact kind.',
    Number(storage[0].blob),
    '{kind="blob"}',
  );
  gauge(
    `${METRIC_PREFIX}_storage_bytes`,
    'Charged storage by artifact kind.',
    Number(storage[0].source),
    '{kind="source"}',
  );
  gauge(
    `${METRIC_PREFIX}_storage_integrity_errors`,
    'Blobs that failed or could not complete the last integrity scrub.',
    getIntegrityErrors(),
  );
  gauge(
    `${METRIC_PREFIX}_process_uptime_seconds`,
    'Seconds since the server process started.',
    Math.floor(process.uptime()),
  );

  lines.push(...telemetry.render());
  return `${lines.join('\n')}\n`;
}
