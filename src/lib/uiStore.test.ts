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

  it('toggleSection collapses and reopens one sidebar section, and is kept with the other preferences', () => {
    useUiStore.getState().toggleSection('channels')
    useUiStore.getState().toggleSection('starred')
    useUiStore.getState().toggleSection('starred')
    expect(useUiStore.getState().collapsedSections).toEqual(['channels'])
    useUiStore.getState().forgetPlaces()
    expect(useUiStore.getState().collapsedSections).toEqual(['channels'])
  })

  it('setSidebarWidth keeps the sidebar between 200 and 420px, and 260 is the default', () => {
    expect(initialUiState.sidebarWidth).toBe(260)
    useUiStore.getState().setSidebarWidth(320.6)
    expect(useUiStore.getState().sidebarWidth).toBe(321)
    useUiStore.getState().setSidebarWidth(90)
    expect(useUiStore.getState().sidebarWidth).toBe(200)
    useUiStore.getState().setSidebarWidth(900)
    expect(useUiStore.getState().sidebarWidth).toBe(420)
  })

  it('visit records last place per workspace', () => {
    useUiStore.getState().visit('engineering', '/w/engineering/c/c-backend')
    expect(useUiStore.getState()).toMatchObject({ lastWorkspace: 'engineering', lastVisited: { engineering: '/w/engineering/c/c-backend' } })
  })

  it('visit also keeps the last place and the last side per workspace, Home included (spec 5.5)', () => {
    const { visit } = useUiStore.getState()
    visit('engineering', '/w/engineering/c/c-backend')
    visit('engineering', '/w/engineering/p/NEX/tasks')
    visit('engineering', '/w/engineering/search')
    expect(useUiStore.getState()).toMatchObject({
      lastByMode: { engineering: { chat: '/w/engineering/c/c-backend', projects: '/w/engineering/p/NEX/tasks' } },
      lastMode: { engineering: 'projects' },
      lastVisited: { engineering: '/w/engineering/search' },
    })
    visit('engineering', '/w/engineering')
    expect(useUiStore.getState().lastByMode.engineering.projects).toBe('/w/engineering')
    // Home is the workspace's own address: it doesn't replace the last place opened inside it.
    expect(useUiStore.getState().lastVisited.engineering).toBe('/w/engineering/search')
  })

  it('forgetPlaces clears the last places but keeps other preferences', () => {
    useUiStore.getState().visit('engineering', '/w/engineering/c/c-backend')
    useUiStore.getState().setProjectView('NEX', 'list')
    useUiStore.getState().toggleSidebar()
    useUiStore.getState().forgetPlaces()
    expect(useUiStore.getState()).toMatchObject({ lastWorkspace: null, lastVisited: {}, lastByMode: {}, lastMode: {}, lastProjectView: { NEX: 'list' }, sidebarCollapsed: true })
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

  // Sprints spec §6.3: '' is a choice (All sprints); no sprint at all is none made yet, and only '' survives a reload.
  it('an empty sprint is kept as All sprints, which a missing one is not', () => {
    useUiStore.getState().setProjectFilters('NEX', { sprint: '' })
    const saved = JSON.parse(JSON.stringify(useUiStore.getState().lastFilters)) as Record<string, { sprint?: string }>
    expect(saved.NEX).toEqual({ sprint: '' })
    useUiStore.getState().setProjectFilters('NEX', { phase: 'ph1', sprint: undefined })
    expect('sprint' in JSON.parse(JSON.stringify(useUiStore.getState().lastFilters.NEX))).toBe(false)
  })
})

