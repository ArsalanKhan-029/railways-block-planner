/**
 * RailAI — in-app assistant backend with ACTIONS.
 *
 * POST { messages: [{role, content}], snapshot?, view?, accessToken? }
 * → { reply: string, provider: 'groq' | 'gemini' | 'offline', actions?: string[] }
 *
 * Provider priority: Groq (openai/gpt-oss-120b, generous free tier) →
 * Google Gemini (gemini-2.0-flash) → a graceful offline reply. The key never
 * reaches the browser.
 *
 * Action tools run SERVER-SIDE against Supabase using the caller's own access
 * token, so writes are attributable and role checks are enforced here — not in
 * the UI. `update_block_status` is restricted to admin / section_controller;
 * every other tool is read-only and safe for any signed-in user.
 */

export const runtime = 'nodejs'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

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
Answer questions about the railway network using ONLY the live data snapshot provided in the system context, plus any tool results returned to you. Be concise (2-5 sentences unless asked for detail), operational, and concrete: name train numbers, station codes, section names and statuses exactly as they appear in the data.
You CAN take actions when the user asks: approve/reject/flag maintenance blocks (update_block_status — controllers and admins only), find the next conflict-free maintenance window (find_safe_window), inspect a section (get_section_detail), or list running trains (list_running_trains). Prefer calling a tool over guessing when tool data would answer the question.
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

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

type ToolDef = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

