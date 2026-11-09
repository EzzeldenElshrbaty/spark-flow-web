import type { Channel, Project } from '@/api/types'
import { landingPath, paths, validSavedPlace } from '@/lib/paths'

/** The two sides of Flow (spec 5.5): project work, and chat. Each owns the whole sidebar. */
export type WorkspaceMode = 'projects' | 'chat'

/** The last place opened on each side, per workspace slug. */
export type PlacesByMode = Record<string, Partial<Record<WorkspaceMode, string>>>

const CHAT = /^\/w\/[^/]+\/(?:c\/[^/]+|activity|saved|drafts|threads)\/?$/
// Settings, Preferences and Help always use the Projects sidebar (UX Phase 2, 2.2).
const PROJECTS = /^\/w\/[^/]+(?:\/(?:projects|tasks|teams|dashboard|time|preferences|p\/.+|settings(?:\/.+)?|help(?:\/.+)?))?\/?$/

/**
 * Which side an address belongs to. Search and anything else return null: they keep the side you were on.
 * Only the path counts; a query string is ignored.
 */
export function modeOf(pathname: string): WorkspaceMode | null {
  const path = pathname.split('?')[0]
  if (CHAT.test(path)) return 'chat'
  if (PROJECTS.test(path)) return 'projects'
  return null
}

/**
 * Where moving to a side goes: the last place opened there while it still leads somewhere (its channel or project
 * may be gone), else that side's start (#general for Chat, the Dashboard for Projects). Undefined while the list it needs to
 * check is still loading.
 */
export function modeTarget(
  slug: string,
  mode: WorkspaceMode,
  lastByMode: PlacesByMode,
  channels: Channel[] | undefined,
  projects: Project[] | undefined,
): string | undefined {
  const saved = lastByMode[slug]?.[mode]
  const home = paths.home(slug)
  const ours = saved && (saved === home || saved.startsWith(`${home}/`)) && modeOf(saved) === mode ? saved : undefined
  if (mode === 'chat') {
    if (!channels) return undefined
    // A chat place is a channel (checked against the list) or one of the chat views; no project is involved.
    return ours && validSavedPlace(ours, channels, []) ? ours : landingPath(slug, {}, channels)
  }
  if (!ours) return paths.start(slug)
  if (ours === home) return home
  if (!projects) return undefined
  return validSavedPlace(ours, channels ?? [], projects) ? ours : paths.start(slug)
}
