// nothing scrapes the relay around the clock, so with GRAFANA_OTLP_URL set it pushes
// to grafana cloud over otlp/http json. names and labels pass through as they are and
// push_time_seconds is stamped like a pushgateway would, so boards and alerts don't move.

type Sample = { name: string; labels: Record<string, string>; value: number }

export function otlpEnabled(env = process.env): boolean {
  return Boolean(env.GRAFANA_OTLP_URL && env.GRAFANA_OTLP_USER && env.GRAFANA_OTLP_TOKEN)
}

// name{a="x",b="y"} value, one per line. comments, blanks and anything that is not
// a finite number are dropped.
export function parseExposition(text: string): Sample[] {
  const out: Sample[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const m = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{(.*)\})?\s+(\S+)/.exec(line)
    if (!m) continue
    const value = Number(m[3])
    if (!Number.isFinite(value)) continue
    const labels: Record<string, string> = {}
    for (const l of (m[2] ?? '').matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g)) {
      labels[l[1]] = l[2].replace(/\\(["\\])/g, '$1').replace(/\\n/g, '\n')
    }
    out.push({ name: m[1], labels, value })
  }
  return out
}

export function toOtlp(samples: Sample[], job: string, source: string, nowMs = Date.now()) {
  const time = String(BigInt(nowMs) * 1_000_000n)
  const byName = new Map<string, Sample[]>()
  for (const s of samples) byName.set(s.name, [...(byName.get(s.name) ?? []), s])
  byName.set('push_time_seconds', [{ name: 'push_time_seconds', labels: {}, value: nowMs / 1000 }])

  const metrics = [...byName].map(([name, list]) => ({
    name,
    gauge: {
      dataPoints: list.map((s) => ({
        asDouble: s.value,
        timeUnixNano: time,
        attributes: Object.entries({ ...s.labels, source }).map(([key, v]) => ({ key, value: { stringValue: v } })),
      })),
    },
  }))
  return {
    resourceMetrics: [
      {
        resource: { attributes: [{ key: 'service.name', value: { stringValue: job } }] },
        scopeMetrics: [{ metrics }],
      },
    ],
  }
}

export async function pushExposition(text: string, job: string, env = process.env): Promise<void> {
  const body = toOtlp(parseExposition(text), job, env.GRAFANA_OTLP_SOURCE || 'lobster-relay')
  const auth = Buffer.from(`${env.GRAFANA_OTLP_USER}:${env.GRAFANA_OTLP_TOKEN}`).toString('base64')
  const res = await fetch(`${(env.GRAFANA_OTLP_URL ?? '').replace(/\/$/, '')}/v1/metrics`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Basic ${auth}` },
    body: JSON.stringify(body),
    // a slow gateway must not pile up passes behind it
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`grafana otlp answered ${res.status}`)
}
