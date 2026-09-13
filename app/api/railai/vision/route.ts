/**
 * RailAI — image analysis for complaint triage.
 *
 * POST { imageDataUrl: string }  (base64 data URL of the uploaded photo)
 * → { priority: 'low' | 'medium' | 'high', reason: string, provider: 'gemini' }
 * → { error: string }  when no vision provider is configured / the call fails
 *
 * Groq's current free catalog is text-only (verified Sept 2026 — image parts
 * are rejected), so vision analysis runs on Google Gemini's free tier
 * (gemini-2.0-flash multimodal). The key stays server-side; the client only
 * posts the image data URL it already holds in memory. The returned priority
 * is a SUGGESTION — the UI never locks the user's manual choice.
 */

export const runtime = 'nodejs'

const VISION_PROMPT = `You are a railway maintenance triage assistant for Indian Railways.
Analyze the uploaded photo of a reported railway issue (track, signal equipment, bridge, station infrastructure, debris, etc.).
Judge severity ONLY from what is visibly damaged or dangerous:
- "high": structural damage, broken rails, large cracks, derailed equipment, fire/smoke risk, anything that could derail trains or injure people.
- "medium": visible wear, moderate cracks, damaged smaller components, debris on or near the track that looks manageable, equipment in poor condition but still standing.
- "low": minor cosmetic issues, small litter, slight rust, anything that does not impede operations.
If the photo does not show railway infrastructure at all, use "low" and say so.

Respond with STRICT JSON only (no markdown, no code fences):
{"priority": "low" | "medium" | "high", "reason": "<one short sentence describing what you see>"} `

interface VisionResult {
  priority: 'low' | 'medium' | 'high'
  reason: string
  provider: 'gemini'
}

function parsePriority(text: string): { priority: 'low' | 'medium' | 'high'; reason: string } | null {
  // tolerate stray code fences
  const cleaned = text.replace(/```(?:json)?/gi, '').trim()
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[0]) as { priority?: string; reason?: string }
    const p = (parsed.priority ?? '').toLowerCase()
    if (p !== 'low' && p !== 'medium' && p !== 'high') return null
    return { priority: p, reason: (parsed.reason ?? '').slice(0, 300) }
  } catch {
    return null
  }
}

async function askGeminiVision(imageDataUrl: string): Promise<VisionResult | null> {
  const key = process.env.GEMINI_API_KEY
  if (!key) return null
  const m = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
  if (!m) return null
  const [, mimeType, data] = m

  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash'
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: VISION_PROMPT },
                { inline_data: { mime_type: mimeType, data } },
              ],
            },
          ],
          generationConfig: { temperature: 0.1, maxOutputTokens: 300 },
        }),
      },
    )
    if (!res.ok) {
      console.error('gemini vision error', res.status, (await res.text()).slice(0, 300))
      return null
    }
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
    }
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
    const parsed = parsePriority(text)
    if (!parsed) return null
    return { ...parsed, provider: 'gemini' as const }
  } catch (err) {
    console.error('gemini vision fetch failed', err)
    return null
  }
}

export async function POST(req: Request) {
  let body: { imageDataUrl?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.imageDataUrl || typeof body.imageDataUrl !== 'string') {
    return Response.json({ error: 'imageDataUrl required' }, { status: 400 })
  }
  // ~8MB base64 guard (free tier inline limit is well under this)
  if (body.imageDataUrl.length > 11_000_000) {
    return Response.json({ error: 'Image too large for analysis' }, { status: 413 })
  }

  const result = await askGeminiVision(body.imageDataUrl)
  if (result) return Response.json(result)

  return Response.json(
    {
      error:
        'AI image analysis is unavailable. Add GEMINI_API_KEY (https://aistudio.google.com/apikey) to the server environment — Groq no longer offers a vision model on its free tier.',
    },
    { status: 503 },
  )
}
