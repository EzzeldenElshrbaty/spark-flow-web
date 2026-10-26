import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'

export type ProjectView = 'board' | 'backlog'
export type Typer = { userId: string; until: number }

/** How long someone stays "typing" after their last keystroke event. */
const TYPING_MS = 3000

type UiState = {
  sidebarCollapsed: boolean
  lastWorkspace: string | null
  lastVisited: Record<string, string>            // workspace slug → last path opened in it
  lastProjectView: Record<string, ProjectView>   // project key → board or backlog
  typing: Record<string, Typer[]>                // channel id → who is typing; never persisted
}

type UiActions = {
  toggleSidebar: () => void
  visit: (workspaceSlug: string, path: string) => void
  setProjectView: (key: string, view: ProjectView) => void
  addTyper: (channelId: string, userId: string, now?: number) => void
}

export const initialUiState: UiState = {
  sidebarCollapsed: false,
  lastWorkspace: null,
  lastVisited: {},
  lastProjectView: {},
  typing: {},
}

/** Who is still typing in a channel at `now`. Pure, so it can be tested and called from render. */
export function activeTypers(typing: Record<string, Typer[]>, channelId: string, now = Date.now()): string[] {
  return (typing[channelId] ?? []).filter((typer) => typer.until > now).map((typer) => typer.userId)
}

// localStorage when the browser allows it; in memory otherwise (Node tests, blocked storage).
function createStorage(): StateStorage {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.getItem('spark-flow.ui') // throws when storage is blocked
      return localStorage
    }
  } catch {
    // fall through to memory
  }
  const memory = new Map<string, string>()
  return {
    getItem: (name) => memory.get(name) ?? null,
    setItem: (name, value) => void memory.set(name, value),
    removeItem: (name) => void memory.delete(name),
  }
}

export const useUiStore = create<UiState & UiActions>()(
  persist(
    (set) => ({
      ...initialUiState,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      visit: (workspaceSlug, path) =>
        set((state) => ({ lastWorkspace: workspaceSlug, lastVisited: { ...state.lastVisited, [workspaceSlug]: path } })),
      setProjectView: (key, view) => set((state) => ({ lastProjectView: { ...state.lastProjectView, [key]: view } })),
      addTyper: (channelId, userId, now = Date.now()) =>
        set((state) => ({
          typing: {
            ...state.typing,
            [channelId]: [...(state.typing[channelId] ?? []).filter((typer) => typer.userId !== userId), { userId, until: now + TYPING_MS }],
          },
        })),
    }),
    {
      name: 'spark-flow.ui',
      storage: createJSONStorage(createStorage),
      partialize: ({ typing: _typing, ...persisted }) => persisted,
    },
  ),
)
