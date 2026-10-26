import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowUpRight, ChevronRight, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Link, useLocation } from 'react-router'
import { helpApi, type HelpChapter } from '../api/help'
import { usePageHelp, usePageHelpPanel } from '../lib/usePageHelp'
import { useRole } from '../lib/useRole'
import type { HelpTopic } from './pageHelpTopics'
import '../pages/help/help.css'

const textOf = (node: Element) => (node.textContent ?? '').replace(/\s+/g, ' ').trim()

/**
 * The part of a chapter a topic asks for: the whole chapter (less its big heading, which the panel shows), only the
 * named sub-headings, or with an empty list only the opening before the first sub-heading.
 */
function pick(chapter: HelpChapter, topic: HelpTopic, single: boolean) {
  const template = document.createElement('template')
  template.innerHTML = chapter.html
  const out = document.createElement('div')
  let keep = !topic.headings || topic.headings.length === 0
  for (const node of [...template.content.childNodes]) {
    if (node instanceof Element && node.tagName === 'H2') continue
    if (node instanceof Element && node.tagName === 'H3') {
      if (!topic.headings) {
        keep = true
      } else {
        keep = topic.headings.includes(textOf(node))
        // One sub-heading is the panel's title already.
        if (keep && single) continue
      }
    }
    if (keep) out.append(node)
  }
  return out.innerHTML
}

/**
 * Help beside the page: the part of the signed-in user's guide that explains the page they're on, opened by the
 * round "?" in the top bar, beside the bell. On the widest screens it sits beside the page, so people can read and work at the
 * same time; narrower, it slides over the page (which would otherwise be squeezed), and on phones it rises from the
 * bottom. It doesn't dim the page. It stays open from page to page, hiding on pages the guide doesn't cover.
 */
export function PageHelpPanel() {
  const { open, setOpen } = usePageHelpPanel()
  const pageHelp = usePageHelp()
  const { role } = useRole()
  const { pathname } = useLocation()
  // Another chapter opened from "More on this page" or a link in the text; Back, or a new page, returns to the
  // page's own help.
  const [opened, setOpened] = useState<{ path: string; chapter: string } | null>(null)
  const other = opened?.path === pathname ? opened.chapter : null
  const setOther = (chapter: string | null) => setOpened(chapter ? { path: pathname, chapter } : null)
  const [zoomed, setZoomed] = useState<string | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const { data: help, isPending, isError } = useQuery({ queryKey: ['help', role], queryFn: helpApi.get, staleTime: Infinity, retry: false, enabled: open })

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 })
  }, [other, pathname])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      // Escape belongs to an open pop-up first.
      if (event.key === 'Escape' && !document.querySelector('[aria-modal="true"]')) setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, setOpen])

  const view = useMemo(() => {
    if (!help || !pageHelp) return null
    const chapterOf = (id: string) => help.chapters.find((item) => item.id === id)
    if (other) {
      const chapter = chapterOf(other)
      return chapter && { title: chapter.title, html: pick(chapter, { chapter: other }, false), chapterId: other, more: [] }
    }
    const shown = pageHelp.show.flatMap((topic) => {
      const chapter = chapterOf(topic.chapter)
      return chapter ? [{ topic, chapter }] : []
    })
    if (!shown.length) return null
    const single = shown.length === 1 && shown[0].topic.headings?.length === 1
    const first = shown[0]
    return {
      title: pageHelp.title ?? (single ? first.topic.headings![0] : first.chapter.title),
      html: shown.map(({ topic, chapter }) => pick(chapter, topic, single)).join(''),
      chapterId: first.chapter.id,
      more: (pageHelp.more ?? []).flatMap((id) => chapterOf(id) ?? []),
    }
  }, [help, pageHelp, other])

  if (!open || !pageHelp) return null

  // Links to other chapters open them here; pictures open full size.
  const onBodyClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    const link = target.closest<HTMLElement>('a[data-chapter]')
    if (link) {
      event.preventDefault()
      setOther(link.dataset.chapter!)
      return
    }
    if (target instanceof HTMLImageElement) setZoomed(target.src)
  }

  return (
    <>
      <aside
        id="page-help"
        aria-label="Help for this page"
        className="fixed inset-x-0 bottom-0 z-40 flex h-[85vh] flex-col rounded-t-2xl border-t border-line bg-surface shadow-2xl motion-safe:animate-fade-up sm:inset-x-auto sm:right-0 sm:top-0 sm:h-full sm:w-[24rem] sm:rounded-none sm:border-l sm:border-t-0 sm:motion-safe:animate-slide-in-right 2xl:relative 2xl:z-auto 2xl:m-2 2xl:ml-0 2xl:h-auto 2xl:shrink-0 2xl:rounded-2xl 2xl:border 2xl:border-line 2xl:shadow-lg"
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-line-subtle px-5 py-4">
          <div className="min-w-0 flex-1">
            {other ? (
              <button type="button" onClick={() => setOther(null)} className="flex items-center gap-1 text-xs font-medium text-fg-muted hover:text-fg">
                <ArrowLeft className="size-3.5" /> Back to this page
              </button>
            ) : (
              <p className="text-xs font-semibold uppercase tracking-wider text-accent">Help · {help?.role ?? role}</p>
            )}
            <h2 className="mt-0.5 text-base font-semibold text-fg">{view?.title ?? 'Help'}</h2>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="-mr-1 rounded-md p-1 text-fg-muted hover:bg-surface-muted hover:text-fg" aria-label="Close help">
            <X className="size-5" />
          </button>
        </div>

        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {isError ? (
            <p className="text-sm text-fg-muted">Help isn't available right now. Try again in a moment.</p>
          ) : isPending ? (
            <div className="space-y-3" aria-busy="true">
              {[0, 1, 2].map((row) => (
                <div key={row} className="h-16 animate-pulse rounded-lg bg-surface-muted" />
              ))}
            </div>
          ) : view ? (
            <>
              <div onClick={onBodyClick} className="help-doc compact" dangerouslySetInnerHTML={{ __html: view.html }} />
              {view.more.length > 0 && (
                <>
                  <h3 className="mb-2 mt-6 text-sm font-semibold text-fg">More on this page</h3>
                  <ul className="space-y-1.5">
                    {view.more.map((chapter) => (
                      <li key={chapter.id}>
                        <button type="button" onClick={() => setOther(chapter.id)} className="flex w-full items-center gap-2 rounded-lg border border-line px-3 py-2.5 text-left hover:bg-surface-muted">
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-fg">{chapter.title}</span>
                            <span className="block text-xs text-fg-muted">{chapter.summary}</span>
                          </span>
                          <ChevronRight className="size-4 shrink-0 text-fg-muted" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          ) : (
            <p className="text-sm text-fg-muted">Your guide doesn't cover this page.</p>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line-subtle px-5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 text-sm">
          <span className="text-fg-muted">{help?.role ?? role} guide</span>
          <Link to={`/help/${view?.chapterId ?? ''}`} onClick={() => setOpen(false)} className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
            Open full guide <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
      </aside>

      {zoomed && (
        <button type="button" onClick={() => setZoomed(null)} aria-label="Close picture" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 motion-safe:animate-fade-in">
          <img src={zoomed} alt="" className="max-h-full max-w-full rounded-lg shadow-2xl" />
        </button>
      )}
    </>
  )
}
