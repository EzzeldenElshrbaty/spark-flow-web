import clsx from 'clsx'

/**
 * The main card (spec 5.3): inset 8px from the top, end and bottom, the kit's 16px corner (UX Phase 3, 3.5: the frame is
 * shared by both modules, so it follows the kit), clips its content. A chat pane
 * sits on the chat `surface`, inside the chat tokens; other modules keep their own canvas.
 */
export const mainCardClass = (pane: boolean) =>
  clsx('relative flex min-w-0 flex-1 flex-col lg:my-2 lg:me-2 lg:overflow-hidden lg:rounded-2xl', pane ? 'sf lg:bg-sf-surface' : 'lg:bg-canvas')

type RouteMatch = { handle: unknown; params: Record<string, string | undefined> }

/**
 * A page that fills the card instead of scrolling in the page column (UX Phase 1, 1.3): its route's handle has
 * `fill: true`, or `fill(params)` says so for this address (the project page, on its Chat tab only).
 */
export function isFill(matches: readonly RouteMatch[]): boolean {
  return matches.some(({ handle, params }) => {
    const fill = (handle as { fill?: boolean | ((params: RouteMatch['params']) => boolean) } | undefined)?.fill
    return typeof fill === 'function' ? fill(params) : fill === true
  })
}

/**
 * Which font the whole screen uses (UX Phase 3, 3.1): chat pages (a route with `pane`) are chat screens, in Readex Pro;
 * every other page, the project's Chat tab included (it sits under the project's kit header), is a page in Inter.
 * AppLayout puts it on <html> as `data-font`, which flow-tokens.css reads.
 */
export function screenFont(pane: boolean): 'chat' | 'page' {
  return pane ? 'chat' : 'page'
}
