import { plainText } from '@/lib/mentions'
/** What the right-side inspector shows. It opens and closes only through the URL (`?thread=` / `?ticket=`). */
export type InspectorTarget = { kind: 'thread'; messageId: string } | { kind: 'ticket'; key: string }

/** The inspector the URL asks for: a ticket wins over a thread; blank values mean nothing. */
export function parseInspector(search: URLSearchParams): InspectorTarget | null {
  const key = search.get('ticket')?.trim().toUpperCase()
  if (key) return { kind: 'ticket', key }
  const messageId = search.get('thread')?.trim()
  if (messageId) return { kind: 'thread', messageId }
  return null
}

/** A copy of the params that opens `target` (or closes the inspector with null), keeping every other param. */
export function withInspector(search: URLSearchParams, target: InspectorTarget | null): URLSearchParams {
  const next = new URLSearchParams(search)
  next.delete('thread')
  next.delete('ticket')
  if (target?.kind === 'thread') next.set('thread', target.messageId)
  if (target?.kind === 'ticket') next.set('ticket', target.key)
  return next
}

/** A message's first non-empty line, cut to `max` characters (the inspector's title). */
export function firstLine(content: string, max = 60): string {
  const line = plainText(content).split('\n').map((part) => part.trim()).find(Boolean) ?? ''
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line
}
