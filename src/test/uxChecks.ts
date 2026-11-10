import { userEvent } from 'vitest/browser'
import { axeProblems } from './axe'

/**
 * The audit's page checks (UX Phase 6, 6.1; the audit's section 9A): sideways scroll, more than one primary button,
 * spinners, console errors, a missing h1, and axe's serious and critical problems with the audit's rule set (which
 * includes `target-size`, the "tap targets under 24 px" check). Each problem is one line.
 */

/** The rule tags the audit ran axe with. */
export const AUDIT_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']

const visible = (el: Element) => {
  const box = el.getBoundingClientRect()
  return box.width > 0 && box.height > 0 && getComputedStyle(el).visibility !== 'hidden'
}

const nameOf = (el: Element) => (el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\s+/g, ' ').trim()

export function sidewaysScroll(): string | null {
  const over = document.documentElement.scrollWidth - innerWidth
  return over > 1 ? `sideways scroll: ${over} px wider than the window` : null
}

/** The brand red as the browser computes it ("rgb(183, 33, 38)"). */
function brandRed(): string {
  const probe = document.createElement('span')
  probe.style.backgroundColor = 'var(--color-brand-500)'
  document.body.append(probe)
  const red = getComputedStyle(probe).backgroundColor
  probe.remove()
  return red
}

/** The visible red filled controls wider than 40px (a primary button; dots and badges are smaller), by name. */
export function primaryButtons(): string[] {
  const red = brandRed()
  return [...document.querySelectorAll('button, a, [role=button]')]
    .filter((el) => visible(el) && el.getBoundingClientRect().width > 40 && getComputedStyle(el).backgroundColor === red)
    .map(nameOf)
}

export const spinners = () => [...document.querySelectorAll('.animate-spin')].filter(visible).length

export const missingH1 = () => !document.querySelector('h1')

export async function pageProblems(handle: { consoleErrors: string[] }): Promise<string[]> {
  // Hover styles (a row that turns red under the pointer) aren't the page: the pointer moves to the top-left corner.
  await userEvent.hover(document.body, { position: { x: 0, y: 0 } })
  const problems: string[] = []
  const wide = sidewaysScroll()
  if (wide) problems.push(wide)
  const primaries = primaryButtons()
  if (primaries.length > 1) problems.push(`more than one primary button: ${primaries.join(', ')}`)
  const spinning = spinners()
  if (spinning) problems.push(`${spinning} spinner(s)`)
  if (missingH1()) problems.push('missing h1')
  for (const line of handle.consoleErrors) problems.push(`console error: ${line.slice(0, 300)}`)
  problems.push(...(await axeProblems(document, { tags: AUDIT_TAGS })))
  return problems
}
