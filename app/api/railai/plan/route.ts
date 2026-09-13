/**
 * RailAI — full schedule plan generator (3C).
 *
 * POST { sections:[{code,name}], trains:[...], blocks:[...] }
 * → { summary, trains: [...proposed], blocks: [...proposed], provider }
 *
 * NEVER writes to the database — the client previews the plan and only
 * applies it when the Admin clicks "Approve & Implement" (writes then happen
 * through the regular insert APIs, so realtime propagation carries the
 * changes everywhere). "Discard" simply drops the response.
 */

export const runtime = 'nodejs'

interface SnapSection { code: string; name: string }
interface SnapTrain { number: string; name: string; section: string; start: string; end: string; priority?: string; frequency?: string; status?: string }
interface SnapBlock { title: string; section: string; start: string; end: string; status: string; urgency?: string }

export interface PlanTrain {
  train_number: string
  name: string
  section_code: string
  priority: 'express' | 'mail' | 'passenger' | 'freight'
  frequency: 'daily' | 'weekly' | 'weekdays' | 'weekends' | 'specific'
  departure: string // HH:MM
  arrival: string // HH:MM
}
export interface PlanBlock {
  title: string
  section_code: string
  start: string // HH:MM
  end: string // HH:MM
  urgency: 'low' | 'medium' | 'high'
}

const JOURNEY_HOURS: Record<string, number> = { express: 9, mail: 10, passenger: 7, freight: 8 }

