/**
 * RailAI — schedule time suggestion for a train service.
 *
 * POST { sectionCode, priority, frequency, trains?: [...], blocks?: [...] }
 * → { departure, arrival, rationale, provider }  (times "HH:MM")
 *
 * Uses Groq (text model) to reason over the section's existing traffic and
 * block windows and propose a departure/arrival pair that avoids conflicts.
 * Falls back to a deterministic heuristic when no key is configured.
 */

export const runtime = 'nodejs'

interface SnapTrain {
  number: string
  start: string
  end: string
  priority?: string
}
interface SnapBlock {
  title: string
  status: string
  start: string
  end: string
}

const PRIORITY_WINDOWS: Record<string, [string, string]> = {
  express: ['06:00', '22:00'],
  mail: ['18:00', '06:00'],
  passenger: ['05:00', '23:00'],
  freight: ['22:00', '05:00'],
}

function heuristic(sectionCode: string, priority: string, trains: SnapTrain[], blocks: SnapBlock[]) {
  const [lo, hi] = PRIORITY_WINDOWS[priority] ?? PRIORITY_WINDOWS.express
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return (h % 24) * 60 + (m || 0)
  }
  const fmt = (mins: number) => {
    const m = ((mins % 1440) + 1440) % 1440
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  }
  const loM = toMin(lo)
  let dep = loM
  const span = priority === 'freight' ? 8 * 60 : 9 * 60
  // nudge departure past any same-section train that starts within an hour
  for (let i = 0; i < 12; i++) {
    const clash = trains.some((t) => {
      const s = toMin(t.start)
      return Math.abs(s - dep) < 75
    })
    const blockHit = blocks.some((b) => {
      const bs = toMin(b.start.slice(11, 16) || b.start)
      const be = toMin(b.end.slice(11, 16) || b.end)
      return dep < be && dep + span > bs
    })
    if (!clash && !blockHit) break
    dep += 55
  }
  return {
    departure: fmt(dep),
    arrival: fmt(dep + span),
    rationale: `Departure placed inside the ${lo}–${hi} window preferred for ${priority} services on ${sectionCode}, shifted clear of ${trains.length} existing service(s) and ${blocks.length} block window(s) on this section.`,
    provider: 'heuristic' as const,
  }
}

export async function POST(req: Request) {
  let body: { sectionCode?: string; priority?: string; frequency?: string; trains?: SnapTrain[]; blocks?: SnapBlock[] }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }
  const sectionCode = String(body.sectionCode ?? '')
  const priority = String(body.priority ?? 'express')
  const frequency = String(body.frequency ?? 'daily')
  const trains = Array.isArray(body.trains) ? body.trains.slice(0, 40) : []
  const blocks = Array.isArray(body.blocks) ? body.blocks.slice(0, 20) : []

  const key = process.env.GROQ_API_KEY
  if (key) {
    try {
      const prompt =
        `You are RailAI, scheduling assistant for Indian Railways. Propose ONE departure and arrival time (IST, "HH:MM") for a NEW ${priority}-class train with ${frequency} frequency on section ${sectionCode}.\n` +
        `Existing services on this section: ${JSON.stringify(trains)}\n` +
        `Block/maintenance windows: ${JSON.stringify(blocks)}\n` +
        `Rules: avoid departing within 60 min of another service; avoid overlapping block windows; prefer daytime for passenger/express, overnight for mail/freight; journey duration 8-10 hours.\n` +
        `Reply with STRICT JSON only: {"departure":"HH:MM","arrival":"HH:MM","rationale":"<one short sentence>"}`
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          max_tokens: 1500,
        }),
      })
      if (res.ok) {
        const json = await res.json()
        const text = json.choices?.[0]?.message?.content ?? ''
        const m = text.replace(/```(?:json)?/gi, '').match(/\{[\s\S]*\}/)
        if (m) {
          const parsed = JSON.parse(m[0])
          if (/^\d{1,2}:\d{2}$/.test(parsed.departure ?? '') && /^\d{1,2}:\d{2}$/.test(parsed.arrival ?? '')) {
            return Response.json({
              departure: parsed.departure.padStart(5, '0'),
              arrival: parsed.arrival.padStart(5, '0'),
              rationale: String(parsed.rationale ?? '').slice(0, 300),
              provider: 'groq',
            })
          }
        }
      } else {
        console.error('railai/suggest error', res.status)
      }
    } catch (err) {
      console.error('railai/suggest failed', err)
    }
  }

  return Response.json(heuristic(sectionCode, priority, trains, blocks))
}
