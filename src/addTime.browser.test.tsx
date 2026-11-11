import '@/index.css'
import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { api } from '@/lib/api'
import { renderApp, type Role } from '@/test/app'

// Add time is an Admin's or the project's manager's (11 Nov 2026): a Member uses the timer, and sees no Add time on
// the task panel, My work's Today card or the project's Time tab.

beforeEach(async () => {
  await api.auth.signOut().catch(() => {})
  localStorage.setItem('spark-flow.session', 'u-1')
  await api.db.reset()
})

const PLACES = [
  ['the task panel', '/w/engineering/p/NEX/tasks?ticket=NEX-106'],
  ['My work', '/w/engineering'],
  ['the project’s Time tab', '/w/engineering/p/NEX/time'],
] as const

describe('Add time', () => {
  // Mariam is a Member on Nexus Core; Nour manages it.
  it.each(PLACES.flatMap(([where, path]) => (['member', 'pm'] as Role[]).map((as) => [as, where, path] as const)))(
    'as %s on %s',
    async (as, _, path) => {
      const app = await renderApp({ path, as, theme: 'light', size: 'desktop' })
      await app.settled()
      const button = screen.queryByRole('button', { name: 'Add time' })
      if (as === 'member') expect(button).toBeNull()
      else expect(button).toBeTruthy()
    },
  )
})
