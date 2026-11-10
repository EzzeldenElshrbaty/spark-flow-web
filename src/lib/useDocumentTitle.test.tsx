// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PageHeader } from '@/components/ui/PageHeader'
import { useDocumentTitle } from './useDocumentTitle'

afterEach(cleanup)

function Titled({ parts }: { parts: (string | undefined)[] }) {
  useDocumentTitle(parts)
  return null
}

describe('useDocumentTitle (UX Phase 5A, 5.7)', () => {
  it('names the tab after the page, then Spark Flow', () => {
    render(<Titled parts={['Nexus Core', 'Tasks']} />)
    expect(document.title).toBe('Nexus Core · Tasks · Spark Flow')
    cleanup()
    render(<Titled parts={[undefined]} />)
    expect(document.title).toBe('Spark Flow')
  })

  it('a page’s header names its tab', () => {
    render(<PageHeader title="Projects" />)
    expect(document.title).toBe('Projects · Spark Flow')
  })
})
