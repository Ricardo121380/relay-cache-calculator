import { useEffect, useState } from 'react'

interface VisitStats {
  date: string
  todaySessions: number
  totalSessions: number
  updatedAt: string
}

const SESSION_KEY = 'relay-cache-calculator:visit-counted'

export function VisitCounter() {
  const [stats, setStats] = useState<VisitStats | null>(null)

  useEffect(() => {
    let active = true
    const counted = sessionStorage.getItem(SESSION_KEY) === '1'
    fetch('/api/visits', {
      method: counted ? 'GET' : 'POST',
      credentials: 'omit',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
      .then((response) => response.ok ? response.json() as Promise<VisitStats> : Promise.reject())
      .then((value) => {
        if (!counted) sessionStorage.setItem(SESSION_KEY, '1')
        if (active) setStats(value)
      })
      .catch(() => undefined)
    return () => { active = false }
  }, [])

  if (!stats) return null
  return (
    <span className="visit-counter" aria-label="网站访问会话统计">
      今日访问 {stats.todaySessions.toLocaleString()} 次 · 累计访问 {stats.totalSessions.toLocaleString()} 次
    </span>
  )
}
