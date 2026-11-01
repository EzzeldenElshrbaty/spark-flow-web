// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Attachment } from '@/api/types'
import { SnippetView } from '@/pages/chat/snippets/SnippetCard'

afterEach(cleanup)

const snippet = { id: 'a-s', name: 'explain-query.txt', title: 'explain-query', snippet: { language: 'sql' } } as Attachment
const lines = (n: number) => Array.from({ length: n }, (_, i) => `SELECT ${i + 1};`).join('\n')

describe('SnippetView (spec 6.9: a collapsible code card)', () => {
  it('heads the code with its title and "SQL · N lines"', () => {
    render(<SnippetView attachment={snippet} text={lines(6)} />)
    expect(screen.getByText('explain-query')).toBeTruthy()
    expect(screen.getByText('SQL · 6 lines')).toBeTruthy()
  })

  it('shows 10 lines, then Show all N lines and Show less', () => {
    render(<SnippetView attachment={snippet} text={lines(14)} />)
    const code = screen.getByRole('region', { name: 'explain-query' })
    expect(code.querySelectorAll('[data-line]')).toHaveLength(10)
    fireEvent.click(screen.getByRole('button', { name: 'Show all 14 lines' }))
    expect(code.querySelectorAll('[data-line]')).toHaveLength(14)
    fireEvent.click(screen.getByRole('button', { name: 'Show less' }))
    expect(code.querySelectorAll('[data-line]')).toHaveLength(10)
  })

  it('no fold under 11 lines; one line says "1 line"', () => {
    render(<SnippetView attachment={snippet} text="SELECT 1;" />)
    expect(screen.getByText('SQL · 1 line')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull()
  })

  it('keywords read at weight 600, strings secondary, comments muted (spec 6.3 ink weights)', () => {
    render(<SnippetView attachment={snippet} text="select 'x' -- note" />)
    expect(screen.getByText('select').className).toContain('font-semibold')
    expect(screen.getByText("'x'").className).toContain('text-sf-text-secondary')
    expect(screen.getByText('-- note').className).toContain('text-sf-text-muted')
  })
})
