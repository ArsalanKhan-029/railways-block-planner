'use client'

import { useState } from 'react'
import { TrainFront, ShieldCheck, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import type { Role } from '@/lib/mock-data'

const ROLES: Role[] = ['Admin', 'Section Controller', 'Maintenance Engineer', 'Viewer']

const ROLE_BLURB: Record<Role, string> = {
  Admin: 'Full access — users, audit log, global optimisation settings.',
  'Section Controller': 'Approve blocks, resolve conflicts, run the AI planner.',
  'Maintenance Engineer': 'Raise block requests and report field issues.',
  Viewer: 'Read-only dashboards and analytics.',
}

export function LoginScreen({ onLogin }: { onLogin: (role: Role, email: string) => void }) {
  const [email, setEmail] = useState('arjun.mehta@ir.gov.in')
  const [role, setRole] = useState<Role>('Admin')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    onLogin(role, email)
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
        <form onSubmit={submit} className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <TrainFront className="size-5" />
            </div>
            <span className="text-lg font-semibold tracking-tight">RailMind</span>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Access the control room dashboard for your section.
          </p>

          <div className="mt-8 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Official email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@ir.gov.in"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" defaultValue="demo-access" required />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="role">Sign in as (demo role)</Label>
              <Select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">{ROLE_BLURB[role]}</p>
            </div>

            <Button type="submit" size="lg" className="mt-2 w-full">
              Continue to dashboard
              <ArrowRight />
            </Button>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Role selection is a demo control — production uses SSO-mapped roles.
          </p>
        </form>
      </section>
    </main>
  )
}
