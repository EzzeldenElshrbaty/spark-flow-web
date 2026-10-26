import clsx from 'clsx'
import { CircleHelp } from 'lucide-react'
import { usePageHelp, usePageHelpPanel } from '../../lib/usePageHelp'
import { roundButtonClass, roundButtonFill } from './styles'

/** The round "?" in the top bar, beside the bell; it opens the user's guide for this page beside it. Hidden when the guide doesn't cover the page. */
export function PageHelpButton() {
  const help = usePageHelp()
  const { open, setOpen } = usePageHelpPanel()
  if (!help) return null
  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      aria-controls="page-help"
      aria-label="Help for this page"
      title="Help for this page"
      className={clsx(roundButtonClass, open ? 'bg-accent-soft text-accent ring-brand-500' : clsx(roundButtonFill, 'text-fg-tertiary'))}
    >
      <CircleHelp className="size-[18px]" />
    </button>
  )
}
