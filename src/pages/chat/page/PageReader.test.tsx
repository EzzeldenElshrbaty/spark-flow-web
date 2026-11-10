// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import type { User } from '@/api/types'
import type { Inline } from '@/lib/messageBody'
import type { PageBody } from '@/lib/pageBody'
import type { BodyContext } from '@/pages/chat/MessageBody'
import { PageReader } from '@/pages/chat/page/PageReader'

afterEach(cleanup)

const users = [{ id: 'u-2', name: 'Nour El-Sayed' }] as User[]
const ctx: BodyContext = { users, tasks: new Map(), projectKeys: new Set(), ws: 'engineering', workspaceId: 'ws-eng' }
const t = (text: string): Inline[] => [{ type: 'text', text }]
const show = (body: PageBody) =>
  render(
    <MemoryRouter>
      <PageReader body={body} ctx={ctx} />
    </MemoryRouter>,
  )

describe('PageReader (chat spec 6.14)', () => {
  it('headings sit under the channel’s h1', () => {
    show([{ type: 'h1', children: t('Plan') }, { type: 'h2', children: t('Goals') }, { type: 'h3', children: t('Notes') }])
    expect(screen.getByRole('heading', { level: 2, name: 'Plan' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: 'Goals' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 4, name: 'Notes' })).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  })

  it('a checklist reads its state', () => {
    show([{ type: 'check', items: [{ checked: true, children: t('Ship it') }, { checked: false, children: t('Tell people') }] }])
    const boxes = screen.getAllByRole('checkbox')
    expect(boxes.map((b) => b.getAttribute('aria-checked'))).toEqual(['true', 'false'])
    expect(boxes.every((b) => b.getAttribute('aria-readonly') === 'true')).toBe(true)
    expect(screen.getByRole('checkbox', { name: 'Ship it' })).toBeTruthy()
  })

  it('a table has a header row', () => {
    show([{ type: 'table', rows: [[t('A'), t('B')], [t('C'), t('D')]] }])
    expect(screen.getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['A', 'B'])
    expect(screen.getAllByRole('cell').map((c) => c.textContent)).toEqual(['C', 'D'])
  })

  it('chips render as in messages', () => {
    show([{ type: 'p', children: [{ type: 'user', id: 'u-2', name: 'Nour' }, { type: 'text', text: ' owns ' }, { type: 'task', key: 'NEX-999' }] }])
    expect(screen.getByText('@Nour El-Sayed')).toBeTruthy()
    expect(screen.getByText('NEX-999').tagName).toBe('BDI')
  })

  it('text is never HTML', () => {
    const { container } = show([{ type: 'p', children: t('<b>x</b>') }])
    expect(container.querySelector('b')).toBeNull()
    expect(screen.getByText('<b>x</b>')).toBeTruthy()
  })

  it('chat’s blocks render as in messages', () => {
    show([{ type: 'ul', items: [t('One')] }, { type: 'code', text: 'npm test' }, { type: 'quote', children: [{ type: 'p', children: t('Said') }] }])
    expect(screen.getByRole('list')).toBeTruthy()
    expect(screen.getByText('npm test').tagName).toBe('PRE')
    expect(screen.getByText('Said').closest('blockquote')).toBeTruthy()
  })
})
