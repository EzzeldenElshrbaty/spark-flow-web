/**
 * Who is acting, for one tab: "View as" picks them. It lives outside the shared document, so each tab (and a reload
 * of it) keeps its own person while the others keep theirs. Unset means the document's default person.
 */
export type Actor = { get(): string | null; set(userId: string): void; clear(): void }

export function memoryActor(): Actor {
  let id: string | null = null
  return {
    get: () => id,
    set: (userId) => {
      id = userId
    },
    clear: () => {
      id = null
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
    clear() {
      fallback.clear()
      try {
        sessionStorage.removeItem(key)
      } catch {
        // Blocked storage: nothing was kept there.
      }
    },
  }
}

/**
 * Who signed in (slice AB), for the whole browser as a cookie would be: a user id, '' for the document's default person
 * (tests, which start signed in), or null when signed out. A tab's View as (Actor) still overrides who acts.
 */
export type Session = { get(): string | null; set(userId: string | null): void }

export function memorySession(initial: string | null = ''): Session {
  let id = initial
  return {
    get: () => id,
    set: (userId) => {
      id = userId
    },
  }
}

/** The browser's session in localStorage; a first visit has none, so the prototype opens on Sign in. */
export function localSession(key = 'spark-flow.session'): Session {
  const fallback = memorySession(null)
  return {
    get() {
      try {
        return localStorage.getItem(key) ?? fallback.get()
      } catch {
        return fallback.get()
      }
    },
    set(userId) {
      fallback.set(userId)
      try {
        if (userId === null) localStorage.removeItem(key)
        else localStorage.setItem(key, userId)
      } catch {
        // Blocked storage: the session lasts until this tab reloads.
      }
    },
  }
}
