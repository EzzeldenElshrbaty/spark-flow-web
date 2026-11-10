import { describe, expect, it } from 'vitest'
import { validPage, type PageBody } from '@/lib/pageBody'
import { PAGE_TEMPLATES } from '@/lib/pageTemplates'

const checks = (body: PageBody) => body.flatMap((b) => (b.type === 'check' ? b.items.map((i) => i.children.map((n) => (n.type === 'text' ? n.text : '')).join('')) : []))

describe('page templates (chat spec 6.14 §7)', () => {
  it('every template is a valid page', () => {
    for (const t of PAGE_TEMPLATES) expect(validPage(t.body), t.id).toEqual(t.body)
  })

  it('names and summaries', () => {
    expect(PAGE_TEMPLATES.map((t) => [t.id, t.name, t.summary])).toEqual([
      ['kickoff', 'Project kickoff', 'Goals, scope, who’s who and a kickoff checklist.'],
      ['incident', 'Incident', 'A summary, a timeline and action items.'],
      ['release', 'Release', 'Scope, a release checklist and how to roll back.'],
    ])
  })

  it('Release has its checklist; Kickoff its people table', () => {
    const [kickoff, incident, release] = PAGE_TEMPLATES
    expect(checks(release!.body)).toEqual(['Freeze the scope', 'QA sign-off', 'Write the release notes', 'Deploy', 'Check it in production', 'Tell the team'])
    expect(checks(kickoff!.body)).toEqual(['Agree the scope and dates', 'Set up the project in Flow', 'Invite the team to this channel', 'Book a weekly check-in'])
    expect(checks(incident!.body)).toEqual(['Find the cause', 'Fix it and check the fix', 'Tell the people affected', 'Write up what we learned'])
    const table = kickoff!.body.find((b) => b.type === 'table')
    expect(table).toEqual({
      type: 'table',
      rows: [
        [[{ type: 'text', text: 'Role' }], [{ type: 'text', text: 'Person' }]],
        [[{ type: 'text', text: 'Project manager' }], []],
        [[{ type: 'text', text: 'Lead engineer' }], []],
        [[{ type: 'text', text: 'Client contact' }], []],
      ],
    })
  })
})
