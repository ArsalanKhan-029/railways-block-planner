'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { Complaint } from '@/lib/mock-data'
import { toComplaints } from '@/lib/mappers'
import { insertComplaint, uploadComplaintPhoto, updateComplaintStatus, deleteComplaint } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { ConfirmDelete } from '@/components/confirm-delete'
import { useRailData } from '@/lib/use-rail-data'
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

interface Coords {
  lat: number | null
  lon: number | null
  accuracy: number | null
  failed?: boolean
}

export function ReportIssueView() {
  const { sections, complaints, refresh, loading, error } = useRailData()
  const { identity } = useAuth()
  const isAdmin = identity?.role === 'admin'
  const [pendingDelete, setPendingDelete] = useState<{ id: string; label: string } | null>(null)
  const [severity, setSeverity] = useState<(typeof SEVERITIES)[number]>('Medium')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photo, setPhoto] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [coords, setCoords] = useState<Coords>({ lat: null, lon: null, accuracy: null })
  const [locating, setLocating] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submittedRef, setSubmittedRef] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('All')
  const fileRef = useRef<HTMLInputElement>(null)

  // Browser geolocation (falls back gracefully if denied / unavailable)
  useEffect(() => {
    let done = false
    const finish = (c: Coords) => {
      if (!done) {
        setCoords(c)
        setLocating(false)
        done = true
      }
    }
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          finish({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          }),
        () => finish({ lat: null, lon: null, accuracy: null, failed: true }),
        { enableHighAccuracy: true, timeout: 8000 },
      )
    } else {
      finish({ lat: null, lon: null, accuracy: null, failed: true })
    }
    return () => {
      done = true
    }
  }, [])

  // ----- AI vision triage (suggestion only — manual severity stays master) -----
  const [aiSuggestion, setAiSuggestion] = useState<{ priority: 'low' | 'medium' | 'high'; reason: string } | null>(null)
  const [aiState, setAiState] = useState<'idle' | 'analyzing' | 'error'>('idle')
  const [aiError, setAiError] = useState<string | null>(null)

  async function analyzePhoto(file: File) {
    setAiState('analyzing')
    setAiError(null)
    setAiSuggestion(null)
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('read failed'))
        reader.readAsDataURL(file)
      })
      const res = await fetch('/api/railai/vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: dataUrl }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setAiError(String(json.error ?? 'Analysis failed'))
        setAiState('error')
        return
      }
      setAiSuggestion({ priority: json.priority, reason: json.reason })
      setAiState('idle')
    } catch {
      setAiError('Could not reach the analysis service.')
      setAiState('error')
    }
  }

  function handleFile(file?: File) {
    if (!file) return
    setPhotoFile(file)
    setPhoto(URL.createObjectURL(file))
    // non-blocking: the user keeps filling the form while AI analyzes
    void analyzePhoto(file)
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const category = String(fd.get('category') || 'Other')
    const sectionId = String(fd.get('section') || '')
    const description = String(fd.get('desc') || '').trim()
    if (!description) return

    setSubmitting(true)
    try {
      const photoUrl = photoFile ? await uploadComplaintPhoto(photoFile) : null
      const { data, error: insertError } = await insertComplaint({
        section_id: sectionId || null,
        category,
        description,
        severity: severity.toLowerCase() as 'low' | 'medium' | 'high',
        photo_url: photoUrl,
        latitude: coords.lat,
        longitude: coords.lon,
      })
      if (insertError) throw insertError
      const shortId = data?.[0]?.id ? String(data[0].id).slice(0, 8).toUpperCase() : null
      setSubmittedRef(shortId ? `#IR-${shortId}` : null)
      ;(e.target as HTMLFormElement).reset()
      setPhoto(null)
      setPhotoFile(null)
      setAiSuggestion(null)
      setAiState('idle')
      refresh()
    } catch {
      setSubmittedRef(null)
    } finally {
      setSubmitting(false)
    }
  }

  const mapped = useMemo(() => toComplaints(complaints, sections), [complaints, sections])
  const filtered =
    statusFilter === 'All' ? mapped : mapped.filter((c) => c.status === statusFilter)

  const locationText = coords.failed
    ? 'Location unavailable — permission denied or unsupported.'
    : `${coords.lat?.toFixed(4) ?? '—'}° ${coords.lat != null && coords.lat >= 0 ? 'N' : 'S'}, ${coords.lon?.toFixed(4) ?? '—'}° ${coords.lon != null && coords.lon >= 0 ? 'E' : 'W'}`

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,420px)_1fr]">
      {/* Form */}
      <Card className="h-fit">
        <CardContent className="p-5">
          <h2 className="text-sm font-semibold">Report an Issue</h2>
          <p className="text-sm text-muted-foreground">
            Field reports are auto-linked to affected sections &amp; blocks.
          </p>

          {error && (
            <div className="mt-4 rounded-lg border border-conflict/30 bg-conflict/10 p-3 text-sm text-conflict">
              Database error: {error}
            </div>
          )}

          {submittedRef && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-approved/30 bg-approved/10 p-3 text-sm text-approved">
              <CircleCheck className="size-4" />
              Issue submitted — reference {submittedRef} created.
            </div>
          )}

          <form onSubmit={submit} className="mt-5 space-y-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="category">Category</Label>
              <Select id="category" name="category" defaultValue="Track Defect">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="section">Section</Label>
              <Select id="section" name="section" defaultValue={sections[0]?.id ?? ''}>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="desc">Description</Label>
              <Textarea id="desc" name="desc" placeholder="Describe the fault, location detail and any immediate risk…" required />
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
                    onClick={() => {
                      setPhoto(null)
                      setPhotoFile(null)
                    }}
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
                      <p className="text-sm font-medium">
                        {coords.failed ? 'Location not captured' : 'Location captured'}
                      </p>
                      <p className="text-xs text-muted-foreground">{locationText}</p>
                      {!coords.failed && (
                        <span className="mt-1.5 inline-flex items-center gap-1 text-xs text-approved">
                          <CircleCheck className="size-3" /> GPS accuracy ±{Math.round(coords.accuracy ?? 0)}m
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* AI-suggested priority (photo only; suggestion, never forced) */}
            {photo && (
              <div className="flex flex-col gap-1.5">
                <Label>AI-suggested priority</Label>
                <div className="rounded-lg border border-border p-3 text-sm">
                  {aiState === 'analyzing' && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" /> Analyzing photo…
                    </div>
                  )}
                  {aiState === 'error' && (
                    <p className="text-xs text-muted-foreground">{aiError} You can still set severity manually below.</p>
                  )}
                  {aiState === 'idle' && aiSuggestion && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={SEVERITY_VARIANT[aiSuggestion.priority as keyof typeof SEVERITY_VARIANT]}>
                        AI: {aiSuggestion.priority}
                      </Badge>
                      <span className="min-w-0 flex-1 text-xs text-muted-foreground">{aiSuggestion.reason}</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const p = aiSuggestion.priority
                          setSeverity((p.charAt(0).toUpperCase() + p.slice(1)) as (typeof SEVERITIES)[number])
                        }}
                      >
                        Use AI suggestion
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

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

            <Button type="submit" className="w-full" size="lg" disabled={submitting || loading}>
              {submitting && <Loader2 className="animate-spin" />}
              {submitting ? 'Submitting…' : 'Submit issue report'}
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
                  <th className="px-5 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/40">
                    <td className="px-5 py-3">
                      {c.photoUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={c.photoUrl}
                          alt="Complaint evidence"
                          className="size-9 rounded-md border border-border object-cover"
                        />
                      ) : (
                        <div className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                          <ImageIcon className="size-4" />
                        </div>
                      )}
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
                    <td className="px-5 py-3">
                      <div className="flex gap-1">
                        {c.status !== 'Resolved' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              await updateComplaintStatus(c.id, 'resolved')
                              refresh()
                            }}
                          >
                            Mark resolved
                          </Button>
                        )}
                        {isAdmin && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setPendingDelete({ id: c.id, label: c.category })}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {pendingDelete && (
        <ConfirmDelete
          name={`${pendingDelete.label} complaint`}
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => {
            await deleteComplaint(pendingDelete.id)
            setPendingDelete(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}
