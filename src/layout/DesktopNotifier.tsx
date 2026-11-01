import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { useNotifyLookups } from '@/api/notifyLookups'
import type { ChatMessage, ThreadReply } from '@/api/types'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { watchFlowInFront } from '@/lib/flowInFront'
import { desktopNote, notifies } from '@/lib/notifyRules'
import { paths } from '@/lib/paths'
import { useRealtime } from '@/lib/realtime'

const allowed = () => typeof Notification !== 'undefined' && Notification.permission === 'granted'

/**
 * Desktop notifications (spec 6.11 Delivery): a live message or reply that notifies me (`notifies`), with desktop on,
 * shows one while no Flow tab is in front, and clicking it opens the message or its thread. Badges and counts in the app are
 * RealtimeBridge's; the backend sends push and email by the same rules.
 */
export function DesktopNotifier(): null {
  const realtime = useRealtime()
  const lookups = useNotifyLookups()
  const navigate = useNavigate()
  const { workspaces } = useCurrentWorkspace()
  const known = useRef(workspaces)
  useEffect(() => {
    known.current = workspaces
  }, [workspaces])

  useEffect(() => {
    // Not while Flow is the window in front of me: this tab, or another Flow tab in this browser.
    const front = watchFlowInFront({ inFront: () => !document.hidden && document.hasFocus(), target: window, doc: document })
    const mayShow = () => allowed() && !front.anyInFront()
    const show = async (row: ChatMessage | ThreadReply, rootId: string | null) => {
      // Asked first, so a message in a tab I'm looking at costs nothing.
      if (!mayShow()) return
      try {
        const [me, prefs, channel] = await Promise.all([lookups.me(), lookups.preferences(), lookups.channel(row.channelId)])
        if (!prefs.desktop || !channel.memberIds.includes(me.id) || !notifies(row, channel, me.id, prefs, new Date())) return
        const ws = known.current.find((w) => w.id === channel.workspaceId)?.slug
        if (!ws) return
        const { title, body } = desktopNote(row, rootId !== null, channel, await lookups.people(channel.workspaceId))
        // I may have come back to Flow while it was worked out.
        if (!mayShow()) return
        const href = rootId ? `${paths.channel(ws, channel.id)}?thread=${encodeURIComponent(rootId)}` : paths.message(ws, channel.id, row.id)
        // The tag keeps one notification per message: another tab, or a reply also sent to the channel, replaces it.
        const note = new Notification(title, { body, tag: row.id })
        note.onclick = () => {
          window.focus()
          navigate(href)
          note.close()
        }
      } catch {
        // A message I can't read, or my preferences didn't load: no notification rather than a wrong one.
      }
    }
    const offs = [realtime.onMessageReceived((message) => void show(message, null)), realtime.onReplyReceived((reply) => void show(reply, reply.messageId))]
    return () => {
      offs.forEach((off) => off())
      front.stop()
    }
  }, [realtime, lookups, navigate])

  return null
}
