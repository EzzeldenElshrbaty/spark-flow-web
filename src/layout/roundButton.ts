import clsx from 'clsx'

/**
 * The top bar's round shape (spec 5.2): 32px (`size-sf-control`), a hairline ring, a 44px touch on phones (UX Phase 5B).
 * Also the workspace button's loading placeholder.
 */
export const round = 'sf-focus inline-grid size-sf-control flex-none place-items-center rounded-sf-full border border-sf-line max-md:touch-target'

/** The top bar's round buttons (help, bell, phone search, workspace): the shape, muted ink, the surface on hover. */
export const roundButton = clsx(
  round,
  'cursor-pointer text-sf-text-secondary transition-colors duration-150 ease-sf hover:bg-sf-surface-hover hover:text-sf-text',
)
