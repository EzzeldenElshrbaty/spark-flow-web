import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { ArrowRight, Inbox, Trophy, XCircle } from 'lucide-react'
import { useRef, useState, type DragEvent } from 'react'
import { Link } from 'react-router'
import { formatCompact } from '../../lib/format'
import { useMarket } from '../../lib/useMarket'
import { useViewer } from '../../lib/useRole'
import { isOpportunityManager, opportunitiesApi, type OpportunityRow } from '../../api/opportunities'
import { DealCard } from './DealCard'
import { LostDialog, RequestWonDialog, WonDialog } from './dialogs'
import { MoveDialog } from './MoveDialog'

/**
 * Kanban: a column per pipeline stage (open and on-hold deals), then Won and Lost from the last 30
 * days. Drag a card to another stage to move it (with a quick update); dropping on Won or Lost opens that dialog.
 */
export function OpportunityBoard({ search, repId }: { search: string; repId: string }) {
  const viewer = useViewer()
  const { scope } = useMarket()
  const manager = isOpportunityManager(viewer.role)
  const [dragging, setDragging] = useState<OpportunityRow | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [closing, setClosing] = useState<{ id: string; kind: 'won' | 'lost' } | null>(null)
  const [moving, setMoving] = useState<{ row: OpportunityRow; stageId: string; label: string } | null>(null)
  const [notice, setNotice] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const trackRef = useRef<HTMLDivElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  const { data } = useQuery({ queryKey: ['opportunities', 'board', viewer.role, viewer.name, scope, search, repId], queryFn: () => opportunitiesApi.board(viewer, scope, search, repId) })
  const closingDetail = useQuery({ queryKey: ['opportunities', 'detail', closing?.id, viewer.role, viewer.name], queryFn: () => opportunitiesApi.get(viewer, closing!.id), enabled: !!closing })

  const canDrag = (row: OpportunityRow) => row.status === 'Open' && (manager || (!!viewer.repId && row.repId === viewer.repId))
  const say = (text: string) => {
    setNotice(text)
    setTimeout(() => setNotice(''), 3500)
  }

  const drop = (columnId: string) => (event: DragEvent) => {
    event.preventDefault()
    setOver(null)
    const row = dragging
    setDragging(null)
    if (!row || row.stageId === columnId) return
    if (columnId === 'won') {
      if (row.wonRequested && viewer.role !== 'Management') return say('Already sent to Management to confirm.')
      return setClosing({ id: row.id, kind: 'won' })
    }
    if (columnId === 'lost') return setClosing({ id: row.id, kind: 'lost' })
    setMoving({ row, stageId: columnId, label: data?.columns.find((column) => column.id === columnId)?.label ?? columnId })
  }

  if (!data) {
    return (
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-96 w-full shrink-0 animate-pulse rounded-xl bg-surface-muted md:w-[296px]" />
        ))}
      </div>
    )
  }

  const showMoney = viewer.role !== 'Presales'

  // Phones: one stage fills the screen; the strip above jumps to a stage and follows the swipe.
  const goTo = (index: number) => {
    const track = trackRef.current
    const column = track?.children[index] as HTMLElement | undefined
    if (!track || !column) return
    track.scrollTo({ left: column.offsetLeft - track.offsetLeft - 16, behavior: 'smooth' })
  }
  const onTrackScroll = () => {
    const track = trackRef.current
    const first = track?.children[0] as HTMLElement | undefined
    if (!track || !first || window.matchMedia('(min-width: 768px)').matches) return
    const index = Math.round(track.scrollLeft / (first.offsetWidth + 12))
    if (index !== activeIndex) {
      setActiveIndex(index)
      const tab = stripRef.current?.children[index] as HTMLElement | undefined
      tab?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
      // A shorter stage would leave the page scrolled past its end; bring the stage's top back into view.
      const top = track.getBoundingClientRect().top
      if (top < 0) window.scrollBy({ top: top - 140, behavior: 'smooth' })
    }
  }

  return (
    <>
      {notice && (
        <p role="status" className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 motion-safe:animate-fade-in dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          {notice}
        </p>
      )}


      {/* Phones: stage tabs that stay under the top bar. */}
      <div className="sticky top-16 z-10 -mx-4 mb-2 bg-canvas/95 px-4 py-2 backdrop-blur md:hidden">
        <div ref={stripRef} className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]" role="tablist" aria-label="Stages">
          {data.columns.map((column, index) => {
            const active = index === activeIndex
            return (
              <button
                key={column.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setActiveIndex(index)
                  goTo(index)
                }}
                className={clsx(
                  'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors',
                  active ? 'bg-accent-soft font-medium text-accent' : 'text-fg-muted',
                )}
              >
                <span className={clsx('size-2 rounded-full', stageTint(column.id, index).dot)} aria-hidden />
                {column.label}
                <span className="text-xs tabular-nums opacity-70">{column.count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Columns scroll sideways; on phones each stage fills the width and snaps into place. */}
      <div
        ref={trackRef}
        onScroll={onTrackScroll}
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 items-start gap-3 overflow-x-auto px-4 pb-4 [scrollbar-width:thin] md:mx-0 md:snap-none md:px-0"
      >
        {data.columns.map((column, index) => {
          const closed = column.id === 'won' || column.id === 'lost'
          const Icon = column.id === 'won' ? Trophy : column.id === 'lost' ? XCircle : null
          const tint = stageTint(column.id, index)
          return (
            <section
              key={column.id}
              aria-label={`${column.label}: ${column.count} deals`}
              onDragOver={(event) => {
                if (!dragging) return
                event.preventDefault()
                setOver(column.id)
              }}
              onDragLeave={() => setOver((current) => (current === column.id ? null : current))}
              onDrop={drop(column.id)}
              className={clsx(
                'flex w-full shrink-0 snap-start flex-col overflow-hidden rounded-xl border transition-colors md:max-h-[calc(100dvh-14rem)] md:w-[296px]',
                over === column.id ? 'border-brand-500 ring-2 ring-brand-500/30' : tint.border,
                tint.body,
                closed && 'md:w-[272px]',
              )}
            >
              <header className={clsx('border-b px-3.5 py-3', tint.head, tint.border)}>
                <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-fg">
                  {Icon ? <Icon className={clsx('size-4 shrink-0', tint.text)} /> : <span className={clsx('size-2 shrink-0 rounded-full', tint.dot)} aria-hidden />}
                  <span className="truncate">{column.label}</span>
                  <span className="ml-auto rounded-full bg-surface/80 px-2 py-px text-xs font-medium tabular-nums text-fg-tertiary">{column.count}</span>
                </h2>
                <p className="mt-1 pl-4 text-xs tabular-nums text-fg-muted">
                  {showMoney && <span className="font-medium text-fg-secondary">{formatCompact(column.total, data.currency)}</span>}
                  {closed ? `${showMoney ? ' · ' : ''}Last 30 days` : <span title="Chance to close at this stage">{showMoney ? ' · ' : ''}{column.probability}% chance</span>}
                </p>
              </header>
              <ul className="min-h-0 flex-1 space-y-2 p-2 md:overflow-y-auto">
                {column.items.map((row) => (
                  <li
                    key={row.id}
                    draggable={canDrag(row)}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = 'move'
                      event.dataTransfer.setData('text/plain', row.id)
                      setDragging(row)
                    }}
                    onDragEnd={() => {
                      setDragging(null)
                      setOver(null)
                    }}
                    className={clsx('motion-safe:animate-fade-in', canDrag(row) && 'md:cursor-grab md:active:cursor-grabbing', dragging?.id === row.id && 'opacity-40')}
                  >
                    <DealCard row={row} showRep={manager} />
                  </li>
                ))}
                {column.count > column.items.length && (
                  <li>
                    <Link
                      to={`?view=list&tab=open&stage=${column.id}`}
                      className="flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-xs font-medium text-accent hover:bg-surface"
                    >
                      +{column.count - column.items.length} more in the list <ArrowRight className="size-3.5" />
                    </Link>
                  </li>
                )}
                {column.count === 0 && (
                  <li className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-line-strong/70 px-3 py-8 text-center text-xs text-fg-subtle">
                    <Inbox className="size-5" />
                    {closed ? 'None in the last 30 days' : <span>No deals here<span className="max-md:hidden"> yet. Drag one in.</span></span>}
                  </li>
                )}
              </ul>
            </section>
          )
        })}
      </div>

      {closing && closingDetail.data && closing.kind === 'won' && viewer.role === 'Management' && <WonDialog opportunity={closingDetail.data} onClose={() => setClosing(null)} />}
      {closing && closingDetail.data && closing.kind === 'won' && viewer.role !== 'Management' && <RequestWonDialog opportunity={closingDetail.data} onClose={() => setClosing(null)} />}
      {moving && (
        <MoveDialog
          opportunityId={moving.row.id}
          company={moving.row.company}
          fromStageId={moving.row.stageId}
          toStageId={moving.stageId}
          current={moving.row.nextAction}
          onClose={() => setMoving(null)}
        />
      )}
      {closing && closingDetail.data && closing.kind === 'lost' && <LostDialog opportunity={closingDetail.data} onClose={() => setClosing(null)} />}
    </>
  )
}

