'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'

/**
 * Web Push for drivers (and anyone who enables it).
 *
 * - Requests Notification permission and subscribes via the service worker
 *   using NEXT_PUBLIC_VAPID_PUBLIC_KEY.
 * - Saves the subscription server-side keyed to the signed-in user.
 * - Exposes `enabled` (subscribed) and `enable()` (ask + subscribe) plus the
 *   current permission so Settings can render a real toggle.
 *
 * Degrades gracefully: everything no-ops on browsers without Push or when
 * the VAPID key isn't configured.
 */

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function usePush() {
  const { accessToken } = useAuth()
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default')
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPermission('unsupported')
      return
    }
    setPermission(Notification.permission)
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setEnabled(Boolean(sub)))
      .catch(() => {})
  }, [])

  const enable = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (permission === 'unsupported') return { ok: false, error: 'Push is not supported in this browser.' }
    if (!accessToken) return { ok: false, error: 'Sign in first.' }
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!key) return { ok: false, error: 'Push is not configured on the server.' }
    setBusy(true)
    try {
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') return { ok: false, error: 'Notification permission was denied.' }

      const reg = await navigator.serviceWorker.ready
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key) as unknown as BufferSource,
        })
      }
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(json),
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        return { ok: false, error: err.error ?? 'Subscription save failed.' }
      }
      setEnabled(true)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Subscription failed.' }
    } finally {
      setBusy(false)
    }
  }, [accessToken, permission])

  return { permission, enabled, busy, enable }
}
