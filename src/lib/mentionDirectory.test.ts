import { describe, expect, it } from 'vitest'
import type { TaskView } from '@/api/types'
import { directoryOf } from './mentionDirectory'

const task = (key: string) => ({ key, title: key }) as TaskView

describe('directoryOf', () => {
  it("an archived task's key still renders as a chip, but the @ popup doesn't offer it", () => {
    const { tasks, known } = directoryOf({ users: [], projects: [], tasks: [task('NEX-110'), task('NEX-101')], archivedKeys: ['NEX-102'] })
    expect(tasks.map((t) => t.key)).toEqual(['NEX-101', 'NEX-110'])
    expect(known.taskKeys.has('NEX-102')).toBe(true)
    expect(known.taskKeys.has('NEX-101')).toBe(true)
  })
})