/**
 * Light pastel per stage so each column reads as its own section: a tinted header band and a faint
 * tint behind the cards. Open stages take colors in order (stages are set in Settings); Won is green, Lost grey.
 */
const tints = [
  { head: 'bg-sky-50 dark:bg-sky-500/10', body: 'bg-sky-50/40 dark:bg-sky-500/[0.04]', border: 'border-sky-100 dark:border-sky-500/20', dot: 'bg-sky-400', text: 'text-sky-500' },
  { head: 'bg-violet-50 dark:bg-violet-500/10', body: 'bg-violet-50/40 dark:bg-violet-500/[0.04]', border: 'border-violet-100 dark:border-violet-500/20', dot: 'bg-violet-400', text: 'text-violet-500' },
  { head: 'bg-amber-50 dark:bg-amber-500/10', body: 'bg-amber-50/40 dark:bg-amber-500/[0.04]', border: 'border-amber-100 dark:border-amber-500/20', dot: 'bg-amber-400', text: 'text-amber-500' },
  { head: 'bg-rose-50 dark:bg-rose-500/10', body: 'bg-rose-50/40 dark:bg-rose-500/[0.04]', border: 'border-rose-100 dark:border-rose-500/20', dot: 'bg-rose-400', text: 'text-rose-500' },
  { head: 'bg-teal-50 dark:bg-teal-500/10', body: 'bg-teal-50/40 dark:bg-teal-500/[0.04]', border: 'border-teal-100 dark:border-teal-500/20', dot: 'bg-teal-400', text: 'text-teal-500' },
]
const wonTint = { head: 'bg-emerald-50 dark:bg-emerald-500/10', body: 'bg-emerald-50/40 dark:bg-emerald-500/[0.04]', border: 'border-emerald-100 dark:border-emerald-500/20', dot: 'bg-emerald-400', text: 'text-emerald-500' }
const lostTint = { head: 'bg-slate-100 dark:bg-white/5', body: 'bg-slate-50/60 dark:bg-white/[0.02]', border: 'border-slate-200 dark:border-white/10', dot: 'bg-slate-400', text: 'text-slate-400' }

function stageTint(id: string, index: number) {
  if (id === 'won') return wonTint
  if (id === 'lost') return lostTint
  return tints[index % tints.length]
}
