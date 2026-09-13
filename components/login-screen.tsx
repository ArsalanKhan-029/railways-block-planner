'use client'

import { useState } from 'react'
import { TrainFront, ShieldCheck, Loader2, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/lib/auth'

/**
 * Single sign-in form: username (or email) + password against Supabase Auth.
 * No self sign-up — every account is issued by the administrator.
 */
export function LoginScreen() {
  const { signIn } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const handle = String(fd.get('username') || '')
    const password = String(fd.get('password') || '')
    setBusy(true)
    setError(null)
    const res = await signIn(handle, password)
    if (!res.ok) {
      setBusy(false)
      setError(
        res.error === 'Invalid login credentials'
          ? 'Invalid username or password'
          : (res.error ?? 'Sign-in failed'),
      )
    }
    // On success the auth session flips the app into the dashboard.
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <TrainFront className="size-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight text-white">RailMind</span>
        </div>

        <div className="max-w-md">
          <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-sidebar-border bg-sidebar-accent px-3 py-1 text-xs font-medium">
            <ShieldCheck className="size-3.5 text-sidebar-primary" />
            AI-Powered Automatic Block Planning
          </div>
          <h1 className="text-3xl font-semibold leading-tight text-balance text-white">
            Schedule maintenance without stopping the trains.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-sidebar-foreground/80">
            RailMind optimises track maintenance windows against live train
            schedules across Indian Railways sections — maximising asset
            availability while protecting punctuality.
          </p>
        </div>

        <dl className="grid grid-cols-3 gap-6">
          {[
            ['94.2%', 'Asset availability'],
            ['6', 'Live sections'],
            ['1,240+', 'Blocks planned'],
          ].map(([v, l]) => (
            <div key={l}>
              <dt className="text-2xl font-semibold text-white">{v}</dt>
              <dd className="mt-1 text-xs text-sidebar-foreground/70">{l}</dd>
            </div>
          ))}
        </dl>
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 top-1/3 size-72 rounded-full bg-sidebar-primary/20 blur-3xl"
        />
      </section>

      {/* Form panel */}
      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <TrainFront className="size-5" />
            </div>
            <span className="text-lg font-semibold tracking-tight">RailMind</span>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Access the control room dashboard.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="username">Username or email</Label>
              <Input
                id="username"
                name="username"
                autoComplete="username"
                placeholder="issued by your administrator"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>

            <Button type="submit" size="lg" className="mt-2 w-full" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <KeyRound />}
              Sign in
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Accounts are issued by your administrator — ask them if you
              don&apos;t have one yet.
            </p>
          </form>

          {error && (
            <p className="mt-4 rounded-lg border border-conflict/30 bg-conflict/5 p-3 text-xs leading-relaxed text-conflict">
              {error}
            </p>
          )}
        </div>
      </section>
    </main>
  )
}
