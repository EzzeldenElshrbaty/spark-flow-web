import { useEffect } from 'react'

/**
 * Names the browser tab after the page: its parts that are set, then "Spark Flow", with " · " between ("Nexus Core ·
 * Tasks · Spark Flow"), so tabs and history tell pages apart (UX Phase 5A, 5.7). Every page that draws an h1 calls it
 * (`src/a11y.test.ts`); `PageHeader` does for its title.
 */
export function useDocumentTitle(parts: readonly (string | null | undefined)[]): void {
  const title = [...parts.filter((part): part is string => Boolean(part?.trim())), 'Spark Flow'].join(' · ')
  useEffect(() => {
    document.title = title
  }, [title])
}
