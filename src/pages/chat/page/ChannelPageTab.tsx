import { IconHistory } from '@tabler/icons-react'
import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useLatestPage, usePage } from '@/api/pages'
import type { Channel, PageView, User } from '@/api/types'
import { announce } from '@/components/sf/Announcer'
import { Button } from '@/components/sf/Button'
import { Modal } from '@/components/sf/Modal'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { isArchived } from '@/lib/channels'
import { timeAgo } from '@/lib/format'
import { pageAsBody, type PageBody } from '@/lib/pageBody'
import { paths } from '@/lib/paths'
import { useUnsavedChanges } from '@/lib/unsavedChanges'
import { useBodyContext, useProjectKeys } from '@/pages/chat/useBodyContext'
import { useCanWrite } from '@/pages/chat/useCanPost'
import { useComposerDirectory } from '@/pages/chat/useComposerDirectory'
import { PageBar } from './PageBar'
import { PageEditor } from './PageEditor'
import { PageHistory } from './PageHistory'
import { PageReader } from './PageReader'
import { usePageSaving } from './usePageSaving'

/** Pulse lines while the page loads: no spinner. */
function PageSkeleton() {
  return (
    <div aria-busy="true" className="mx-auto w-full max-w-[760px] space-y-3 px-4 py-6 md:px-6">
      {['w-1/3', 'w-full', 'w-11/12', 'w-4/5', 'w-2/3'].map((width, i) => (
        <div key={i} className={`h-4 animate-pulse rounded-sf-sm bg-sf-surface-hover ${width}`} />
      ))}
    </div>
  )
}

/** The hold while it lasts; re-renders when it runs out, so "… is editing" goes by itself. */
function useLiveHold(view: PageView | undefined) {
  const [, tick] = useReducer((n: number) => n + 1, 0)
  const until = view?.editing?.until
  useEffect(() => {
    if (!until) return
    const ms = Date.parse(until) - Date.now()
    if (ms <= 0) return
    const timer = setTimeout(tick, ms + 50)
    return () => clearTimeout(timer)
  }, [until])
  return view?.editing && Date.parse(view.editing.until) > Date.now() ? view.editing : null
}

/**
 * A channel's Page tab (chat spec 6.14): whoever may post edits it, one person at a time, with autosave; everyone else
 * reads it, live. The same in a project's Chat tab.
 */
export function ChannelPageTab({ channel, people, me }: { channel: Channel; people: User[]; me: string }) {
  const page = usePage(channel.id)
  const canWrite = useCanWrite(channel)
  if (page.isError)
    return (
      <div className="mx-auto w-full max-w-[760px] px-4 py-6 md:px-6">
        <p className="sf-ui text-sf-error">Couldn’t load the page.</p>
        <Button size="sm" onClick={() => void page.refetch()}>
          Try again
        </Button>
      </div>
    )
  if (!page.data || canWrite === null) return <PageSkeleton />
  return <LoadedPage key={channel.id} channel={channel} view={page.data} people={people} me={me} mayEdit={canWrite === true && !isArchived(channel)} />
}

