import type * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/10 text-primary',
        neutral: 'border-border bg-muted text-muted-foreground',
        outline: 'border-border text-foreground',
        success: 'border-transparent bg-approved/15 text-approved',
        warning: 'border-transparent bg-pending/25 text-pending-foreground',
        danger: 'border-transparent bg-conflict/15 text-conflict',
        info: 'border-transparent bg-train/12 text-train',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
