// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Attachment } from '@/api/types'
import type { DescBody } from '@/lib/messageBody'
import { DescriptionView } from './DescriptionView'

vi.mock('@/components/AttachmentView', () => ({ useFileUrl: (id: string) => ({ url: `blob:http://localhost/${id}`, failed: false }) }))
afterEach(cleanup)

const text = (t: string, marks?: ('b' | 'i' | 'u' | 's' | 'code')[]) => (marks ? { type: 'text' as const, text: t, marks } : { type: 'text' as const, text: t })
const pdf = { id: 'a-1', title: 'flow.pdf', name: 'flow.pdf', mimeType: 'application/pdf', size: 2048 } as Attachment
const png = { id: 'a-2', title: 'shot.png', name: 'shot.png', mimeType: 'image/png', size: 4096 } as Attachment

describe('DescriptionView (spec 5.2)', () => {
  it('shows text with its formatting, lists, quotes and code blocks', () => {
    const body: DescBody = [
      { type: 'p', children: [text('one\ntwo '), text('b', ['b']), text('i', ['i']), text('u', ['u']), text('s', ['s']), text('c', ['code'])] },
      { type: 'ul', items: [[text('dot')]] },
      { type: 'ol', items: [[text('first')]] },
      { type: 'quote', children: [{ type: 'p', children: [text('said')] }] },
      { type: 'code', text: 'const a = 1' },
    ]
    const { container } = render(<DescriptionView body={body} files={[]} onOpen={vi.fn()} />)
    expect(container.querySelector('p')!.textContent).toBe('one\ntwo biusc')
    expect(['strong', 'em', 'u', 's', 'code'].map((tag) => container.querySelector(`p ${tag}`)?.textContent)).toEqual(['b', 'i', 'u', 's', 'c'])
    expect(container.querySelector('ul li')!.textContent).toBe('dot')
    expect(container.querySelector('ol li')!.textContent).toBe('first')
    expect(container.querySelector('blockquote')!.textContent).toBe('said')
    expect(container.querySelector('pre')!.textContent).toBe('const a = 1')
  })

  it('links open in a new tab; anything but a web address is text', () => {
    render(<DescriptionView body={[{ type: 'p', children: [{ type: 'link', href: 'https://a.b/', text: 'site' }, { type: 'link', href: 'javascript:alert(1)', text: 'bad' }] }]} files={[]} onOpen={vi.fn()} />)
    const link = screen.getByRole('link', { name: 'site' })
    expect([link.getAttribute('href'), link.getAttribute('target'), link.getAttribute('rel')]).toEqual(['https://a.b/', '_blank', 'noopener noreferrer'])
    expect(screen.queryByRole('link', { name: 'bad' })).toBeNull()
    expect(screen.getByText('bad')).toBeTruthy()
  })

  it('files open in the viewer; a picture shows; a file the task no longer has says so', () => {
    const onOpen = vi.fn()
    render(<DescriptionView body={[{ type: 'file', id: 'a-1' }, { type: 'file', id: 'a-2' }, { type: 'file', id: 'a-gone' }]} files={[pdf, png]} onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: 'flow.pdf' }))
    expect(onOpen).toHaveBeenCalledWith(pdf)
    expect(screen.getByRole('img', { name: 'shot.png' }).getAttribute('src')).toBe('blob:http://localhost/a-2')
    expect(screen.getByText('This file was removed.')).toBeTruthy()
  })

  it('an empty description reads —', () => {
    render(<DescriptionView body={[]} files={[]} onOpen={vi.fn()} />)
    expect(screen.getByText('—')).toBeTruthy()
  })
})
