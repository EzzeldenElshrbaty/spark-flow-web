import { describe, expect, it } from 'vitest'
import type { User } from '@/api/types'
import { projectPeople, projectPeopleIds } from './projectPeople'

const user = (id: string, teamIds: string[] = []) => ({ id, teamIds }) as unknown as User

describe('projectPeople', () => {
  it('the manager, the members and the people on its teams are in; anyone else is out', () => {
    const users = [user('m'), user('a'), user('t', ['team']), user('x', ['other'])]
    const project = { managerId: 'm', memberIds: ['a'], teamIds: ['team'] }
    expect(projectPeople(project, users).map((u) => u.id)).toEqual(['m', 'a', 't'])
    expect(projectPeopleIds(project, users)).toEqual(new Set(['m', 'a', 't']))
  })
})
