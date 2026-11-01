import clsx from 'clsx'

/**
 * The main card (spec 5.3): inset 8px from the top, end and bottom, radius-lg (12px), clips its content. A chat pane
 * sits on the chat `surface`, inside the chat tokens; other modules keep their own canvas.
 */
export const mainCardClass = (pane: boolean) =>
  clsx('relative flex min-w-0 flex-1 flex-col lg:my-2 lg:me-2 lg:overflow-hidden lg:rounded-[12px]', pane ? 'sf lg:bg-sf-surface' : 'lg:bg-canvas')
