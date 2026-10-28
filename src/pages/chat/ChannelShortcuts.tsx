import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useMarkAllRead, useMarkRead } from '@/api/chat'
import type { Channel } from '@/api/types'
import { Button as SfButton } from '@/components/sf/Button'
import { Modal } from '@/components/sf/Modal'
import { useSidebarGroups } from '@/layout/useSidebarGroups'
import { paths } from '@/lib/paths'
import { sidebarOrder } from '@/pages/chat/channelKeys'
import { useReadHold } from '@/pages/chat/readState'
import { useChannelKeys } from '@/pages/chat/useChannelKeys'

/** Navigation state Alt+↑/↓ leave: the channel they open puts the caret in its composer. */
export type ChannelNavState = { focus?: 'composer' } | null

/**
 * The channel page's keys (spec 10), with the confirm Shift+Esc asks first: the read marker only moves back one
 * channel at a time (U), so marking everything read is hard to undo.
 */
export function ChannelShortcuts({ channel, workspaceSlug }: { channel: Channel; workspaceSlug: string }) {
  const navigate = useNavigate()
  const order = sidebarOrder(useSidebarGroups())
  const { mutate: markRead } = useMarkRead()
  const [confirming, setConfirming] = useState<Channel[] | null>(null)
  useChannelKeys({
    channelId: channel.id,
    order,
    onGo: (id) => navigate(paths.channel(workspaceSlug, id), { state: { focus: 'composer' } satisfies ChannelNavState }),
    onMarkRead: () => {
      if (channel.unreadCount === 0) return
      useReadHold.getState().release(channel.id)
      markRead({ channelId: channel.id })
    },
    onMarkAllRead: () => {
      const unread = order.filter((c) => c.unreadCount > 0)
      if (unread.length > 0) setConfirming(unread)
    },
  })
  return <MarkAllReadModal channels={confirming} onClose={() => setConfirming(null)} />
}

/** Shift+Esc's question: how many channels and DMs have unread messages, then marks them all read. */
export function MarkAllReadModal({ channels, onClose }: { channels: Channel[] | null; onClose: () => void }) {
  const markAll = useMarkAllRead()
  const { reset } = markAll
  const open = channels !== null
  useEffect(() => {
    if (open) reset()
  }, [open, reset])
  const n = channels?.length ?? 0
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mark everything read?"
      description={n === 1 ? '1 channel or direct message has unread messages.' : `${n} channels and direct messages have unread messages.`}
      footer={
        <>
          <SfButton onClick={onClose}>Cancel</SfButton>
          <SfButton
            variant="primary"
            disabled={markAll.isPending}
            onClick={() => {
              const ids = (channels ?? []).map((c) => c.id)
              markAll.mutate(ids, {
                onSuccess: () => {
                  for (const id of ids) useReadHold.getState().release(id)
                  onClose()
                },
              })
            }}
          >
            {markAll.isPending ? 'Marking…' : 'Mark all read'}
          </SfButton>
        </>
      }
    >
      {markAll.error && <p className="sf-small text-sf-error">{(markAll.error as Error).message}</p>}
    </Modal>
  )
}
