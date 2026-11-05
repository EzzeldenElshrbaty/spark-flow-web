import { useQuery } from '@tanstack/react-query'
import type { HelpChapter } from '@/lib/helpMarkdown'
import type { Action, ProjectScoped } from '@/lib/permissions'
import { usePermission } from '@/lib/usePermission'
import { useRole } from '@/lib/useRole'

// Help (Admin and help, slice 6): the chapters load as one chunk the first time help opens, and each person sees the
// chapters their permissions allow.

/** What a chapter's `needs` says to its reader: "For people who can see the audit log." */
export const NEEDS_TEXT: Partial<Record<Exclude<Action, ProjectScoped>, string>> = {
  'timeCost.view': 'see project cost and the Time and cost page',
  'settings.open': 'open Settings',
  'settings.manage': 'change settings, users and roles',
  'audit.view': 'see the audit log',
  'archive.manage': 'manage archived records',
  'rates.view': 'see hourly costs',
  'database.manage': 'export, reload or reset the demo data',
}

/** Whether this person may read a chapter that `needs` something; null while the account loads. */
export function useMayRead(): (needs: HelpChapter['needs']) => boolean | null {
  const check = usePermission()
  const { loading } = useRole()
  return (needs) => {
    if (!needs) return true
    if (loading) return null
    return check(needs)
  }
}

/** Every chapter this person may read, in order; undefined while the chunk or the account loads. */
export function useHelpChapters(enabled = true) {
  const mayRead = useMayRead()
  const query = useQuery({ queryKey: ['help'], queryFn: () => import('@/help').then((m) => m.chapters), staleTime: Infinity, gcTime: Infinity, retry: false, enabled })
  const known = query.data?.every((c) => mayRead(c.needs) !== null)
  const chapters: HelpChapter[] | undefined = known ? query.data!.filter((c) => mayRead(c.needs)) : undefined
  return { chapters, isError: query.isError }
}

/** A chapter's blocks for some of its sections (the `##` headings), or all of it; one section loses its own heading. */
export function sectionsOf(chapter: HelpChapter, sections?: string[]) {
  if (!sections?.length) return chapter.blocks
  let keep = false
  return chapter.blocks.filter((block) => {
    if (block.type === 'h2') {
      keep = sections.includes(block.text)
      return keep && sections.length > 1
    }
    return keep
  })
}
