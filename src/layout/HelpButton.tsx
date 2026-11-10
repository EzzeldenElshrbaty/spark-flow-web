import { IconQuestionMark } from '@tabler/icons-react'
import clsx from 'clsx'
import { useSearchParams } from 'react-router'
import { Icon } from '@/components/sf/Icon'
import { HELP_BUTTON_ID, usePageHelp } from '@/layout/PageHelpPanel'
import { roundButton } from '@/layout/roundButton'
import { parseInspector, withInspector } from '@/lib/inspector'
import { useUiStore } from '@/lib/uiStore'

/**
 * The round "?" beside the bell (slice 6): help for this page, beside it. Hidden on a page without help. A plain "?"
 * in the bell's round ring, so it reads as one of the top bar's buttons; held down while help is open.
 */
export function HelpButton() {
  const help = usePageHelp()
  const open = useUiStore((state) => state.helpOpen)
  const setOpen = useUiStore((state) => state.setHelpOpen)
  const [params, setParams] = useSearchParams()
  if (!help) return null
  const toggle = () => {
    // One side panel at a time: help takes the place of a thread, task or file.
    if (!open && parseInspector(params)) setParams((current) => withInspector(current, null))
    setOpen(!open)
  }
  return (
    <button
      type="button"
      id={HELP_BUTTON_ID}
      aria-label="Help for this page"
      title="Help for this page"
      aria-expanded={open}
      aria-controls={open ? 'page-help' : undefined}
      className={clsx(roundButton, 'aria-expanded:bg-sf-surface-hover aria-expanded:text-sf-text')}
      onClick={toggle}
    >
      <Icon icon={IconQuestionMark} />
    </button>
  )
}
