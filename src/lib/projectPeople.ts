import type { Project, User } from '@/api/types'

type ProjectPeopleRef = Pick<Project, 'managerId' | 'memberIds' | 'teamIds'>

/** A project's people: its manager, its members and the members of its teams. Tasks go to them; its chat holds them. */
export const projectPeople = (project: ProjectPeopleRef, users: User[]): User[] =>
  users.filter((u) => u.id === project.managerId || project.memberIds.includes(u.id) || u.teamIds.some((t) => project.teamIds.includes(t)))

/** The same people, by id. */
export const projectPeopleIds = (project: ProjectPeopleRef, users: User[]): Set<string> => new Set(projectPeople(project, users).map((u) => u.id))
