import clsx from 'clsx'
import { ArrowLeft, ArrowRight, BookOpen, Search, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { useRoleNames } from '@/api/roles'
import { inputClass, selectClass } from '@/components/ui/Field'
import { HELP_GROUPS, type HelpChapter } from '@/lib/helpMarkdown'
import { paths } from '@/lib/paths'
import { NEEDS_TEXT, useHelpChapters } from '@/lib/useHelp'
import { useRole } from '@/lib/useRole'
import { HelpDoc } from './HelpDoc'
import { useParam } from '@/lib/searchParams'
import { IconButton } from '@/components/ui/IconButton'
import { useDocumentTitle } from '@/lib/useDocumentTitle'

/** Lower case, with ’ and ‘ read as ' (help is written with ’; people type '), keeping every index in place. */
const fold = (text: string) => text.toLowerCase().replace(/[’‘]/g, "'")

/** Words around the first match, for a search result. */
function snippet(text: string, term: string) {
  const at = fold(text).indexOf(fold(term))
  if (at < 0) return ''
  const start = Math.max(0, at - 50)
  return `${start > 0 ? '…' : ''}${text.slice(start, at + term.length + 70)}…`
}

/**
 * The help centre (Admin and help, slice 6, as the CRM's Help): the chapters this person's roles allow, grouped like the
 * sidebar, one at a time, with group chips, a search across them, "On this page" and Previous / Next.
 */
export function HelpPage() {
  useDocumentTitle(['Help centre'])
  const { ws = '', chapter: chapterId } = useParams()
  const { hash } = useLocation()
  const navigate = useNavigate()
  const { persona } = useRole()
  const roleNames = useRoleNames()
  const { chapters, isError } = useHelpChapters()
  // In the address (UX Phase 2, 2.7): typing replaces the entry; a topic is a step Back undoes.
  const [term, setTerm] = useParam('q', { typed: true })
  const [group, setGroup] = useParam('group')
  const top = useRef<HTMLDivElement>(null)

  const list = chapters ?? []
  const shown = group ? list.filter((c) => c.group === group) : list
  const chapter: HelpChapter | undefined = chapterId ? list.find((c) => c.id === chapterId) : list[0]
  const index = chapter ? list.indexOf(chapter) : -1
  const query = term.trim()
  const results = query.length < 2 ? [] : list.filter((c) => fold(c.text).includes(fold(query)))
  const sections = chapter?.blocks.flatMap((b) => (b.type === 'h2' ? [b] : [])) ?? []

  // A new chapter starts at its top, or at the section the link named.
  useEffect(() => {
    if (!chapter) return
    let id = ''
    try {
      id = decodeURIComponent(hash.slice(1))
    } catch {
      // A broken address: the chapter's top.
    }
    const target = id ? document.getElementById(id) : null
    ;(target ?? top.current)?.scrollIntoView({ block: 'start' })
  }, [chapter, hash])

  // A picked topic stays picked while its own chapters open.
  const hrefOf = (id: string, section: string | null = null) => {
    const path = paths.help(ws, id, section)
    if (!group || list.find((c) => c.id === id)?.group !== group) return path
    const [base, hash] = path.split('#')
    return `${base}?group=${encodeURIComponent(group)}${hash ? `#${hash}` : ''}`
  }
  const open = (id: string, section: string | null = null) => {
    setTerm('')
    navigate(hrefOf(id, section))
  }

  if (isError) {
    return (
      <div className="mx-auto mt-10 max-w-md rounded-xl border border-line bg-surface p-8 text-center shadow-sm">
        <BookOpen className="mx-auto size-8 text-fg-subtle" />
        <h1 className="mt-3 text-lg font-semibold text-fg">Help didn’t load</h1>
        <p className="mt-1 text-sm text-fg-muted">Reload the page to try again.</p>
      </div>
    )
  }

  return (
    <div ref={top} className="scroll-mt-24">
      <header className="mb-5 flex flex-col gap-4 border-b border-line-subtle pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent">
            <BookOpen className="size-4" /> Help
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-fg">Help centre</h1>
          <p className="mt-1 text-sm text-fg-muted">Shown for your roles: {roleNames(persona.roleIds) || '—'}.</p>
        </div>
        <label className="relative block w-full sm:w-80">
          <span className="sr-only">Search help</span>
          <Search aria-hidden className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" />
          <input type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search help…" className={clsx(inputClass, 'ps-9 pe-9')} />
          {term && (
            <IconButton label="Clear search" icon={X} onClick={() => setTerm('')} className="absolute end-1 top-1/2 -translate-y-1/2" />
          )}
        </label>
      </header>

      {!chapters ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((row) => (
            <div key={row} className="h-24 animate-pulse rounded-xl bg-surface-muted" />
          ))}
        </div>
      ) : (
        <>
          <div role="group" aria-label="Topics" className="mb-5 flex gap-1.5 overflow-x-auto pb-1">
            {['', ...HELP_GROUPS.filter((g) => list.some((c) => c.group === g))].map((g) => (
              <button
                key={g || 'all'}
                type="button"
                aria-pressed={group === g}
                onClick={() => setGroup(g)}
                className={clsx(
                  'min-h-9 shrink-0 rounded-full border px-3 text-sm font-medium transition-colors max-sm:min-h-11',
                  group === g ? 'border-brand-500 bg-accent-soft text-accent' : 'border-line bg-surface text-fg-secondary hover:bg-surface-sunken',
                )}
              >
                {g || 'All'}
              </button>
            ))}
          </div>
          <div className="grid gap-8 lg:grid-cols-[230px_minmax(0,1fr)] xl:grid-cols-[230px_minmax(0,1fr)_200px]">
            <nav aria-label="Chapters" className="lg:sticky lg:top-20 lg:self-start">
              <select value={chapter?.id ?? ''} onChange={(e) => open(e.target.value)} aria-label="Chapter" className={clsx(selectClass, 'lg:hidden')}>
                {shown.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.group} · {c.title}
                  </option>
                ))}
              </select>
              <div className="hidden space-y-4 lg:block">
                {HELP_GROUPS.filter((g) => shown.some((c) => c.group === g)).map((g) => (
                  <div key={g}>
                    <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-fg-muted">{g}</p>
                    <ul className="m-0 list-none space-y-0.5 p-0">
                      {shown
                        .filter((c) => c.group === g)
                        .map((c) => (
                          <li key={c.id}>
                            <Link
                              to={hrefOf(c.id)}
                              onClick={() => setTerm('')}
                              aria-current={c.id === chapter?.id ? 'page' : undefined}
                              className={clsx(
                                'block rounded-lg px-3 py-1.5 text-sm transition-colors',
                                c.id === chapter?.id ? 'bg-accent-soft font-medium text-accent' : 'text-fg-secondary hover:bg-surface-muted hover:text-fg',
                              )}
                            >
                              {c.title}
                            </Link>
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>
            </nav>

            <article className="min-w-0">
              {query.length >= 2 ? (
                <section aria-live="polite">
                  <p className="mb-3 text-sm text-fg-muted">
                    {results.length ? `${results.length} chapter${results.length === 1 ? '' : 's'} mention “${query}”` : `Nothing in help matches “${query}”.`}
                  </p>
                  <ul className="m-0 list-none space-y-2 p-0">
                    {results.map((c) => (
                      <li key={c.id}>
                        <button type="button" onClick={() => open(c.id)} className="w-full rounded-xl border border-line bg-surface px-5 py-4 text-start shadow-sm hover:bg-surface-sunken">
                          <span className="block font-medium text-fg">{c.title}</span>
                          <span className="mt-1 block text-sm text-fg-muted">{snippet(c.text, query)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : !chapter ? (
                <p className="text-sm text-fg-muted">
                  That chapter isn’t in your help.{' '}
                  <Link to={paths.help(ws)} className="font-medium text-accent">
                    Go to Getting started
                  </Link>
                </p>
              ) : (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wider text-accent">{chapter.group}</p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight text-fg">{chapter.title}</h2>
                  {chapter.needs && NEEDS_TEXT[chapter.needs] && <p className="mt-1 text-sm text-fg-muted">For people who can {NEEDS_TEXT[chapter.needs]}.</p>}
                  <div className="mt-4">
                    <HelpDoc blocks={chapter.blocks} onChapter={open} canOpen={(id) => list.some((c) => c.id === id)} hrefOf={hrefOf} />
                  </div>
                  <div className="mt-10 grid gap-3 border-t border-line-subtle pt-6 sm:grid-cols-2">
                    {list[index - 1] ? (
                      <Link to={hrefOf(list[index - 1]!.id)} className="rounded-xl border border-line px-4 py-3 hover:bg-surface-sunken">
                        <span className="flex items-center gap-1.5 text-xs text-fg-muted">
                          <ArrowLeft className="size-3.5 rtl:-scale-x-100" /> Previous
                        </span>
                        <span className="mt-0.5 block text-sm font-medium text-fg">{list[index - 1]!.title}</span>
                      </Link>
                    ) : (
                      <span />
                    )}
                    {list[index + 1] && (
                      <Link to={hrefOf(list[index + 1]!.id)} className="rounded-xl border border-line px-4 py-3 text-end hover:bg-surface-sunken">
                        <span className="flex items-center justify-end gap-1.5 text-xs text-fg-muted">
                          Next <ArrowRight className="size-3.5 rtl:-scale-x-100" />
                        </span>
                        <span className="mt-0.5 block text-sm font-medium text-fg">{list[index + 1]!.title}</span>
                      </Link>
                    )}
                  </div>
                </>
              )}
            </article>

            {sections.length > 1 && query.length < 2 && (
              <aside aria-label="On this page" className="hidden xl:sticky xl:top-20 xl:block xl:self-start">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-muted">On this page</p>
                <ul className="m-0 list-none space-y-1 border-s border-line-subtle p-0">
                  {sections.map((s) => (
                    <li key={s.id}>
                      <a href={`#${s.id}`} onClick={(e) => (e.preventDefault(), document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))} className="-ms-px block border-s-2 border-transparent py-1 ps-3 text-sm text-fg-muted hover:border-line-strong hover:text-fg">
                        {s.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </aside>
            )}
          </div>
        </>
      )}
    </div>
  )
}
