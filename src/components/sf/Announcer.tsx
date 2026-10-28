import { create } from 'zustand'

const useAnnouncement = create<{ text: string; n: number }>(() => ({ text: '', n: 0 }))

/** Reads `text` out to screen readers, politely, through the app's one live region. */
export function announce(text: string) {
  useAnnouncement.setState((s) => ({ text, n: s.n + 1 }))
}

/**
 * The app's one polite live region, mounted once in the shell, so rows and lists don't each carry one. Every
 * announcement is a new node: the same words twice are read out twice.
 */
export function Announcer() {
  const { text, n } = useAnnouncement()
  return (
    <p role="status" className="sr-only">
      <span key={n}>{text}</span>
    </p>
  )
}
