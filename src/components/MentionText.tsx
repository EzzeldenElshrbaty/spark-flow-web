import { Link, useSearchParams } from 'react-router'
import { withInspector } from '@/lib/inspector'
import { segments } from '@/lib/mentions'
import { paths } from '@/lib/paths'
import { useMentionDirectory } from '@/lib/useMentionDirectory'
import { TicketKey } from '@/pages/projects/ticketPills'

// Ticket keys in plain text are set apart so they never reorder in right-to-left text.
const TICKET_KEY = /\b([A-Z]{2,5}-\d+)\b/
const chip = 'rounded bg-accent-soft px-1 font-medium text-accent'

/**
 * Message or comment text: plain text (never HTML), with mentions of real people, tasks and projects as chips that
 * open what they name. Anything else stays the text that was typed.
 */
export function MentionText({ text, className = 'text-sm text-fg' }: { text: string; className?: string }) {
  const { ws, known } = useMentionDirectory()
  const [params] = useSearchParams()
  return (
    <p className={`whitespace-pre-wrap break-words ${className}`}>
      {segments(text, known).map((s, i) => {
        if (s.kind === 'user') return <span key={i} className={chip}>@{s.name}</span>
        if (s.kind === 'all') return <span key={i} className={chip}>@all</span>
        if (s.kind === 'task')
          return (
            <Link key={i} to={{ search: withInspector(params, { kind: 'ticket', key: s.key }).toString() }} className={`${chip} hover:underline`}>
              @<bdi dir="ltr">{s.key}</bdi>
            </Link>
          )
        if (s.kind === 'project')
          return (
            <Link key={i} to={paths.project(ws, s.key)} className={`${chip} hover:underline`}>
              @<bdi dir="ltr">{s.key}</bdi>
            </Link>
          )
        return s.text.split(TICKET_KEY).map((part, j) => (j % 2 === 1 ? <TicketKey key={`${i}-${j}`} value={part} className="text-fg-secondary" /> : part))
      })}
    </p>
  )
}
