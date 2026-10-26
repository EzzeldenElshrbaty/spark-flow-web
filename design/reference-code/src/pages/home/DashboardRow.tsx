import type { ReactNode } from 'react'

// Widths on the same three columns in every row (gap-6 = 1.5rem), so card edges line up down the page. Each card
// also grows, so when a card in the row has nothing to show (it renders nothing) the others fill its space.
/** One column of three. */
export const narrow = 'xl:grow xl:basis-[calc((100%_-_3rem)/3)]'
/** Two columns of three, including the gap between them. */
export const wide = 'xl:grow xl:basis-[calc((100%_-_3rem)*2/3_+_1.5rem)]'

/**
 * One row of Home cards on wide screens, stacked on phones. Give each card `narrow` or `wide`; cards in a row
 * line up at the same height.
 */
export function DashboardRow({ children }: { children: ReactNode }) {
  return <div className="mt-6 flex flex-col gap-6 xl:flex-row xl:*:min-w-0">{children}</div>
}
