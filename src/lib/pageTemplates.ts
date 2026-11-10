import type { Inline } from '@/lib/messageBody'
import type { PageBlock, PageBody } from '@/lib/pageBody'

/** A ready page for a new channel (chat spec 6.14 §7), saved as the channel's page by Pick a template. */
export type PageTemplate = { id: 'kickoff' | 'incident' | 'release'; name: string; summary: string; body: PageBody }

const t = (text: string): Inline[] => [{ type: 'text', text }]
const h1 = (text: string): PageBlock => ({ type: 'h1', children: t(text) })
const h2 = (text: string): PageBlock => ({ type: 'h2', children: t(text) })
const p = (text: string): PageBlock => ({ type: 'p', children: t(text) })
const checklist = (...items: string[]): PageBlock => ({ type: 'check', items: items.map((text) => ({ checked: false, children: t(text) })) })
/** A table: its header, then rows that fill the first column and leave the rest empty. */
const table = (header: string[], firsts: string[]): PageBlock => ({
  type: 'table',
  rows: [header.map(t), ...firsts.map((first) => [first ? t(first) : [], ...header.slice(1).map((): Inline[] => [])])],
})

export const PAGE_TEMPLATES: PageTemplate[] = [
  {
    id: 'kickoff',
    name: 'Project kickoff',
    summary: 'Goals, scope, who’s who and a kickoff checklist.',
    body: [
      h1('Project kickoff'),
      h2('Goals'),
      p('What does this project have to achieve, and by when?'),
      h2('Scope'),
      { type: 'ul', items: [t('In scope:'), t('Out of scope:')] },
      h2('Who’s who'),
      table(['Role', 'Person'], ['Project manager', 'Lead engineer', 'Client contact']),
      h2('Kickoff checklist'),
      checklist('Agree the scope and dates', 'Set up the project in Flow', 'Invite the team to this channel', 'Book a weekly check-in'),
    ],
  },
  {
    id: 'incident',
    name: 'Incident',
    summary: 'A summary, a timeline and action items.',
    body: [
      h1('Incident'),
      h2('Summary'),
      p('What happened, who is affected and where it stands now.'),
      h2('Timeline'),
      table(['Time', 'What happened'], ['', '']),
      h2('Action items'),
      checklist('Find the cause', 'Fix it and check the fix', 'Tell the people affected', 'Write up what we learned'),
    ],
  },
  {
    id: 'release',
    name: 'Release',
    summary: 'Scope, a release checklist and how to roll back.',
    body: [
      h1('Release'),
      h2('Scope'),
      p('What ships in this release, and what waits.'),
      h2('Release checklist'),
      checklist('Freeze the scope', 'QA sign-off', 'Write the release notes', 'Deploy', 'Check it in production', 'Tell the team'),
      h2('Rollback'),
      { type: 'ol', items: [t('How to roll back'), t('Who decides')] },
    ],
  },
]