function LoadedPage({ channel, view, people, me, mayEdit }: { channel: Channel; view: PageView; people: User[]; me: string; mayEdit: boolean }) {
  const nameOf = (id: string) => people.find((u) => u.id === id)?.name ?? 'Someone'
  const saving = usePageSaving({ channelId: channel.id, view, me, nameOf })
  const { saver } = saving
  const hold = useLiveHold(view)
  const heldBy = hold && hold.userId !== me ? nameOf(hold.userId) : null

  // The editor starts from `initial`; a new key starts it again (Load the latest, or someone else's save).
  const [initial, setInitial] = useState<PageBody>(view.body)
  const [editorKey, setEditorKey] = useState(0)
  const reload = (next: PageView) => {
    saver.loadLatest(next.version)
    saver.start(next.body, next.version)
    setInitial(next.body)
    setEditorKey((k) => k + 1)
  }
  // Someone else saved while I had nothing of my own waiting: my editor shows theirs (mine never reloads under me).
  useEffect(() => {
    if (view.version > saver.base() && !saving.dirty && saving.state !== 'saving' && saving.state !== 'conflict') reload(view)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new version starts it again
  }, [view.version])

  // Read out once: errors, and who started editing.
  useEffect(() => {
    if (saving.error) announce(saving.error)
  }, [saving.error])
  useEffect(() => {
    if (heldBy) announce(`${heldBy} is editing`)
  }, [heldBy])

  // Leaving with changes the page doesn't have: in the app, ask; closing the browser tab, the browser asks.
  const [asked, setAsked] = useState<{ leave: () => void; stay: () => void } | null>(null)
  useUnsavedChanges(saving.dirty, 'page', (leave, stay) => setAsked({ leave, stay }))
  const answer = (pick: 'leave' | 'stay') => {
    const way = asked?.[pick]
    setAsked(null)
    way?.()
  }
  const dirty = useRef(saving.dirty)
  dirty.current = saving.dirty
  useEffect(() => {
    const ask = (event: BeforeUnloadEvent) => {
      if (dirty.current) event.preventDefault()
    }
    const hide = () => void saver.flush()
    addEventListener('beforeunload', ask)
    addEventListener('pagehide', hide)
    return () => {
      removeEventListener('beforeunload', ask)
      removeEventListener('pagehide', hide)
    }
  }, [saver])

  const { workspace } = useCurrentWorkspace()
  const projectKeys = useProjectKeys(channel.workspaceId)
  const scope = useMemo(() => ({ users: people, projectKeys, ws: workspace?.slug ?? '', workspaceId: channel.workspaceId }), [people, projectKeys, workspace?.slug, channel.workspaceId])
  const ctx = useBodyContext(useMemo(() => [pageAsBody(view.body)], [view.body]), scope)
  const directory = useComposerDirectory(channel.workspaceId, channel.memberIds)
  const link = new URL(`${paths.channel(workspace?.slug ?? '', channel.id)}?tab=page`, window.location.origin).href

  const latestPage = useLatestPage()
  const [copied, setCopied] = useState(false)
  const copyMine = () =>
    void navigator.clipboard.writeText(saver.myText()).then(
      () => {
        setCopied(true)
        announce('Copied')
      },
      () => announce('Couldn’t copy your changes'),
    )
  const loadLatest = async () => {
    setCopied(false)
    reload(await latestPage(channel.id))
  }

  const [showHistory, setShowHistory] = useState(false)
  const conflict = saving.state === 'conflict'
  // Someone else holds the page and I have nothing waiting: I read it, live.
  const reading = !mayEdit || (heldBy !== null && !saving.dirty && !conflict)
  const line = heldBy && !conflict ? `${heldBy} is editing` : saving.state === 'saving' ? 'Saving…' : saving.state === 'saved' ? 'Saved' : view.updatedAt && view.updatedBy ? `Saved ${timeAgo(view.updatedAt)} by ${view.updatedBy === me ? 'you' : nameOf(view.updatedBy)}` : ''
  const errorActions = conflict ? (
    <>
      <Button size="sm" onClick={copyMine}>
        {copied ? 'Copied' : 'Copy my changes'}
      </Button>
      <Button size="sm" onClick={() => void loadLatest()}>
        Load the latest
      </Button>
    </>
  ) : saving.state === 'failed' ? (
    <Button size="sm" onClick={() => void saver.flush()}>
      Try again
    </Button>
  ) : null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageBar
        line={line}
        error={saving.error}
        errorActions={errorActions}
        editors={view.editors}
        people={people}
        link={link}
        history={
          <Button variant="ghost" size="sm" icon={IconHistory} touch onClick={() => setShowHistory(true)}>
            History
          </Button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {reading ? (
          view.body.length === 0 && !mayEdit ? (
            <div className="mx-auto w-full max-w-[760px] px-4 py-8 md:px-6">
              <p className="sf-ui-medium text-sf-text">No page yet.</p>
              <p className="sf-small text-sf-text-secondary">People who can post here can start it.</p>
            </div>
          ) : (
            <div className="px-4 py-4 md:px-6">
              <PageReader body={view.body} ctx={ctx} />
            </div>
          )
        ) : (
          <PageEditor key={editorKey} initial={initial} editable={!conflict} directory={directory} onChange={saver.change} onBlur={() => void saver.flush()} />
        )}
      </div>
      {showHistory && <PageHistory channelId={channel.id} ctx={ctx} people={people} mayEdit={mayEdit} currentVersion={view.version} onClose={() => setShowHistory(false)} />}
      <Modal
        open={asked !== null}
        onClose={() => answer('stay')}
        title="Leave without saving the page?"
        description="Your last changes aren’t saved."
        footer={
          <>
            <Button onClick={() => answer('stay')}>Stay</Button>
            <Button variant="danger" onClick={() => answer('leave')}>
              Leave without saving
            </Button>
          </>
        }
      />
    </div>
  )
}
