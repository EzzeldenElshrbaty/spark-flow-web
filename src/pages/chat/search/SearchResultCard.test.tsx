// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import type { MessageHit } from '@/api/types'
import { parseQuery } from '@/lib/searchQuery'
import { SearchResultCard } from './SearchResultCard'

afterEach(cleanup)

const hit = (over: Partial<MessageHit> = {}): MessageHit => ({
  kind: 'message', target: { kind: 'message', id: 'm1' }, channelId: 'c-backend', rootId: null, senderId: 'u-2',
  text: 'Deploys go out at page size 100, deploy at 9', createdAt: '2026-10-28T09:00:00.000Z', ...over,
})
function show(h = hit(), q = 'deploy "page size"') {
  render(
    <MemoryRouter>
      <SearchResultCard hit={h} query={parseQuery(q)} place="#backend" author="Nour El-Sayed" ws="engineering" />
    </MemoryRouter>,
  )
  return screen.getByRole('article')
}

describe('SearchResultCard (spec 6.12)', () => {
  it('says where and when, who, and the text with each match highlighted', () => {
    const card = show()
    expect(card.textContent).toContain('#backend')
    expect(card.textContent).toContain('Nour El-Sayed')
    expect(card.querySelector('time')?.getAttribute('datetime')).toBe('2026-10-28T09:00:00.000Z')
    expect([...card.querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['Deploy', 'page size', 'deploy'])
  })
  it('View in channel jumps to the message, or opens a reply in its thread', () => {
    show()
    expect(screen.getByRole('link', { name: /View in channel/ }).getAttribute('href')).toBe('/w/engineering/c/c-backend?message=m1')
    cleanup()
    show(hit({ target: { kind: 'reply', id: 'r1' }, rootId: 'm1' }))
    expect(screen.getByRole('link', { name: /View in channel/ }).getAttribute('href')).toBe('/w/engineering/c/c-backend?thread=m1')
  })
  it('renders the text as text, never as markup', () => {
    const card = show(hit({ text: '<img src=x onerror=alert(1)> deploy' }), 'deploy')
    expect(card.querySelector('img')).toBeNull()
    expect(card.textContent).toContain('<img src=x onerror=alert(1)>')
  })
})
