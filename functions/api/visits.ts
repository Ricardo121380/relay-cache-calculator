interface Env {
  VISITS_DB: D1Database
}

interface VisitRow {
  sessions: number
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const method = context.request.method
  if (method !== 'GET' && method !== 'POST') return json({ message: 'Method not allowed' }, 405)
  if (method === 'POST') {
    const site = context.request.headers.get('Sec-Fetch-Site')
    if (site && site !== 'same-origin') return json({ message: 'Forbidden' }, 403)
  }

  const day = shanghaiDay()
  const now = new Date().toISOString()
  if (method === 'POST') {
    await context.env.VISITS_DB.prepare(
      `INSERT INTO visit_daily (day, sessions, updated_at) VALUES (?, 1, ?)
       ON CONFLICT(day) DO UPDATE SET sessions = sessions + 1, updated_at = excluded.updated_at`,
    ).bind(day, now).run()
  }

  const [today, total] = await context.env.VISITS_DB.batch<VisitRow>([
    context.env.VISITS_DB.prepare('SELECT sessions FROM visit_daily WHERE day = ?').bind(day),
    context.env.VISITS_DB.prepare('SELECT COALESCE(SUM(sessions), 0) AS sessions FROM visit_daily'),
  ])
  return json({
    date: day,
    todaySessions: today.results[0]?.sessions ?? 0,
    totalSessions: total.results[0]?.sessions ?? 0,
    updatedAt: now,
  })
}

function shanghaiDay(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  })
}
