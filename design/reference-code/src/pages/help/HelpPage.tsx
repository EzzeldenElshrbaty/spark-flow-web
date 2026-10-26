import clsx from 'clsx'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, BookOpen, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { helpApi, type HelpChapter } from '../../api/help'
import { Card } from '../../components/ui/Card'
import { inputClass } from '../../components/ui/Field'
import { useRole } from '../../lib/useRole'
import './help.css'

type Heading = { id: string; text: string }

/** Words around the first match, for the search results. */
function snippet(text: string, term: string) {
  const at = text.toLowerCase().indexOf(term.toLowerCase())
  if (at < 0) return ''
  const start = Math.max(0, at - 50)
  return `${start > 0 ? '…' : ''}${text.slice(start, at + term.length + 70)}…`
}

/**
 * Help, like a documentation site: the guide for the signed-in user's role, a chapter at a time, with the chapters on
 * the left, "On this page" on the right and a search across the whole guide.
 */
export function HelpPage() {
  const { chapter: chapterId } = useParams()
  const navigate = useNavigate()
  const { role } = useRole()
  const { data: help, isPending, isError } = useQuery({ queryKey: ['help', role], queryFn: helpApi.get, staleTime: Infinity, retry: false })
  const [term, setTerm] = useState('')
  const [headings, setHeadings] = useState<Heading[]>([])
  const [activeHeading, setActiveHeading] = useState('')
  const [zoomed, setZoomed] = useState<string | null>(null)
  const articleRef = useRef<HTMLDivElement>(null)
  const topRef = useRef<HTMLDivElement>(null)

  const chapters = useMemo(() => help?.chapters ?? [], [help])
  const index = Math.max(0, chapters.findIndex((item) => item.id === chapterId))
  const chapter: HelpChapter | undefined = chapters[index]

  const results = useMemo(() => {
    const query = term.trim()
    if (query.length < 2) return []
    return chapters.filter((item) => item.text.toLowerCase().includes(query.toLowerCase())).map((item) => ({ chapter: item, snippet: snippet(item.text, query) }))
  }, [chapters, term])

  // Each chapter's sub-headings get anchors for "On this page", which follows the reader as they scroll.
  useEffect(() => {
    const article = articleRef.current
    if (!article || !chapter) return
    const found = [...article.querySelectorAll('h3')].map((heading, position) => {
      heading.id = `${chapter.id}-${position}`
      return { id: heading.id, text: heading.textContent ?? '' }
    })
    setHeadings(found)
    setActiveHeading(found[0]?.id ?? '')
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (visible) setActiveHeading(visible.target.id)
      },
      { rootMargin: '-80px 0px -65% 0px' },
    )
    article.querySelectorAll('h3').forEach((heading) => observer.observe(heading))
    // The app's content panel scrolls on its own on desktop, so bring the page's top into view rather than the window's.
    topRef.current?.scrollIntoView({ block: 'start' })
    return () => observer.disconnect()
  }, [chapter])

  const open = (id: string) => {
    setTerm('')
    navigate(`/help/${id}`)
  }

  // Links between chapters, and pictures that open full size.
  const onArticleClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    const link = target.closest<HTMLElement>('a[data-chapter]')
    if (link) {
      event.preventDefault()
      open(link.dataset.chapter!)
      return
    }
    if (target instanceof HTMLImageElement) setZoomed(target.src)
  }

  if (isError) {
    return (
      <Card className="mx-auto mt-10 max-w-md p-8 text-center">
        <BookOpen className="mx-auto size-8 text-fg-subtle" />
        <h1 className="mt-3 text-lg font-semibold">Help isn't available</h1>
        <p className="mt-1 text-sm text-fg-muted">Help opens once you're signed in to Spark CRM. If you are, try again in a moment.</p>
      </Card>
    )
  }

  return (
    <div ref={topRef} className="help-page scroll-mt-24">
      <header className="mb-6 flex flex-col gap-4 border-b border-line-subtle pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent">
            <BookOpen className="size-4" /> Help
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-fg">{help ? `${help.role} guide` : 'Help'}</h1>
          <p className="mt-1 text-sm text-fg-muted">How to use Spark CRM in your role.</p>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
          <input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Search the guide" aria-label="Search the guide" className={clsx(inputClass, 'pl-9 pr-9')} />
          {term && (
            <button type="button" onClick={() => setTerm('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-fg-muted hover:text-fg">
              <X className="size-4" />
            </button>
          )}
        </div>
      </header>

      {isPending ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((row) => (
            <div key={row} className="h-24 animate-pulse rounded-xl bg-surface-muted" />
          ))}
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_200px]">
          {/* Chapters: a list on the left from tablet width, a dropdown on phones. */}
          <nav aria-label="Chapters" className="lg:sticky lg:top-20 lg:self-start">
            <select value={chapter?.id} onChange={(event) => open(event.target.value)} aria-label="Chapter" className={clsx(inputClass, 'select-chevron pr-9 lg:hidden')}>
              {chapters.map((item, position) => (
                <option key={item.id} value={item.id}>
                  {position}. {item.title}
                </option>
              ))}
            </select>
            <ol className="hidden space-y-0.5 lg:block">
              {chapters.map((item, position) => (
                <li key={item.id}>
                  <Link
                    to={`/help/${item.id}`}
                    onClick={() => setTerm('')}
                    aria-current={item.id === chapter?.id ? 'page' : undefined}
                    className={clsx(
                      'flex items-baseline gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                      item.id === chapter?.id ? 'bg-accent-soft font-medium text-accent' : 'text-fg-secondary hover:bg-surface-muted hover:text-fg',
                    )}
                  >
                    <span className="w-5 shrink-0 text-xs tabular-nums text-fg-muted">{String(position).padStart(2, '0')}</span>
                    <span>{item.title}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </nav>

          <article className="min-w-0">
            {term.trim().length >= 2 ? (
              <section aria-live="polite">
                <p className="mb-3 text-sm text-fg-muted">
                  {results.length ? `${results.length} chapter${results.length === 1 ? '' : 's'} mention “${term.trim()}”` : `Nothing in the guide matches “${term.trim()}”.`}
                </p>
                <ul className="space-y-2">
                  {results.map(({ chapter: item, snippet: text }) => (
                    <li key={item.id}>
                      <button type="button" onClick={() => open(item.id)} className="w-full rounded-xl border border-line bg-surface px-5 py-4 text-left shadow-sm hover:border-accent-line hover:bg-accent-soft">
                        <span className="block font-medium text-fg">{item.title}</span>
                        <span className="mt-1 block text-sm text-fg-muted">{text}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : (
              chapter && (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wider text-accent">
                    {String(index).padStart(2, '0')} · {chapter.title}
                  </p>
                  <div ref={articleRef} onClick={onArticleClick} className="help-doc" dangerouslySetInnerHTML={{ __html: chapter.html }} />
                  {index === 0 && (
                    <ul className="mt-8 grid gap-3 sm:grid-cols-2">
                      {chapters.slice(1).map((item, position) => (
                        <li key={item.id}>
                          <Link to={`/help/${item.id}`} className="block h-full rounded-xl border border-line bg-surface px-4 py-3.5 shadow-sm transition-colors hover:border-accent-line hover:bg-accent-soft">
                            <span className="text-xs font-semibold tabular-nums text-accent">{String(position + 1).padStart(2, '0')}</span>
                            <span className="mt-0.5 block font-medium text-fg">{item.title}</span>
                            <span className="mt-0.5 block text-sm text-fg-muted">{item.summary}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-10 grid gap-3 border-t border-line-subtle pt-6 sm:grid-cols-2">
                    {chapters[index - 1] ? (
                      <Link to={`/help/${chapters[index - 1].id}`} className="rounded-xl border border-line px-4 py-3 hover:border-accent-line hover:bg-accent-soft">
                        <span className="flex items-center gap-1.5 text-xs text-fg-muted">
                          <ArrowLeft className="size-3.5" /> Previous
                        </span>
                        <span className="mt-0.5 block text-sm font-medium text-fg">{chapters[index - 1].title}</span>
                      </Link>
                    ) : (
                      <span />
                    )}
                    {chapters[index + 1] && (
                      <Link to={`/help/${chapters[index + 1].id}`} className="rounded-xl border border-line px-4 py-3 text-right hover:border-accent-line hover:bg-accent-soft">
                        <span className="flex items-center justify-end gap-1.5 text-xs text-fg-muted">
                          Next <ArrowRight className="size-3.5" />
                        </span>
                        <span className="mt-0.5 block text-sm font-medium text-fg">{chapters[index + 1].title}</span>
                      </Link>
                    )}
                  </div>
                </>
              )
            )}
          </article>

          {headings.length > 0 && term.trim().length < 2 && (
            <aside aria-label="On this page" className="hidden xl:sticky xl:top-20 xl:block xl:self-start">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-muted">On this page</p>
              <ul className="space-y-1 border-l border-line-subtle">
                {headings.map((heading) => (
                  <li key={heading.id}>
                    <a
                      href={`#${heading.id}`}
                      onClick={(event) => {
                        event.preventDefault()
                        document.getElementById(heading.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      }}
                      className={clsx('-ml-px block border-l-2 py-1 pl-3 text-sm', heading.id === activeHeading ? 'border-accent text-fg' : 'border-transparent text-fg-muted hover:text-fg')}
                    >
                      {heading.text}
                    </a>
                  </li>
                ))}
              </ul>
            </aside>
          )}
        </div>
      )}

      {zoomed && (
        <button type="button" onClick={() => setZoomed(null)} aria-label="Close picture" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 motion-safe:animate-fade-in">
          <img src={zoomed} alt="" className="max-h-full max-w-full rounded-lg shadow-2xl" />
        </button>
      )}
    </div>
  )
}
