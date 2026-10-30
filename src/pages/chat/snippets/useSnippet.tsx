import { useRef, useState, type ReactNode } from 'react'
import { uploadChatFile } from '@/api/files'
import type { Attachment } from '@/api/types'
import { parseBody, type Body } from '@/lib/messageBody'
import { SnippetDialog, type NewSnippet } from '@/pages/chat/snippets/SnippetDialog'

/** A snippet may be this long (characters); the counter shows in the last 1,000. */
export const MAX_SNIPPET = 100_000

/** The snippet's file name: its title made safe for a file system, or "snippet". */
export const snippetFileName = (title: string) => `${title.trim().replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '') || 'snippet'}.txt`

/**
 * Text snippet (spec 6.9): `open(text)` shows the dialog with the box's text as its content and resolves true once the
 * snippet is created and sent (the box then empties), false on Cancel. Create uploads a .txt in the chosen type, then
 * `send` posts it with the optional message: in the channel, or as a thread reply.
 */
export function useSnippet({ channelId, where, send }: { channelId: string; where: string; send: (file: Attachment, message: Body) => Promise<unknown> }): {
  dialog: ReactNode
  open: (text: string) => Promise<boolean>
} {
  const [content, setContent] = useState<string | null>(null)
  const answer = useRef<((created: boolean) => void) | null>(null)
  const finish = (created: boolean) => {
    answer.current?.(created)
    answer.current = null
    setContent(null)
  }
  const open = (text: string) =>
    new Promise<boolean>((resolve) => {
      answer.current?.(false)
      answer.current = resolve
      setContent(text)
    })
  const create = async ({ title, language, content: code, message }: NewSnippet) => {
    const file = new File([code], snippetFileName(title), { type: 'text/plain' })
    const uploaded = await uploadChatFile(channelId, file, { snippet: { language } })
    await send(uploaded, message.trim() ? parseBody(message) : [])
    finish(true)
  }
  const dialog = content !== null && <SnippetDialog where={where} initialContent={content} max={MAX_SNIPPET} onCreate={create} onClose={() => finish(false)} />
  return { dialog, open }
}
