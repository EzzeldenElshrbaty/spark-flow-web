import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { useRoleNames } from '@/api/roles'
import { onInspectorEscape } from '@/layout/Inspector'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { parseInspector } from '@/lib/inspector'
import { watchDialogAtKeyDown } from '@/lib/keyStart'
import { pageHelpFor } from '@/lib/pageHelp'
import { paths } from '@/lib/paths'
import { useUiStore } from '@/lib/uiStore'
import { sectionsOf, useHelpChapters, useMayRead } from '@/lib/useHelp'
import { useRole } from '@/lib/useRole'
import { HelpDoc } from '@/pages/help/HelpDoc'
import { IconButton } from '@/components/ui/IconButton'

/** The "?" button's id: focus goes back to it when the panel closes. */
export const HELP_BUTTON_ID = 'page-help-button'

/** This page's help, when it has some this person may read; decided without loading the chapters. */
export function usePageHelp() {
  const { pathname } = useLocation()
  const mayRead = useMayRead()
  const rule = pageHelpFor(pathname)
  return rule && mayRead(rule.needs ?? null) ? rule : null
}

/**
 * Help beside the page (Admin and help, slice 6, as the CRM's PageHelpPanel): the help for the page you're on, opened by
 * the round "?" in the top bar. From 1536px it sits beside the page, so people read and work at once; narrower it slides
 * over the page, and on phones it rises from the bottom. It doesn't dim the page, and stays open from page to page. One
 * side panel at a time: a thread, task or file opening closes it, and opening it closes them.
 */
export function PageHelpPanel() {
  const open = useUiStore((state) => state.helpOpen)
  const setOpen = useUiStore((state) => state.setHelpOpen)
  const rule = usePageHelp()
  const { chapters } = useHelpChapters(open && Boolean(rule))
  const location = useLocation()
  const [params] = useSearchParams()
  const inspector = parseInspector(params) !== null
  const { workspace } = useCurrentWorkspace()
  const { persona } = useRole()
  const roleNames = useRoleNames()
  // Another chapter opened from a link inside, for this visit to this page only (Back, a new page or closing forget it).
  const [other, setOther] = useState<{ key: string; chapter: string; section: string | null } | null>(null)
  const followed = other?.key === location.key ? other : null
  const body = useRef<HTMLDivElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  const close = () => {
    setOther(null)
    setOpen(false)
    document.getElementById(HELP_BUTTON_ID)?.focus()
  }

  // A thread, task or file panel takes the side: help steps aside.
  useEffect(() => {
    if (inspector && open) setOpen(false)
  }, [inspector, open, setOpen])

  useEffect(() => {
    if (followed?.section) document.getElementById(followed.section)?.scrollIntoView({ block: 'start' })
    else body.current?.scrollTo({ top: 0 })
  }, [followed?.chapter, followed?.section, location.pathname])

  const latestClose = useRef(close)
  useEffect(() => {
    latestClose.current = close
  })
  useEffect(() => {
    if (!open) return
    // As the Inspector's: a field, a menu, a dialog or a picker above has Escape first.
    const dialog = watchDialogAtKeyDown()
    const onKeyDown = (event: KeyboardEvent) => onInspectorEscape(event, () => latestClose.current(), dialog.open())
    document.addEventListener('keydown', onKeyDown)
    return () => {
      dialog.stop()
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const help = rule && chapters?.find((c) => c.id === rule.chapter)
  if (!open || !rule || !help || !workspace || inspector) return null
  const shownChapter = (followed && chapters!.find((c) => c.id === followed.chapter)) || help
  const sections = followed ? undefined : rule.sections
  const title = sections?.length === 1 ? sections[0]! : shownChapter.title
  const follow = (next: { chapter: string; section: string | null } | null) => {
    setOther(next && { key: location.key, ...next })
    heading.current?.focus()
  }

  return (
    <aside
      id="page-help"
      aria-label="Help for this page"
      className="fixed inset-x-0 bottom-0 z-40 flex h-[85vh] flex-col rounded-t-2xl border-t border-line bg-surface shadow-2xl motion-safe:animate-fade-up sm:inset-x-auto sm:end-0 sm:top-0 sm:h-full sm:w-[24rem] sm:rounded-none sm:border-s sm:border-t-0 sm:motion-safe:animate-slide-in-end 2xl:motion-safe:animate-fade-in 2xl:relative 2xl:z-auto 2xl:m-2 2xl:ms-0 2xl:h-auto 2xl:shrink-0 2xl:rounded-2xl 2xl:border 2xl:border-line 2xl:shadow-lg"
    >
      <div className="flex shrink-0 items-start gap-3 border-b border-line-subtle px-5 py-4">
        <div className="min-w-0 flex-1">
          {followed ? (
            <button type="button" onClick={() => follow(null)} className="flex min-h-6 items-center gap-1 text-xs font-medium text-fg-muted hover:text-fg">
              <ArrowLeft className="size-3.5 rtl:-scale-x-100" /> Back to this page
            </button>
          ) : (
            <p className="m-0 text-xs font-semibold uppercase tracking-wider text-accent">Help · {roleNames(persona.roleIds)}</p>
          )}
          <h2 ref={heading} tabIndex={-1} className="mt-0.5 text-base font-semibold text-fg outline-none">
            {title}
          </h2>
        </div>
        <IconButton label="Close help" icon={X} touch onClick={close} className="-me-2" />
      </div>
      <div ref={body} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <HelpDoc compact blocks={sectionsOf(shownChapter, sections)} canOpen={(id) => chapters!.some((c) => c.id === id)} onChapter={(chapter, section) => follow({ chapter, section })} />
      </div>
      <div className="flex shrink-0 items-center justify-end border-t border-line-subtle px-5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 text-sm">
        <Link to={paths.help(workspace.slug, shownChapter.id)} className="inline-flex min-h-9 items-center gap-1 font-medium text-accent hover:underline">
          Open the help centre <ArrowRight className="size-3.5 rtl:-scale-x-100" />
        </Link>
      </div>
    </aside>
  )
}
