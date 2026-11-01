/**
 * Who is acting, for one tab: "View as" picks them. It lives outside the shared document, so each tab (and a reload
 * of it) keeps its own person while the others keep theirs. Unset means the document's default person.
 */
export type Actor = { get(): string | null; set(userId: string): void }

export function memoryActor(): Actor {
  let id: string | null = null
  return {
    get: () => id,
    set: (userId) => {
      id = userId
    },
  }
}

/** The tab's actor in sessionStorage; in memory when storage is blocked. */
export function sessionActor(key = 'spark-flow.viewAs'): Actor {
  const fallback = memoryActor()
  return {
    get() {
      try {
        return sessionStorage.getItem(key) ?? fallback.get()
      } catch {
        return fallback.get()
      }
    },
    set(userId) {
      fallback.set(userId)
      try {
        sessionStorage.setItem(key, userId)
      } catch {
        // Blocked storage: this tab keeps the choice in memory until it reloads.
      }
    },
  }
}
