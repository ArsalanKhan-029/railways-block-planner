'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Upload,
  MapPin,
  Loader2,
  ImageIcon,
  X,
  CircleCheck,
  Filter,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { COMPLAINTS, SECTIONS, type Complaint } from '@/lib/mock-data'
import { cn } from '@/lib/utils'

const CATEGORIES: Complaint['category'][] = [
  'Track Defect',
  'Signal Fault',
  'Safety Hazard',
  'Block Overrun',
  'Other',
]
const SEVERITIES = ['Low', 'Medium', 'High'] as const

const SEVERITY_VARIANT = { High: 'danger', Medium: 'warning', Low: 'neutral' } as const
const STATUS_VARIANT = {
  New: 'info',
  'Linked to Block': 'warning',
  Resolved: 'success',
} as const

export function ReportIssueView() {
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number]>('Medium')
  const [photo, setPhoto] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [location, setLocation] = useState<string>('')
  const [locating, setLocating] = useState(true)
  const [submitted, setSubmitted] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('All')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      setLocation('19.0760° N, 72.8777° E · nr. km 142, Mumbai–Pune Section')
      setLocating(false)
    }, 2000)
    return () => clearTimeout(t)
  }, [])

  function handleFile(file?: File) {
    if (!file) return
    const url = URL.createObjectURL(file)
    setPhoto(url)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    setTimeout(() => setSubmitted(false), 3500)
  }

  const filtered =
    statusFilter === 'All' ? COMPLAINTS : COMPLAINTS.filter((c) => c.status === statusFilter)

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,420px)_1fr]">
      {/* Form */}
      <Card className="h-fit">
        <CardContent className="p-5">
          <h2 className="text-sm font-semibold">Report an Issue</h2>
          <p className="text-sm text-muted-foreground">
            Field reports are auto-linked to affected sections &amp; blocks.
          </p>

          {submitted && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-approved/30 bg-approved/10 p-3 text-sm text-approved">
              <CircleCheck className="size-4" />
              Issue submitted — reference #IR-5590 created.
            </div>
          )}

          <form onSubmit={submit} className="mt-5 space-y-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="category">Category</Label>
              <Select id="category" defaultValue="Track Defect">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="section">Section</Label>
              <Select id="section" defaultValue={SECTIONS[0].name}>
                {SECTIONS.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="desc">Description</Label>
              <Textarea id="desc" placeholder="Describe the fault, location detail and any immediate risk…" required />
            </div>

            {/* Photo upload */}
            <div className="flex flex-col gap-1.5">
              <Label>Photo evidence</Label>
              {photo ? (
                <div className="relative overflow-hidden rounded-lg border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo} alt="Uploaded evidence preview" className="h-40 w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setPhoto(null)}
                    className="absolute right-2 top-2 rounded-md bg-foreground/70 p-1 text-background hover:bg-foreground"
                    aria-label="Remove photo"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragging(true)
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragging(false)
                    handleFile(e.dataTransfer.files?.[0])
                  }}
                  className={cn(
                    'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors',
                    dragging ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
                  )}
                >
                  <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <ImageIcon className="size-5" />
                  </span>
                  <span className="text-sm font-medium">Drag &amp; drop a photo</span>
                  <span className="text-xs text-muted-foreground">or click to browse · PNG, JPG up to 10MB</span>
                  <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary">
                    <Upload className="size-3.5" /> Choose file
                  </span>
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>

            {/* Location */}
            <div className="flex flex-col gap-1.5">
              <Label>Location</Label>
              <div className="rounded-lg border border-border p-3">
                {locating ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Fetching your location…
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="flex size-16 shrink-0 items-center justify-center rounded-md bg-train/10">
                      <MapPin className="size-6 text-train" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Location captured</p>
                      <p className="text-xs text-muted-foreground">{location}</p>
                      <span className="mt-1.5 inline-flex items-center gap-1 text-xs text-approved">
                        <CircleCheck className="size-3" /> GPS accuracy ±8m
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Severity */}
            <div className="flex flex-col gap-1.5">
              <Label>Severity</Label>
              <div className="grid grid-cols-3 gap-2">
                {SEVERITIES.map((s) => {
                  const active = severity === s
                  const tone =
                    s === 'High'
                      ? 'border-conflict text-conflict bg-conflict/10'
                      : s === 'Medium'
                        ? 'border-pending text-pending-foreground bg-pending/25'
                        : 'border-border text-muted-foreground bg-muted/40'
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSeverity(s)}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-sm font-medium transition-all',
                        active ? tone : 'border-border text-muted-foreground hover:bg-muted/50',
                      )}
                    >
                      {s}
                    </button>
                  )
                })}
              </div>
            </div>

            <Button type="submit" className="w-full" size="lg">
              Submit issue report
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Complaints table */}
      <Card className="h-fit">
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
            <div>
              <h2 className="text-sm font-semibold">Submitted Complaints</h2>
              <p className="text-sm text-muted-foreground">{filtered.length} reports</p>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="size-4 text-muted-foreground" />
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-8 w-40"
                aria-label="Filter by status"
              >
                <option value="All">All statuses</option>
                <option value="New">New</option>
                <option value="Linked to Block">Linked to Block</option>
                <option value="Resolved">Resolved</option>
              </Select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Photo</th>
                  <th className="px-3 py-3 font-medium">Category</th>
                  <th className="px-3 py-3 font-medium">Location</th>
                  <th className="px-3 py-3 font-medium">Severity</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/40">
                    <td className="px-5 py-3">
                      <div className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <ImageIcon className="size-4" />
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-medium">{c.category}</p>
                      <p className="text-xs text-muted-foreground">{c.section}</p>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{c.location}</td>
                    <td className="px-3 py-3">
                      <Badge variant={SEVERITY_VARIANT[c.severity]}>{c.severity}</Badge>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant={STATUS_VARIANT[c.status]}>{c.status}</Badge>
                    </td>
                    <td className="px-5 py-3 text-xs text-muted-foreground">{c.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
