import clsx from 'clsx'

// Soft colours for initials avatars, picked by a hash of the name so a person keeps the same colour.
const avatarTones = [
  'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200',
  'bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200',
  'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200',
  'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200',
  'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-200',
  'bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-200',
]

/** A person's initials in a soft circle (copied from Spark CRM's lead avatars). */
export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const initials = name
    .replace(/^(Dr\.|Eng\.)\s+/, '')
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
        avatarTones[Math.abs(hash) % avatarTones.length],
        size === 'sm' ? 'size-6 text-[10px]' : 'size-9 text-xs',
      )}
      aria-hidden
    >
      {initials}
    </span>
  )
}
