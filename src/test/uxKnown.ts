import type { UxCase } from './uxMatrix'

export type KnownProblem = {
  /** The cases it applies to: every field given must match. */
  match: Partial<Pick<UxCase, 'path' | 'as' | 'theme' | 'size'>>
  /** The start of the problem line it sets aside ("color-contrast: .chip"). */
  problem: string
  /** Why it isn't fixed yet: the decision it waits for. */
  why: string
}

/**
 * Problems the UX checks know about and set aside until a decision is made (UX Phase 6, D4). Each needs a reason, and
 * an entry fails once its problem stops happening, so the list can't go stale.
 */
export const UX_KNOWN: KnownProblem[] = []
