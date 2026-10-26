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

  it('toggleSidebar flips the collapsed flag', () => {
    useUiStore.getState().toggleSidebar()
    expect(useUiStore.getState().sidebarCollapsed).toBe(true)
    useUiStore.getState().toggleSidebar()
    expect(useUiStore.getState().sidebarCollapsed).toBe(false)
  })

  it('setProjectView remembers the view per project', () => {
    useUiStore.getState().setProjectView('p1', 'backlog')
    expect(useUiStore.getState().lastProjectView).toEqual({ p1: 'backlog' })
  })

  it('does not persist typing', () => {
    useUiStore.getState().addTyper('c1', 'u2', 0)
    useUiStore.getState().toggleSidebar()
    const stored = useUiStore.persist.getOptions().storage!.getItem('spark-flow.ui') as { state: Record<string, unknown> }
    expect(stored.state.sidebarCollapsed).toBe(true)
    expect(stored.state).not.toHaveProperty('typing')
  })
})
