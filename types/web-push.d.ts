/** Minimal ambient types for web-push (only the APIs RailMind uses). */
declare module 'web-push' {
  interface VapidKeys {
    publicKey: string
    privateKey: string
  }
  interface PushSubscription {
    endpoint: string
    keys: { p256dh: string; auth: string }
  }
  interface RequestOptions {
    TTL?: number
    headers?: Record<string, string>
  }
  export function generateVAPIDKeys(): VapidKeys
  export function setVapidDetails(subject: string, publicKey: string, privateKey: string): void
  export function sendNotification(
    subscription: PushSubscription,
    payload?: string | Buffer | null,
    options?: RequestOptions,
  ): Promise<unknown>
}
