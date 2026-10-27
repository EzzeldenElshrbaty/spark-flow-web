import { beforeEach, describe, expect, it } from 'vitest'
import { activeTypers, initialUiState, useUiStore } from '@/lib/uiStore'

beforeEach(() => {
  useUiStore.setState(initialUiState)
})

describe('uiStore', () => {
  it('activeTypers drops expired entries and filters by channel', () => {
    const typing = { c1: [{ userId: 'u2', until: 1_000 }, { userId: 'u3', until: 5_000 }], c2: [{ userId: 'u4', until: 9_000 }] }
    expect(activeTypers(typing, 'c1', 2_000)).toEqual(['u3'])
  })

  it('addTyper replaces the same user and sets a 3s expiry', () => {
    useUiStore.getState().addTyper('c1', 'u2', 0)
    useUiStore.getState().addTyper('c1', 'u2', 1_000)
    expect(useUiStore.getState().typing.c1).toEqual([{ userId: 'u2', until: 4_000 }])
  })

  it('visit records last place per workspace', () => {
    useUiStore.getState().visit('engineering', '/w/engineering/c/c-backend')
    expect(useUiStore.getState()).toMatchObject({ lastWorkspace: 'engineering', lastVisited: { engineering: '/w/engineering/c/c-backend' } })
  })

  it('forgetPlaces clears the last places but keeps other preferences', () => {
    useUiStore.getState().visit('engineering', '/w/engineering/c/c-backend')
    useUiStore.getState().setProjectView('NEX', 'list')
    useUiStore.getState().toggleSidebar()
    useUiStore.getState().forgetPlaces()
    expect(useUiStore.getState()).toMatchObject({ lastWorkspace: null, lastVisited: {}, lastProjectView: { NEX: 'list' }, sidebarCollapsed: true })
  })

  it('toggleSidebar flips the collapsed flag', () => {
    useUiStore.getState().toggleSidebar()
    expect(useUiStore.getState().sidebarCollapsed).toBe(true)
    useUiStore.getState().toggleSidebar()
    expect(useUiStore.getState().sidebarCollapsed).toBe(false)
  })

  it('setProjectView remembers the view per project', () => {
    useUiStore.getState().setProjectView('p1', 'list')
    expect(useUiStore.getState().lastProjectView).toEqual({ p1: 'list' })
  })

  it('does not persist typing', () => {
    useUiStore.getState().addTyper('c1', 'u2', 0)
    useUiStore.getState().toggleSidebar()
    const stored = useUiStore.persist.getOptions().storage!.getItem('spark-flow.ui') as { state: Record<string, unknown> }
    expect(stored.state.sidebarCollapsed).toBe(true)
    expect(stored.state).not.toHaveProperty('typing')
  })
})

describe('uiStore storage', () => {
  it('never throws when the browser refuses to save (quota, private mode)', async () => {
    const { createUiStorage } = await import('@/lib/uiStore')
    const stub = {
      getItem: () => null,
      setItem: () => { throw new DOMException('full', 'QuotaExceededError') },
      removeItem: () => { throw new DOMException('blocked', 'SecurityError') },
    }
    const storage = createUiStorage(stub)
    expect(() => storage.setItem('k', 'v')).not.toThrow()
    expect(() => storage.removeItem('k')).not.toThrow()
    expect(storage.getItem('k')).toBeNull()
  })
})

describe('typers expire from the store', () => {
  it('addTyper forgets typers whose time is up', () => {
    useUiStore.setState({ typing: {} })
    useUiStore.getState().addTyper('c1', 'u1', 0)
    useUiStore.getState().addTyper('c1', 'u2', 5000)
    expect(useUiStore.getState().typing.c1!.map((t) => t.userId)).toEqual(['u2'])
  })
})

describe('task filters', () => {
  it('the last phase and sprint filters are remembered per project', () => {
    useUiStore.getState().setProjectFilters('NEX', { phase: 'ph1', sprint: undefined })
    expect(useUiStore.getState().lastFilters.NEX).toEqual({ phase: 'ph1', sprint: undefined })
    expect(useUiStore.getState().lastFilters.MOB).toBeUndefined()
  })
})

