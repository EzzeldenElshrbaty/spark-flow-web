import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { modeOf, type PlacesByMode, type WorkspaceMode } from '@/lib/workspaceMode'

export type ProjectView = 'board' | 'list' // the Tasks tab's view
export type Typer = { userId: string; until: number }

/** How long someone stays "typing" after their last keystroke event. */
const TYPING_MS = 3000

/** The desktop sidebar's width range (spec 5.1); it opens at 260px. */
export const SIDEBAR_WIDTH = { min: 200, max: 420, initial: 260 }

type UiState = {
  sidebarCollapsed: boolean
  sidebarWidth: number                           // px, dragged between SIDEBAR_WIDTH.min and max
  collapsedSections: string[]                    // sidebar sections closed by their chevron (work, channels…)
  lastWorkspace: string | null
  lastVisited: Record<string, string>            // workspace slug → last path opened in it
  lastByMode: PlacesByMode                       // workspace slug → last path on each side, Projects and Chat (spec 5.5)
  lastMode: Record<string, WorkspaceMode>        // workspace slug → the side last opened, for pages both sides share
  lastProjectView: Record<string, ProjectView>   // project key → board or list on its Tasks tab
  lastFilters: Record<string, { phase?: string; sprint?: string }> // project key → its Tasks tab's last phase and sprint
  typing: Record<string, Typer[]>                // channel id → who is typing; never persisted
  helpOpen: boolean                              // the page help panel (slice 6): kept across pages, not reloads
}

type UiActions = {
  toggleSidebar: () => void
  toggleSection: (id: string) => void
  setSidebarWidth: (px: number) => void
  /** Remembers a place: the last one in the workspace (inside it), and the last one on its side (Home included). */
  visit: (workspaceSlug: string, path: string) => void
  /** Forgets where the person was (after the demo data is reset, those places may be gone). */
  forgetPlaces: () => void
  setProjectView: (key: string, view: ProjectView) => void
  setProjectFilters: (key: string, filters: { phase?: string; sprint?: string }) => void
  addTyper: (channelId: string, userId: string, now?: number) => void
  setHelpOpen: (open: boolean) => void
}

export const initialUiState: UiState = {
  sidebarCollapsed: false,
  sidebarWidth: SIDEBAR_WIDTH.initial,
  collapsedSections: [],
  lastWorkspace: null,
  lastVisited: {},
  lastByMode: {},
  lastMode: {},
  lastProjectView: {},
  lastFilters: {},
  typing: {},
  helpOpen: false,
}

/** Who is still typing in a channel at `now`. Pure, so it can be tested and called from render. */
export function activeTypers(typing: Record<string, Typer[]>, channelId: string, now = Date.now()): string[] {
  return (typing[channelId] ?? []).filter((typer) => typer.until > now).map((typer) => typer.userId)
}

/**
 * localStorage when the browser allows it; in memory otherwise (Node tests, blocked storage). Saving never
 * throws: a full or private-mode storage only means the preference is forgotten on reload.
 */
export function createUiStorage(candidate?: StateStorage): StateStorage {
  const memory = new Map<string, string>()
  const inMemory: StateStorage = {
    getItem: (name) => memory.get(name) ?? null,
    setItem: (name, value) => void memory.set(name, value),
    removeItem: (name) => void memory.delete(name),
  }
  if (!candidate) return inMemory
  try {
    candidate.getItem('spark-flow.ui') // throws when storage is blocked
  } catch {
    return inMemory
  }
  const quietly = <T>(run: () => T, fallback: T): T => {
    try {
      return run()
    } catch {
      return fallback
    }
  }
  return {
    getItem: (name) => quietly(() => candidate.getItem(name), null),
    setItem: (name, value) => quietly(() => candidate.setItem(name, value), undefined),
    removeItem: (name) => quietly(() => candidate.removeItem(name), undefined),
  }
}

const browserStorage = (): StateStorage | undefined => {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined // reading the property itself throws when storage is blocked
  }
}

export const useUiStore = create<UiState & UiActions>()(
  persist(
    (set) => ({
      ...initialUiState,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarWidth: (px) =>
        set({ sidebarWidth: Math.round(Math.min(SIDEBAR_WIDTH.max, Math.max(SIDEBAR_WIDTH.min, px))) }),
      toggleSection: (id) =>
        set((state) => ({
          collapsedSections: state.collapsedSections.includes(id)
            ? state.collapsedSections.filter((s) => s !== id)
            : [...state.collapsedSections, id],
        })),
      visit: (workspaceSlug, path) =>
        set((state) => {
          const mode = modeOf(path)
          // Home is the workspace's own address: it counts for its side, but the last place is one opened inside.
          const inside = path.startsWith(`/w/${workspaceSlug}/`)
          return {
            lastWorkspace: workspaceSlug,
            ...(inside && { lastVisited: { ...state.lastVisited, [workspaceSlug]: path } }),
            ...(mode && {
              lastByMode: { ...state.lastByMode, [workspaceSlug]: { ...state.lastByMode[workspaceSlug], [mode]: path } },
              lastMode: { ...state.lastMode, [workspaceSlug]: mode },
            }),
          }
        }),
      setHelpOpen: (open) => set({ helpOpen: open }),
      forgetPlaces: () => set({ lastWorkspace: null, lastVisited: {}, lastByMode: {}, lastMode: {} }),
      setProjectView: (key, view) => set((state) => ({ lastProjectView: { ...state.lastProjectView, [key]: view } })),
      setProjectFilters: (key, filters) => set((state) => ({ lastFilters: { ...state.lastFilters, [key]: filters } })),
      addTyper: (channelId, userId, now = Date.now()) =>
        set((state) => ({
          typing: {
            ...state.typing,
            // Expired typers go too, so a quiet channel's list empties instead of growing.
            [channelId]: [...(state.typing[channelId] ?? []).filter((typer) => typer.userId !== userId && typer.until > now), { userId, until: now + TYPING_MS }],
          },
        })),
    }),
    {
      name: 'spark-flow.ui',
      storage: createJSONStorage(() => createUiStorage(browserStorage())),
      partialize: ({ typing: _typing, helpOpen: _helpOpen, ...persisted }) => persisted,
    },
  ),
)