const TOOLS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'find_safe_window',
      description:
        'Find the next conflict-free maintenance windows on a section within the next 24 hours — gaps with no scheduled train and no existing block. Use for "when can we work on X" questions.',
      parameters: {
        type: 'object',
        properties: {
          section_code: { type: 'string', description: 'Section code, e.g. KZJ-SC' },
          min_hours: { type: 'number', description: 'Minimum window length in hours (default 2)' },
        },
        required: ['section_code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_section_detail',
      description: 'Full operational picture of one section: trains with their daily windows, blocks by status, and open complaints.',
      parameters: {
        type: 'object',
        properties: { section_code: { type: 'string' } },
        required: ['section_code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_running_trains',
      description: 'Trains currently running (or running at a given IST time), optionally filtered to one section.',
      parameters: {
        type: 'object',
        properties: { section_code: { type: 'string', description: 'Optional section filter' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_block_status',
      description:
        'Set a maintenance block\'s status — approve, reject, pending or conflict. RESTRICTED: only admins and section controllers may call it; the server rejects other roles.',
      parameters: {
        type: 'object',
        properties: {
          block_query: { type: 'string', description: 'Block id, or a distinctive part of its title, or its section code when unambiguous' },
          status: { type: 'string', enum: ['approved', 'rejected', 'pending', 'conflict'] },
        },
        required: ['block_query', 'status'],
      },
    },
  },
]

function hToMin(t: string | null | undefined): number {
  if (!t) return NaN
  const [hh, mm] = t.split(':').map(Number)
  return (hh || 0) * 60 + (mm || 0)
}

function minToHHMM(m: number): string {
  const mm = ((m % 1440) + 1440) % 1440
  return `${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`
}

function makeUserClient(token: string | undefined): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  // With a token the tools act as that user (writes attributable, RLS as the
  // caller); without one the client is anon — enough for the read-only tools.
  return createClient(url, key, {
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : {},
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

interface Identity {
  id: string
  email: string | null
  role: string
}

async function verifyToken(token: string | undefined): Promise<Identity | null> {
  const client = makeUserClient(token)
  if (!client) return null
  try {
    const { data, error } = await client.auth.getUser(token)
    if (error || !data?.user) return null
    const { data: staff } = await client
      .from('users')
      .select('role')
      .eq('auth_user_id', data.user.id)
      .maybeSingle()
    return { id: data.user.id, email: data.user.email ?? null, role: (staff?.role ?? 'viewer').toLowerCase() }
  } catch {
    return null
  }
}

interface ToolResult {
  text: string
  action?: string
  denied?: boolean
}

async function runTool(
  name: string,
  args: Record<string, unknown>,
  client: SupabaseClient | null,
  identity: Identity | null,
): Promise<ToolResult> {
  if (!client) return { text: 'Tool unavailable: server is missing Supabase configuration.' }
  try {
    if (name === 'find_safe_window') {
      const code = String(args.section_code ?? '').trim()
      const minHours = Number(args.min_hours ?? 2) || 2
      const { data: sec } = await client.from('sections').select('id,name,code').eq('code', code).maybeSingle()
      if (!sec) return { text: `No section found with code ${code}.` }
      const { data: blocks } = await client
        .from('blocks')
        .select('title,status,start_time,end_time')
        .eq('section_id', sec.id)
        .in('status', ['approved', 'pending', 'conflict'])
      const { data: trains } = await client
        .from('trains')
        .select('train_number,name,start_time,end_time')
        .eq('section_id', sec.id)
      const now = new Date(Date.now() + 5.5 * 3_600_000)
      const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes()
      const busy: [number, number][] = []
      for (const t of trains ?? []) {
        const s = hToMin(t.start_time)
        let e = hToMin(t.end_time)
        if (Number.isNaN(s) || Number.isNaN(e)) continue
        if (e <= s) e += 1440 // overnight
        for (let day = 0; day < 2; day++) busy.push([s + day * 1440, e + day * 1440])
      }
      for (const b of blocks ?? []) {
        const st = new Date(b.start_time)
        const en = new Date(b.end_time)
        const stMin = st.getUTCHours() * 60 + st.getUTCMinutes()
        let enMin = en.getUTCHours() * 60 + en.getUTCMinutes()
        if (enMin <= stMin) enMin += 1440
        for (let day = 0; day < 2; day++) busy.push([stMin + day * 1440 - 1440, enMin + day * 1440 - 1440])
      }
      busy.sort((a, b) => a[0] - b[0])
      const need = minHours * 60
      const windows: string[] = []
      let cursor = nowMin
      for (const [bs, be] of busy) {
        if (be <= cursor) continue
        if (bs - cursor >= need) windows.push(`${minToHHMM(cursor)}–${minToHHMM(bs)} IST (${minHours}h+)`)
        cursor = Math.max(cursor, be)
        if (windows.length >= 4) break
      }
      if (windows.length < 4 && (nowMin + 1440) - cursor >= need) {
        windows.push(`${minToHHMM(cursor)}–${minToHHMM(cursor + need)} IST (overnight)`)
      }
      return {
        text: windows.length
          ? `Section ${sec.code} (${sec.name}) — next conflict-free maintenance windows (≥${minHours}h, no trains, no blocks): ${windows.join('; ')}.`
          : `Section ${sec.code} has no ≥${minHours}h gap in the next 24h — its ${trains?.length ?? 0} scheduled services and ${blocks?.length ?? 0} active blocks cover the day.`,
      }
    }

    if (name === 'get_section_detail') {
      const code = String(args.section_code ?? '').trim()
      const { data: sec } = await client.from('sections').select('id,name,code').eq('code', code).maybeSingle()
      if (!sec) return { text: `No section found with code ${code}.` }
      const [{ data: trains }, { data: blocks }, { data: complaints }] = await Promise.all([
        client.from('trains').select('train_number,name,start_time,end_time,status').eq('section_id', sec.id).limit(20),
        client.from('blocks').select('title,status,urgency,start_time,end_time').eq('section_id', sec.id).limit(15),
        client.from('complaints').select('category,severity,status').eq('section_id', sec.id).neq('status', 'resolved').limit(10),
      ])
      const tLines = (trains ?? []).map((t) => `- ${t.train_number} ${t.name} ${String(t.start_time).slice(0, 5)}–${String(t.end_time).slice(0, 5)} (${t.status})`)
      const bLines = (blocks ?? []).map((b) => `- ${b.title} [${b.status}/${b.urgency}] ${String(b.start_time).slice(0, 10)} ${String(b.start_time).slice(11, 16)}–${String(b.end_time).slice(11, 16)}`)
      const cLines = (complaints ?? []).map((c) => `- ${c.category} severity=${c.severity} status=${c.status}`)
      return {
        text: `SECTION ${sec.code} (${sec.name})\nTrains:\n${tLines.join('\n') || 'none'}\nBlocks:\n${bLines.join('\n') || 'none'}\nOpen complaints:\n${cLines.join('\n') || 'none'}`,
      }
    }

    if (name === 'list_running_trains') {
      const code = args.section_code ? String(args.section_code).trim() : null
      let secId: string | null = null
      if (code) {
        const { data: sec } = await client.from('sections').select('id').eq('code', code).maybeSingle()
        if (!sec) return { text: `No section found with code ${code}.` }
        secId = sec.id
      }
      let q = client.from('trains').select('train_number,name,start_time,end_time,status').limit(40)
      if (secId) q = q.eq('section_id', secId)
      const { data: trains } = await q
      const now = new Date(Date.now() + 5.5 * 3_600_000)
      const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes()
      const running = (trains ?? []).filter((t) => {
        const s = hToMin(t.start_time)
        let e = hToMin(t.end_time)
        if (Number.isNaN(s) || Number.isNaN(e)) return false
        if (e <= s) e += 1440
        const n = s <= nowMin ? nowMin : nowMin + 1440
        return n >= s && n <= e
      })
      return {
        text: running.length
          ? `Running now (${running.length}):\n` + running.map((t) => `- ${t.train_number} ${t.name} ${String(t.start_time).slice(0, 5)}–${String(t.end_time).slice(0, 5)} (${t.status})`).join('\n')
          : 'No trains are inside their scheduled window right now.',
      }
    }

    if (name === 'update_block_status') {
      if (!identity || !client) return { text: 'Sign-in required to change block status.', denied: true }
      const role = identity.role
      if (role !== 'admin' && role !== 'section_controller') {
        return {
          text: `Denied: role "${role}" cannot change block status — only admins and section controllers can. Ask one to review it.`,
          action: `denied update_block_status for role ${role}`,
          denied: true,
        }
      }
      const status = String(args.status ?? '')
      const query = String(args.block_query ?? '').trim()
      if (!['approved', 'rejected', 'pending', 'conflict'].includes(status)) {
        return { text: `Invalid status "${status}".` }
      }
      // resolve the block: exact id → title substring → section code
      let block: { id: string; title: string; status: string } | null = null
      const uuidish = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (uuidish.test(query)) {
        const { data } = await client.from('blocks').select('id,title,status').eq('id', query).maybeSingle()
        block = data ?? null
      }
      if (!block) {
        const { data } = await client
          .from('blocks')
          .select('id,title,status')
          .ilike('title', `%${query}%`)
          .limit(2)
        if (data?.length === 1) block = data[0]
        else if (data && data.length > 1) {
          return { text: `Ambiguous: ${data.length} blocks match "${query}" (${data.map((b) => b.title).join(', ')}). Ask for a more specific title.` }
        }
      }
      if (!block) {
        const { data: sec } = await client.from('sections').select('id,code').eq('code', query).maybeSingle()
        if (sec) {
          const { data } = await client.from('blocks').select('id,title,status').eq('section_id', sec.id).limit(2)
          if (data?.length === 1) block = data[0]
          else if (data && data.length > 1) return { text: `Section ${query} has ${data.length}+ blocks — name the block title instead.` }
        }
      }
      if (!block) return { text: `No block matches "${query}".` }
      if (block.status === status) return { text: `Block "${block.title}" is already ${status}.` }
      const { error } = await client.from('blocks').update({ status }).eq('id', block.id)
      if (error) return { text: `Update failed: ${error.message}` }
      return {
        text: `Done — block "${block.title}" is now ${status}.`,
        action: `${status.toUpperCase()} block "${block.title}" (was ${block.status})`,
      }
    }

    return { text: `Unknown tool ${name}.` }
  } catch (err) {
    return { text: `Tool ${name} failed: ${err instanceof Error ? err.message : 'error'}` }
  }
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

interface GroqToolCall {
  id: string
  type: string
  function: { name: string; arguments: string }
}
interface GroqMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: GroqToolCall[]
  tool_call_id?: string
}

async function askGroq(
  system: string,
  messages: GroqMessage[],
  withTools: boolean,
): Promise<{ content: string | null; toolCalls: GroqToolCall[] } | null> {
  const key = process.env.GROQ_API_KEY
  if (!key) return null
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
        messages: [{ role: 'system', content: system }, ...messages],
        temperature: 0.3,
        // gpt-oss emits hidden reasoning tokens that count against this
        // budget — keep generous headroom above the visible-answer cap.
        max_tokens: 2000,
        ...(withTools ? { tools: TOOLS, tool_choice: 'auto' } : {}),
      }),
    })
    if (!res.ok) {
      console.error('groq error', res.status, (await res.text()).slice(0, 300))
      return null
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string | null; tool_calls?: GroqToolCall[] } }[]
    }
    const msg = json.choices?.[0]?.message
    if (!msg) return null
    return { content: msg.content ?? null, toolCalls: msg.tool_calls ?? [] }
  } catch (err) {
    console.error('groq fetch failed', err)
    return null
  }
}

