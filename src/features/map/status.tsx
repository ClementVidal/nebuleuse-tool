import { STATUS_LABELS } from '@/db/fields'
import type { IdeaStatus } from '@/db/types'
import { cn } from '@/lib/utils'

/** Writing status: a hollow dot for a draft, a green one when ready. */
export function StatusDot({ status = 'draft', withLabel, className }: { status?: IdeaStatus; withLabel?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        className={cn('size-2 shrink-0 rounded-full', status !== 'ready' && 'border border-muted-foreground/60')}
        style={status === 'ready' ? { background: 'var(--sketch-green)' } : undefined}
      />
      {withLabel && STATUS_LABELS[status]}
    </span>
  )
}
