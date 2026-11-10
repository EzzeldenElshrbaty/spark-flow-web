import { IconLink } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import type { User } from '@/api/types'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/sf/Button'
import { useCopyLink } from '@/pages/chat/useCopyLink'

const FACES = 3

/** "Edited by Nour El-Sayed, Youssef Abdelrahman and 2 more". */
export function editedBy(names: string[]): string {
  const shown = names.slice(0, FACES)
  const more = names.length - shown.length
  if (more > 0) return `Edited by ${shown.join(', ')} and ${more} more`
  return shown.length > 1 ? `Edited by ${shown.slice(0, -1).join(', ')} and ${shown.at(-1)}` : `Edited by ${shown[0] ?? ''}`
}

/**
 * The row above a channel's page (chat spec 6.14 §6.1): where my changes are or who's editing, an error as a sentence
 * with its buttons, then the people who edited it, Copy link and History. Not a live region: only errors and "… is
 * editing" are read out, by the tab, once.
 */
export function PageBar({ line, error, errorActions, editors, people, link, history }: {
  line: string
  error: string | null
  errorActions?: ReactNode
  editors: string[]
  people: User[]
  link: string
  history?: ReactNode
}) {
  const { copy, note } = useCopyLink(link)
  const names = editors.map((id) => people.find((u) => u.id === id)?.name ?? 'Someone')
  return (
    <div role="group" aria-label="Page" className="relative z-20 flex flex-none flex-wrap items-center gap-x-3 gap-y-1 border-b max-md:gap-y-4 border-sf-line px-4 py-1.5 md:px-6">
      <div className="min-h-8 min-w-0 flex-1 basis-60 py-1">
        {line && <p className="sf-small text-sf-text-secondary">{line}</p>}
        {error && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="sf-small text-sf-error">{error}</p>
            {errorActions}
          </div>
        )}
      </div>
      <div className="flex flex-none items-center gap-2">
        {names.length > 0 && (
          <div className="flex items-center">
            <span className="sr-only">{editedBy(names)}</span>
            <span aria-hidden className="flex -space-x-1.5 rtl:space-x-reverse">
              {names.slice(0, FACES).map((name, i) => (
                <span key={editors[i]} className="rounded-sf-full ring-2 ring-sf-surface">
                  <Avatar id={editors[i]} name={name} size={24} decorative />
                </span>
              ))}
            </span>
            {names.length > FACES && (
              <span aria-hidden className="sf-meta ms-1 text-sf-text-secondary">
                +{names.length - FACES}
              </span>
            )}
          </div>
        )}
        <span className="relative">
          <Button variant="ghost" size="sm" icon={IconLink} touch onClick={() => void copy()}>
            Copy link
          </Button>
          {note}
        </span>
        {history}
      </div>
    </div>
  )
}
