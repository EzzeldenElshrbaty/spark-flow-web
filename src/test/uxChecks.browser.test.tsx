import '@/index.css'
import { cleanup, render, screen } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { axeProblems } from './axe'
import { AUDIT_TAGS, missingH1, pageProblems, primaryButtons, sidewaysScroll, spinners } from './uxChecks'

// UX Phase 6, 6.1: the audit's page checks (section 9A), each proved on a small page.

afterEach(async () => {
  cleanup()
  await page.viewport(414, 896)
})

const clean = { consoleErrors: [] as string[] }

/** Words that fade from pale to dark over 600 ms after they appear, as a staggered fade-in or a dimmed refetch does. */
function Fading() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    requestAnimationFrame(() => setDark(true))
  }, [])
  return <p style={{ color: dark ? '#111111' : '#dddddd', background: '#ffffff', transition: 'color 600ms linear' }}>Fading words</p>
}

describe('the page checks', () => {
  it('a box wider than a phone is a sideways scroll', async () => {
    await page.viewport(390, 844)
    render(<div style={{ width: 600, height: 20 }} />)
    expect(sidewaysScroll()).toMatch(/^sideways scroll: 2\d\d px wider than the window$/)
  })

  it('a page that fits has no sideways scroll', async () => {
    await page.viewport(390, 844)
    render(<div style={{ width: 300, height: 20 }} />)
    expect(sidewaysScroll()).toBeNull()
  })

  it('counts red primary buttons wider than 40px', () => {
    render(
      <>
        <button type="button" className="bg-brand-500 px-4 py-2 text-white">
          Save
        </button>
        <button type="button" className="bg-brand-500 px-4 py-2 text-white">
          Create
        </button>
        <button type="button" className="size-4 bg-brand-500" aria-label="Dot" />
      </>,
    )
    expect(primaryButtons()).toEqual(['Save', 'Create'])
  })

  it('one primary is not a problem, even with the pointer over a row that turns red', async () => {
    render(
      <main>
        <h1>Page</h1>
        <a href="#row" className="block w-64 py-2 text-fg hover:bg-brand-500">
          A row
        </a>
        <button type="button" className="bg-brand-500 px-4 py-2 text-white">
          Save
        </button>
      </main>,
    )
    await userEvent.hover(screen.getByRole('link', { name: 'A row' }))
    expect(await pageProblems(clean)).toEqual([])
  })

  it('two primaries are a problem, named', async () => {
    render(
      <main>
        <h1>Page</h1>
        <button type="button" className="bg-brand-500 px-4 py-2 text-white">
          Save
        </button>
        <button type="button" className="bg-brand-500 px-4 py-2 text-white">
          Create
        </button>
      </main>,
    )
    expect(await pageProblems(clean)).toContain('more than one primary button: Save, Create')
  })

  it('waits for colours to finish changing before it checks contrast', async () => {
    render(
      <main>
        <h1>Page</h1>
        <Fading />
      </main>,
    )
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(await pageProblems(clean)).toEqual([])
  })

  it('finds a spinner', () => {
    render(<span className="inline-block size-4 animate-spin border" />)
    expect(spinners()).toBe(1)
  })

  it('finds a page without an h1', async () => {
    render(<p>No heading here</p>)
    expect(missingH1()).toBe(true)
    expect(await pageProblems(clean)).toContain('missing h1')
  })

  it('reports console errors', async () => {
    render(
      <main>
        <h1>Page</h1>
      </main>,
    )
    expect(await pageProblems({ consoleErrors: ['x'] })).toContain('console error: x')
  })

  it('reports small tap targets on a phone through axe (the audit’s tags)', async () => {
    await page.viewport(390, 844)
    render(
      <main>
        <h1>Page</h1>
        <button type="button" aria-label="One" style={{ width: 16, height: 16, padding: 0 }} />
        <button type="button" aria-label="Two" style={{ width: 16, height: 16, padding: 0 }} />
      </main>,
    )
    expect((await axeProblems(document, { tags: AUDIT_TAGS })).some((p) => p.startsWith('target-size'))).toBe(true)
  })
})
