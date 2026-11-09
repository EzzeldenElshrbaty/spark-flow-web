import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { StatusCategory } from '@/api/types'
import { tintOf } from '@/pages/projects/ticketPills'

// UX Phase 3 (3.6): dark mode details. Status tints follow the kit's dark step (500/15), and an error said as a
// sentence near its cause is the kit's error red (Field), not a status colour.

const read = (path: string) => readFileSync(new URL(`./${path}`, import.meta.url), 'utf8')

describe('dark mode details', () => {
  it('board column heads use the kit’s dark tint', () => {
    const columns: [string, StatusCategory][] = [['todo', 'todo'], ['inProgress', 'inProgress'], ['inReview', 'inProgress'], ['done', 'done']]
    for (const [status, category] of columns) expect(tintOf(status, category).head, status).toMatch(/dark:bg-\w+-500\/15/)
  })

  it('error sentences use the kit’s error red', () => {
    for (const path of ['pages/settings/UsersPage.tsx', 'pages/settings/AttendancePage.tsx', 'pages/settings/AuditLogPage.tsx', 'pages/settings/ArchivedPage.tsx', 'pages/signin/SignInPage.tsx']) {
      const alerts = [...read(path).matchAll(/role="alert" className="([^"]*)"/g)].map((m) => m[1]!)
      expect(alerts.length, path).toBeGreaterThan(0)
      for (const classes of alerts) expect(classes, path).not.toContain('text-red-700 dark:text-red-300')
    }
  })
})