async function askGemini(system: string, messages: GroqMessage[]): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY
  if (!key) return null
  const chat = messages.filter((m) => m.role === 'user' || m.role === 'assistant')
  try {
    const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash'
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: chat.map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content ?? '' }],
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

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  let body: { messages?: ChatMsg[]; snapshot?: RailSnapshot; view?: string; accessToken?: string }
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

  const identity = await verifyToken(body.accessToken)
  const client = makeUserClient(body.accessToken)
  const system = systemPrompt(body.view ?? 'unknown', body.snapshot)
  const groqMessages: GroqMessage[] = messages
    .slice(-14)
    .map((m) => ({ role: m.role, content: m.content }))
  const actions: string[] = []

  // Round 1 — model may answer directly or call tools.
  const first = await askGroq(system, groqMessages, true)
  if (first) {
    if (first.toolCalls.length) {
      groqMessages.push({ role: 'assistant', content: first.content ?? null, tool_calls: first.toolCalls })
      for (const call of first.toolCalls) {
        let args: Record<string, unknown> = {}
        try {
          args = JSON.parse(call.function.arguments || '{}')
        } catch {
          /* model emitted non-JSON — treat as empty */
        }
        const result = await runTool(call.function.name, args, client, identity)
        if (result.action) actions.push(result.action)
        groqMessages.push({ role: 'tool', tool_call_id: call.id, content: result.text })
      }
      // Round 2 — summarize the tool results in natural language (no tools).
      const second = await askGroq(system, groqMessages, false)
      const reply = second?.content ?? first.content ?? 'Action attempted — check the app for the result.'
      return Response.json({ reply, provider: 'groq', actions: actions.length ? actions : undefined })
    }
    if (first.content) return Response.json({ reply: first.content, provider: 'groq' })
  }

  // Gemini (no tools — actions degrade to advice only).
  const gemini = await askGemini(system, groqMessages.filter((m) => m.role !== 'tool'))
  if (gemini) return Response.json({ reply: gemini, provider: 'gemini' })

  // No provider configured/available — still useful, honestly offline
  const last = messages[messages.length - 1].content
  return Response.json({
    reply:
      `RailAI is running without a configured AI provider right now, so I can't generate a live analysis. ` +
      `Add GROQ_API_KEY (or GEMINI_API_KEY) to the server environment to enable full answers. ` +
      `Meanwhile — you asked: "${last.slice(0, 160)}". Check the ${body.view ?? 'current'} page data directly for the latest numbers.`,
    provider: 'offline',
  })
}
