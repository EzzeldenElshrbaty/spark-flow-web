import clsx from 'clsx'
import { useEffect, useState, type ReactNode } from 'react'
import { announce } from '@/components/sf/Announcer'

/** How long "Link copied" stays; a failure stays until the next one. */
const NOTE_MS = 2000

/**
 * Copy link for a menu: copies `link`, and `note` says what happened under the menu's button (read out too). Put `note`
 * inside a `relative` box next to the button.
 */
export function useCopyLink(link: string): { copy: () => Promise<void>; say: (text: string, error?: boolean) => void; note: ReactNode } {
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null)
  useEffect(() => {
    if (!note || note.error) return
    const timer = setTimeout(() => setNote(null), NOTE_MS)
    return () => clearTimeout(timer)
  }, [note])
  const say = (text: string, error = false) => {
    setNote({ text, error })
    announce(text)
  }
  // Copied while the click still counts as mine; no clipboard (an insecure page) fails the same way as a refusal.
  const copy = () =>
    new Promise<void>((resolve) => resolve(navigator.clipboard.writeText(link))).then(
      () => say('Link copied'),
      () => say("Couldn't copy the link", true),
    )
  return {
    copy,
    say,
    note: note && (
      <p className={clsx('sf-meta absolute end-0 top-full z-10 mt-1 whitespace-nowrap rounded-sf-md bg-sf-surface-raised px-2 py-1 shadow-sf-menu', note.error ? 'text-sf-error' : 'text-sf-text-secondary')}>
        {note.text}
      </p>
    ),
  }
}
