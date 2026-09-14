/**
 * Push subscription save — the signed-in user registers their browser.
 *
 * POST { endpoint, keys: { p256dh, auth } }  (web-push subscription format)
 * The row is keyed to auth.uid() extracted from the caller's bearer token —
 * never from the body, so a user can only ever register their own device.
 */

import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return Response.json({ error: 'Sign-in required' }, { status: 401 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return Response.json({ error: 'Supabase not configured' }, { status: 500 })

  const client = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userErr } = await client.auth.getUser(token)
  if (userErr || !userData?.user) return Response.json({ error: 'Invalid token' }, { status: 401 })

  let sub: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  try {
    sub = await req.json()
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }
  const endpoint = sub.endpoint
  const p256dh = sub.keys?.p256dh
  const auth = sub.keys?.auth
  if (!endpoint || !p256dh || !auth) {
    return Response.json({ error: 'endpoint and keys.p256dh/keys.auth required' }, { status: 400 })
  }

  const { error } = await client.from('push_subscriptions').upsert(
    {
      user_id: userData.user.id,
      endpoint,
      p256dh,
      auth,
      user_agent: req.headers.get('user-agent')?.slice(0, 200) ?? null,
    },
    { onConflict: 'endpoint' },
  )
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
