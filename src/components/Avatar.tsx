import clsx from 'clsx'
import type { Presence } from '@/api/types'

/**
 * One avatar for people everywhere (UX Phase 3, 3.1): the kit's round initials in a soft colour picked from the name
 * (design/03-components.md, as Spark CRM), in chat and on pages alike. Plain Tailwind sizes and colours only, so it
 * looks the same inside and outside the chat scope (`.sf`).
 */
export type AvatarSize = 20 | 24 | 28 | 36 | 40 | 72

// Sizes in pixels, text too (the shell's menus take no kit type classes).
const sizes: Record<AvatarSize, string> = {
  20: 'size-5 text-[9px] tracking-[-0.02em]',
  24: 'size-6 text-[10px]',
  28: 'size-7 text-[11px]',
  36: 'size-9 text-[12px]',
  40: 'size-10 text-[14px]',
  72: 'size-18 text-[24px]',
}

// The kit's six soft colours, picked by a hash of the name so a person keeps one colour on every page.
const tones = [
  'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200',
  'bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200',
  'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200',
  'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200',
  'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-200',
  'bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-200',
]

const presenceLabels: Record<Presence, string> = { active: 'active', away: 'away', offline: 'offline' }

/** What a screen reader hears after a name beside a decorative avatar: ", active", ", away", or nothing (UX Phase 5B). */
export function presenceNote(presence?: Presence): string {
  return presence && presence !== 'offline' ? `, ${presenceLabels[presence]}` : ''
}

/** Two initials, without a leading "Dr." or "Eng.". */
export function initials(name: string): string {
  return name
    .replace(/^(Dr\.|Eng\.)\s+/, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

/** The colour classes for a name. */
export function avatarTone(name: string): string {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return tones[Math.abs(hash) % tones.length]!
}

/**
 * A person's avatar with an optional presence dot. `on` is the colour behind it, so the dot's ring cuts it out cleanly
 * (the sidebar is `frame`). `decorative` when the name is printed next to it. `self` is me in the top bar (dark, as
 * the kit's top bar); `app` is an app or bot (Flowbot).
 */
export function Avatar({
  name,
  src,
  size = 36,
  presence,
  app = false,
  self = false,
  on = 'surface',
  decorative = false,
  className,
}: {
  /** Kept for callers that have it; the colour comes from the name. */
  id?: string
  name: string
  src?: string
  size?: AvatarSize
  presence?: Presence
  app?: boolean
  self?: boolean
  on?: 'surface' | 'frame'
  decorative?: boolean
  className?: string
}) {
  const ring = on === 'frame' ? 'var(--app-frame)' : 'var(--surface)'
  const label = presence && presence !== 'offline' ? `${name}, ${presenceLabels[presence]}` : name
  return (
    <span
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
      className={clsx(
        'relative inline-flex shrink-0 items-center justify-center rounded-full leading-none font-semibold',
        sizes[size],
        app ? 'bg-ink-950 text-white' : self ? 'bg-ink-800 text-white dark:bg-surface-strong' : avatarTone(name),
        className,
      )}
    >
      {src ? <img src={src} alt="" className="size-full rounded-full object-cover" /> : initials(name)}
      {presence && presence !== 'offline' && (
        <span
          data-presence={presence}
          // Away is a hollow dot in the colour behind it (set here, as a value, so the shell's sf-only menus can hold it).
          style={{
            boxShadow: presence === 'away' ? `inset 0 0 0 2px var(--color-zinc-400), 0 0 0 2px ${ring}` : `0 0 0 2px ${ring}`,
            backgroundColor: presence === 'away' ? ring : undefined,
          }}
          className={clsx(
            'absolute -end-0.5 -bottom-0.5 rounded-full',
            size <= 24 ? 'size-2' : size <= 36 ? 'size-2.5' : 'size-3',
            presence === 'active' && 'bg-emerald-500',
          )}
        />
      )}
    </span>
  )
}

/** Up to `max` small avatars, then "+N". Announced as one group. */
export function Facepile({ people, max = 3, label }: { people: { id: string; name: string }[]; max?: number; label?: string }) {
  const shown = people.slice(0, max)
  const extra = people.length - shown.length
  return (
    <span role="img" aria-label={label ?? people.map((p) => p.name).join(', ')} className="inline-flex items-center gap-0.5">
      {shown.map((p) => (
        <Avatar key={p.id} name={p.name} size={20} decorative />
      ))}
      {extra > 0 && (
        <span aria-hidden className="ps-0.5 text-[12px]/[16px] text-fg-muted tabular-nums">
          +{extra}
        </span>
      )}
    </span>
  )
}
