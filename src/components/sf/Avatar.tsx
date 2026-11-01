import clsx from 'clsx'
import type { Presence } from '@/api/types'

const sizes = {
  sm: 'size-sf-avatar-sm rounded-sf-sm text-[9px] tracking-[-0.02em]',
  md: 'size-7 rounded-sf-md text-[11px]',
  lg: 'size-sf-avatar rounded-sf-md text-[13px]',
  xl: 'size-18 rounded-sf-lg text-[24px]',
}

// Three greys, picked by a hash of the id so a person keeps the same tone.
const tones = [
  'bg-sf-ink-100 text-sf-ink-700 dark:bg-sf-ink-700 dark:text-sf-ink-100',
  'bg-sf-ink-300 text-sf-ink-950',
  'bg-sf-ink-800 text-sf-white dark:bg-sf-ink-950 dark:ring-sf-ink-600',
]

const presenceLabels: Record<Presence, string> = { active: 'active', away: 'away', offline: 'offline' }

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

export function toneOf(id: string): number {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return Math.abs(hash) % tones.length
}

/**
 * Rounded-square avatar with an optional presence dot. `on` is the colour behind it, so the dot's ring
 * cuts it out cleanly (the sidebar is `frame`). `decorative` when the name is printed next to it.
 */
export function Avatar({
  id,
  name,
  src,
  size = 'lg',
  presence,
  app = false,
  on = 'surface',
  decorative = false,
}: {
  id: string
  name: string
  src?: string
  size?: keyof typeof sizes
  presence?: Presence
  /** Apps and bots (Flowbot): ink square. */
  app?: boolean
  on?: 'surface' | 'frame'
  decorative?: boolean
}) {
  const ring = on === 'frame' ? 'var(--app-frame)' : 'var(--surface)'
  const label = presence && presence !== 'offline' ? `${name}, ${presenceLabels[presence]}` : name
  return (
    <span
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
      className={clsx(
        'relative inline-grid flex-none place-items-center font-sf leading-none font-semibold ring-1 ring-sf-ink-950/6 ring-inset',
        sizes[size],
        app ? 'bg-sf-ink-950 text-sf-white' : tones[toneOf(id)],
        size === 'sm' && on === 'frame' && 'ring-0',
      )}
    >
      {src ? <img src={src} alt="" className="size-full rounded-[inherit] object-cover" /> : initials(name)}
      {presence && presence !== 'offline' && (
        <span
          data-presence={presence}
          style={{
            boxShadow:
              presence === 'away' ? `inset 0 0 0 2px var(--ink-400), 0 0 0 2px ${ring}` : `0 0 0 2px ${ring}`,
          }}
          className={clsx(
            'absolute rounded-sf-full',
            size === 'sm' ? '-end-0.5 -bottom-0.5 size-2' : '-end-[3px] -bottom-[3px] size-2.5',
            presence === 'active' ? 'bg-sf-presence-active' : on === 'frame' ? 'bg-sf-app-frame' : 'bg-sf-surface',
          )}
        />
      )}
    </span>
  )
}

/** Up to `max` small avatars, then "+N". Announced as one group. */
export function Facepile({
  people,
  max = 3,
  label,
}: {
  people: { id: string; name: string }[]
  max?: number
  label?: string
}) {
  const shown = people.slice(0, max)
  const extra = people.length - shown.length
  return (
    <span
      role="img"
      aria-label={label ?? people.map((p) => p.name).join(', ')}
      className="inline-flex items-center gap-0.5"
    >
      {shown.map((p) => (
        <Avatar key={p.id} id={p.id} name={p.name} size="sm" decorative />
      ))}
      {extra > 0 && (
        <span aria-hidden className="ps-0.5 font-sf text-[12px]/[16px] text-sf-text-muted tabular-nums">
          +{extra}
        </span>
      )}
    </span>
  )
}
