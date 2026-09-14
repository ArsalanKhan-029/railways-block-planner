/**
 * Web Push send — internal fan-out called after notification inserts.
 *
 * POST { userAuthIds: string[], title, body, url?, tag?, severity? }
 *
 * Looks up every push subscription for the given auth-user ids and delivers
 * the payload via web-push. Failed/expired subscriptions (404/410) are
 * pruned. Requires VAPID_PRIVATE_KEY + NEXT_PUBLIC_VAPID_PUBLIC_KEY.
 */

import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

export const runtime = 'nodejs'

interface SubRow {
  endpoint: string
  p256dh: string
  auth: string
}

function serviceClient(): ReturnType<typeof createClient> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  // service role bypasses RLS so the server can read any subscription; fall
  // back to anon (works only if policies allow the read) to stay functional
  const key = serviceKey ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function vapidConfigured(): boolean {
  return Boolean(process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)
}

export async function POST(req: Request) {
  let body: { userAuthIds?: string[]; title?: string; body?: string; url?: string; tag?: string; severity?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }
  const { userAuthIds = [], title = 'RailMind', body: text = '', url = '/', tag = 'railmind', severity } = body
  if (!userAuthIds.length || !text) return Response.json({ error: 'userAuthIds and body required' }, { status: 400 })
  if (!vapidConfigured()) return Response.json({ sent: 0, reason: 'vapid-not-configured' })

  const client = serviceClient()
  if (!client) return Response.json({ sent: 0, reason: 'no-supabase' })

  const { data: subs, error } = await client
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('user_id', userAuthIds)
  if (error) return Response.json({ sent: 0, reason: error.message }, { status: 500 })
  if (!subs?.length) return Response.json({ sent: 0, reason: 'no-subscriptions' })

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:railmind@byteforce.app',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )

  const payload = JSON.stringify({ title, body: text, url, tag, severity })
  const dead: string[] = []
  let sent = 0
  await Promise.all(
    (subs as (SubRow & { id: string })[]).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        )
        sent += 1
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) dead.push(s.id)
      }
    }),
  )
  if (dead.length) await client.from('push_subscriptions').delete().in('id', dead)
  return Response.json({ sent, pruned: dead.length })
}
