'use client'

import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * Shared typed-confirmation dialog for destructive actions.
 * The confirm button stays disabled until the user types DELETE.
 */
export function ConfirmDelete({
  name,
  onConfirm,
  onCancel,
}: {
  name: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const [typed, setTyped] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-[1px]" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-xl border border-conflict/40 bg-card p-5 shadow-2xl">
        <div className="flex items-center gap-2 text-conflict">
          <TriangleAlert className="size-5" />
          <h2 className="text-base font-semibold">Delete “{name}”?</h2>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          This permanently removes the row from Supabase. Type{' '}
          <span className="font-mono text-conflict">DELETE</span> to confirm.
        </p>
        <Input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="mt-3 font-mono"
          placeholder="DELETE"
          aria-label="Type DELETE to confirm"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" variant="destructive" disabled={typed !== 'DELETE'} onClick={onConfirm}>
            Delete forever
          </Button>
        </div>
      </div>
    </div>
  )
}