function toMin(t: string): number {
  const m = t.match(/(\d{1,2}):(\d{2})/)
  if (!m) return 0
  return (Number(m[1]) % 24) * 60 + Number(m[2])
}
function fmt(mins: number): string {
  const m = ((mins % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** Deterministic fallback: one new passenger service per busy section plus
 * one nightly maintenance window per conflict-free section. */
function heuristicPlan(sections: SnapSection[], trains: SnapTrain[], blocks: SnapBlock[]): { trains: PlanTrain[]; blocks: PlanBlock[]; summary: string } {
  const bySection = new Map<string, SnapTrain[]>()
  for (const t of trains) {
    const list = bySection.get(t.section) ?? []
    list.push(t)
    bySection.set(t.section, list)
  }
  const outTrains: PlanTrain[] = []
  const outBlocks: PlanBlock[] = []
  const busy = sections.filter((s) => (bySection.get(s.code)?.length ?? 0) >= 3).slice(0, 4)
  busy.forEach((s, i) => {
    const existing = bySection.get(s.code) ?? []
    let dep = 5 * 60 + i * 40
    while (existing.some((t) => Math.abs(toMin(t.start) - dep) < 75)) dep += 55
    outTrains.push({
      train_number: `2${String(2900 + i)}`,
      name: `${s.name.split('–')[0].trim()} Connector`,
      section_code: s.code,
      priority: 'passenger',
      frequency: 'daily',
      departure: fmt(dep),
      arrival: fmt(dep + JOURNEY_HOURS.passenger * 60),
    })
  })
  const conflicted = new Set(blocks.filter((b) => b.status === 'conflict').map((b) => b.section))
  sections
    .filter((s) => !conflicted.has(s.code) && (bySection.get(s.code)?.length ?? 0) > 0)
    .slice(0, 3)
    .forEach((s, i) => {
      const existing = bySection.get(s.code) ?? []
      // maintenance in the quietest window: after the last evening departure
      const lastDep = Math.max(...existing.map((t) => toMin(t.end)), 20 * 60)
      outBlocks.push({
        title: `Scheduled inspection window ${i + 1}`,
        section_code: s.code,
        start: fmt(Math.max(lastDep + 30, 22 * 60)),
        end: fmt(Math.max(lastDep + 30, 22 * 60) + 3 * 60),
        urgency: 'low',
      })
    })
  return {
    trains: outTrains,
    blocks: outBlocks,
    summary:
      `Heuristic plan: adds ${outTrains.length} off-peak connector service(s) on the busiest sections and ${outBlocks.length} night maintenance window(s) on conflict-free sections, keeping ≥60 min separation from existing departures. Configure GROQ_API_KEY for full AI reasoning.`,
  }
}

export async function POST(req: Request) {
  let body: { sections?: SnapSection[]; trains?: SnapTrain[]; blocks?: SnapBlock[] }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }
  const sections = (body.sections ?? []).slice(0, 80)
  const trains = (body.trains ?? []).slice(0, 120)
  const blocks = (body.blocks ?? []).slice(0, 40)

  const key = process.env.GROQ_API_KEY
  if (key) {
    try {
      const prompt =
        `You are RailAI, the planning engine of an Indian Railways control room. Generate an optimized schedule plan.\n` +
        `SECTIONS: ${JSON.stringify(sections)}\nCURRENT TRAINS (number,name,section,start,end,priority,frequency,status): ${JSON.stringify(trains)}\nBLOCKS (title,section,start,end,status): ${JSON.stringify(blocks)}\n\n` +
        `Propose: 2-4 NEW train services on sections that have capacity (varying priority: express/mail/passenger/freight; sensible daily/weekly frequency), AND 2-3 maintenance block windows on sections without active conflicts, placed in low-traffic night windows.\n` +
        `Rules: new services must not depart within 60 min of existing ones on the same section; blocks must not overlap any train's run time on that section; times are IST "HH:MM"; journeys 7-10h.\n` +
        `Reply with STRICT JSON only, no markdown:\n{"summary":"<3-4 sentences explaining the reasoning and trade-offs>","trains":[{"train_number":"2xxxx","name":"...","section_code":"XXX-YYY","priority":"express|mail|passenger|freight","frequency":"daily|weekly|weekdays|weekends|specific","departure":"HH:MM","arrival":"HH:MM"}],"blocks":[{"title":"...","section_code":"XXX-YYY","start":"HH:MM","end":"HH:MM","urgency":"low|medium|high"}]}`
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 2500,
        }),
      })
      if (res.ok) {
        const json = await res.json()
        const text = (json.choices?.[0]?.message?.content ?? '').replace(/```(?:json)?/gi, '')
        const m = text.match(/\{[\s\S]*\}/)
        if (m) {
          const parsed = JSON.parse(m[0])
          if (Array.isArray(parsed.trains) && Array.isArray(parsed.blocks)) {
            const cleanTrains: PlanTrain[] = parsed.trains
              .filter((t: PlanTrain) => t.train_number && t.section_code && /^\d{1,2}:\d{2}$/.test(t.departure ?? ''))
              .slice(0, 6)
              .map((t: PlanTrain) => ({
                train_number: String(t.train_number),
                name: String(t.name ?? 'Proposed service'),
                section_code: String(t.section_code).toUpperCase(),
                priority: (['express', 'mail', 'passenger', 'freight'].includes(t.priority) ? t.priority : 'express') as PlanTrain['priority'],
                frequency: (['daily', 'weekly', 'weekdays', 'weekends', 'specific'].includes(t.frequency) ? t.frequency : 'daily') as PlanTrain['frequency'],
                departure: String(t.departure).padStart(5, '0'),
                arrival: String(t.arrival ?? '').padStart(5, '0') || fmt(toMin(t.departure) + 540),
              }))
            const cleanBlocks: PlanBlock[] = parsed.blocks
              .filter((b: PlanBlock) => b.section_code && /^\d{1,2}:\d{2}$/.test(b.start ?? ''))
              .slice(0, 5)
              .map((b: PlanBlock) => ({
                title: String(b.title ?? 'Proposed block'),
                section_code: String(b.section_code).toUpperCase(),
                start: String(b.start).padStart(5, '0'),
                end: String(b.end ?? '').padStart(5, '0') || fmt(toMin(b.start) + 180),
                urgency: (['low', 'medium', 'high'].includes(b.urgency) ? b.urgency : 'medium') as PlanBlock['urgency'],
              }))
            return Response.json({
              summary: String(parsed.summary ?? '').slice(0, 1200),
              trains: cleanTrains,
              blocks: cleanBlocks,
              provider: 'groq',
            })
          }
        }
      } else {
        console.error('railai/plan error', res.status)
      }
    } catch (err) {
      console.error('railai/plan failed', err)
    }
  }

  const { trains: t2, blocks: b2, summary } = heuristicPlan(sections, trains, blocks)
  return Response.json({ trains: t2, blocks: b2, summary, provider: 'heuristic' })
}
