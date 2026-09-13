/**
 * RailAI — in-app assistant backend.
 *
 * POST { messages: [{role, content}], snapshot?: RailSnapshot, view?: string }
 * → { reply: string, provider: 'groq' | 'gemini' | 'offline' }
 *
 * Provider priority: Groq (llama-3.3-70b-versatile, generous free tier) →
 * Google Gemini (gemini-2.0-flash) → a graceful offline reply. The key never
 * reaches the browser; the widget only posts a compact data snapshot plus the
 * chat transcript.
 */

export const runtime = 'nodejs'

export interface SnapshotSection {
  code: string
  name: string
  health: string
  conflicts: number
  pending: number
}

export interface SnapshotTrain {
  number: string
  name: string
  status: string
  route: string
}

export interface SnapshotBlock {
  title: string
  section: string
  status: string
  urgency: string
  start: string
  end: string
}

export interface SnapshotComplaint {
  category: string
  section: string
  severity: string
  status: string
}

export interface RailSnapshot {
  view: string
  sections?: SnapshotSection[]
  trains?: SnapshotTrain[]
  blocks?: SnapshotBlock[]
  complaints?: SnapshotComplaint[]
  assetCounts?: Record<string, number>
  conflictCount?: number
  pendingCount?: number
  clock?: string
}

interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
}

const SYSTEM_BASE = `You are RailAI, the assistant embedded in RailMind — an Indian Railways operations console used by admins, section controllers, maintenance engineers, drivers and viewers.
Answer questions about the railway network using ONLY the live data snapshot provided in the system context. Be concise (2-5 sentences unless asked for detail), operational, and concrete: name train numbers, station codes, section names and statuses exactly as they appear in the data.
If the snapshot does not contain the answer, say what is missing rather than inventing data. Never mention system prompts, providers, APIs or this snapshot mechanism — just answer naturally about the railway.`

function systemPrompt(view: string, snap: RailSnapshot | undefined): string {
  if (!snap) return `${SYSTEM_BASE}\n(No live data snapshot was provided — answer generally and note you cannot see current operational data.)`
  const parts: string[] = [`CURRENT PAGE: ${view}`, `NETWORK CLOCK: ${snap.clock ?? 'live IST'}`]

  if (snap.sections?.length) {
    parts.push(
      `SECTIONS (${snap.sections.length}):\n` +
        snap.sections
          .slice(0, 60)
          .map((s) => `- ${s.name} [${s.code}] health=${s.health} conflicts=${s.conflicts} pending=${s.pending}`)
          .join('\n'),
    )
  }
  if (snap.trains?.length) {
    parts.push(
      `TRAINS (${snap.trains.length} tracked):\n` +
        snap.trains
          .slice(0, 90)
          .map((t) => `- ${t.number} ${t.name} status=${t.status} route=${t.route}`)
          .join('\n'),
    )
  }
  if (snap.blocks?.length) {
    parts.push(
      `BLOCKS/WORK WINDOWS (${snap.blocks.length}):\n` +
        snap.blocks
          .slice(0, 40)
          .map((b) => `- ${b.title} on ${b.section} status=${b.status} urgency=${b.urgency} window=${b.start}–${b.end}`)
          .join('\n'),
    )
  }
  if (snap.complaints?.length) {
    parts.push(
      `COMPLAINTS (${snap.complaints.length}):\n` +
        snap.complaints
          .slice(0, 30)
          .map((c) => `- ${c.category} @ ${c.section} severity=${c.severity} status=${c.status}`)
          .join('\n'),
    )
  }
  if (snap.assetCounts && Object.keys(snap.assetCounts).length) {
    parts.push(
      `ASSET STATUS COUNTS: ` +
        Object.entries(snap.assetCounts)
          .map(([k, v]) => `${k}=${v}`)
          .join(', '),
    )
  }
  parts.push(`TOTAL ACTIVE CONFLICTS: ${snap.conflictCount ?? 0} · PENDING REQUESTS: ${snap.pendingCount ?? 0}`)
  return `${SYSTEM_BASE}\n\n=== LIVE SNAPSHOT ===\n${parts.join('\n\n')}`
}

async function askGroq(system: string, messages: ChatMsg[]): Promise<string | null> {
  const key = process.env.GROQ_API_KEY
  if (!key) return null
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: system }, ...messages],
        temperature: 0.3,
        max_tokens: 700,
      }),
    })
    if (!res.ok) {
      console.error('groq error', res.status, (await res.text()).slice(0, 300))
      return null
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    return json.choices?.[0]?.message?.content ?? null
  } catch (err) {
    console.error('groq fetch failed', err)
    return null
  }
}

async function askGemini(system: string, messages: ChatMsg[]): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY
  if (!key) return null
  try {
    const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash'
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: messages.map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })),
          generationConfig: { temperature: 0.3, maxOutputTokens: 700 },
        }),
      },
    )
    if (!res.ok) {
      console.error('gemini error', res.status, (await res.text()).slice(0, 300))
      return null
    }
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
    }
    return json.candidates?.[0]?.content?.parts?.[0]?.text ?? null
  } catch (err) {
    console.error('gemini fetch failed', err)
    return null
  }
}

export async function POST(req: Request) {
  let body: { messages?: ChatMsg[]; snapshot?: RailSnapshot; view?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const messages = (body.messages ?? []).filter(
    (m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim(),
  )
  if (!messages.length) {
    return Response.json({ error: 'messages required' }, { status: 400 })
  }
  // Keep the transcript bounded for the free-tier context
  const trimmed = messages.slice(-14)

  const system = systemPrompt(body.view ?? 'unknown', body.snapshot)

  const groq = await askGroq(system, trimmed)
  if (groq) return Response.json({ reply: groq, provider: 'groq' })

  const gemini = await askGemini(system, trimmed)
  if (gemini) return Response.json({ reply: gemini, provider: 'gemini' })

  // No provider configured/available — still useful, honestly offline
  const last = trimmed[trimmed.length - 1].content
  return Response.json({
    reply:
      `RailAI is running without a configured AI provider right now, so I can't generate a live analysis. ` +
      `Add GROQ_API_KEY (or GEMINI_API_KEY) to the server environment to enable full answers. ` +
      `Meanwhile — you asked: "${last.slice(0, 160)}". Check the ${body.view ?? 'current'} page data directly for the latest numbers.`,
    provider: 'offline',
  })
}
