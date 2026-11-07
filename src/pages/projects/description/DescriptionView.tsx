import type { ReactNode } from 'react'
import type { Attachment } from '@/api/types'
import type { Block, DescBody, Inline, Mark } from '@/lib/messageBody'
import { DescriptionFile } from './DescriptionFile'

/** A web address a description may link to: http or https only; anything else shows as its text. */
const webHref = (href: string) => {
  try {
    return ['http:', 'https:'].includes(new URL(href).protocol) ? href : null
  } catch {
    return null
  }
}

const WRAP: Record<Mark, (child: ReactNode) => ReactNode> = {
  b: (c) => <strong className="font-semibold text-fg">{c}</strong>,
  i: (c) => <em>{c}</em>,
  u: (c) => <u>{c}</u>,
  s: (c) => <s>{c}</s>,
  code: (c) => <code className="rounded bg-surface-muted px-1 font-mono text-[13px]">{c}</code>,
}

function inlines(nodes: Inline[]): ReactNode[] {
  return nodes.map((n, i) => {
    if (n.type === 'text') return <span key={i}>{(n.marks ?? []).reduce<ReactNode>((child, mark) => WRAP[mark](child), n.text)}</span>
    if (n.type === 'link') {
      const href = webHref(n.href)
      return href ? (
        <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="text-accent underline">
          {n.text}
        </a>
      ) : (
        <span key={i}>{n.text}</span>
      )
    }
    // A description holds text and links only; anything else reads as its text.
    return <span key={i}>{n.type === 'task' || n.type === 'project' ? n.key : n.type === 'user' || n.type === 'channel' ? n.name : ''}</span>
  })
}

function block(b: Block, key: number): ReactNode {
  switch (b.type) {
    case 'p':
      return (
        <p key={key} className="whitespace-pre-wrap break-words">
          {inlines(b.children)}
        </p>
      )
    case 'ul':
    case 'ol': {
      const List = b.type
      return (
        <List key={key} className={b.type === 'ul' ? 'list-disc ps-5' : 'list-decimal ps-5'}>
          {b.items.map((item, i) => (
            <li key={i} className="whitespace-pre-wrap break-words">
              {inlines(item)}
            </li>
          ))}
        </List>
      )
    }
    case 'quote':
      return (
        <blockquote key={key} className="space-y-2 border-s-2 border-line-strong ps-3 text-fg-muted">
          {b.children.map(block)}
        </blockquote>
      )
    case 'code':
      return (
        <pre key={key} className="overflow-x-auto rounded-lg bg-surface-sunken p-3 font-mono text-[13px]">
          {b.text}
        </pre>
      )
  }
}

/**
 * A task's description in its panel (spec 5.2), as elements, never HTML: paragraphs, lists, quotes, code, links (new
 * tab, http and https only), and its files (a picture, or a chip that opens the viewer). A file the task no longer has
 * says so. Empty: "—".
 */
export function DescriptionView({ body, files, onOpen }: { body: DescBody; files: Attachment[]; onOpen: (file: Attachment) => void }) {
  if (body.length === 0) return <p className="text-sm text-fg-secondary">—</p>
  const byId = new Map(files.map((f) => [f.id, f]))
  return (
    <div className="space-y-2 text-sm text-fg-secondary">
      {body.map((b, i) => {
        if (b.type !== 'file') return block(b, i)
        const file = byId.get(b.id)
        return (
          <div key={i}>
            {file ? <DescriptionFile file={file} onOpen={() => onOpen(file)} /> : <p className="text-xs text-fg-muted">This file was removed.</p>}
          </div>
        )
      })}
    </div>
  )
}
