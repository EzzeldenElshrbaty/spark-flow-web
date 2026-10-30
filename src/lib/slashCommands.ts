import { IconAlarm, IconBellOff, IconFileDescription, IconListCheck, IconLogout, IconMoodSmile, IconUserPlus, type TablerIcon } from '@tabler/icons-react'
import { bodyText, type Body, type Inline } from '@/lib/messageBody'

/** The built-in shortcuts (spec 6.8). /search comes with Search, /call with Calls, app commands with apps. */
export type CommandName = 'remind' | 'task' | 'invite' | 'topic' | 'mute' | 'leave' | 'shrug'

/** A row of the `/` list: the command, what it takes, and what it does. */
export type SlashCommand = { name: CommandName; args: string; description: string; icon: TablerIcon }

/** What was typed: the name (known or not), the words after it without the people, and the people it names. */
export type ParsedCommand = { name: string; args: string; userIds: string[] }

/** In the spec's order; the page words the description for where it is (the project, Mute or Unmute). */
export const COMMANDS: SlashCommand[] = [
  { name: 'remind', args: '[what]', description: 'Set a reminder', icon: IconAlarm },
  { name: 'task', args: '[title] [@assignee]', description: 'Create a Flow task', icon: IconListCheck },
  { name: 'invite', args: '[@person]', description: 'Add people to this channel', icon: IconUserPlus },
  { name: 'topic', args: '[text]', description: 'Set the channel topic', icon: IconFileDescription },
  { name: 'mute', args: '', description: 'Mute this conversation', icon: IconBellOff },
  { name: 'leave', args: '', description: 'Leave this channel', icon: IconLogout },
  { name: 'shrug', args: '[message]', description: 'Send a message with ¯\\_(ツ)_/¯', icon: IconMoodSmile },
]

export const SHRUG = '¯\\_(ツ)_/¯'

/** `/name` at the very start, then a space or nothing: `/v2/invoices` and ` /mute` are messages. */
const HEAD = /^\/([a-z]+)(?=\s|$)/

/** The commands offered here whose name starts with what was typed after `/`. */
export function commandOptions(query: string, offered: SlashCommand[]): SlashCommand[] {
  const q = query.toLowerCase()
  return offered.filter((c) => c.name.startsWith(q))
}

/** The body less its `/name` (and the space after it). */
function withoutHead(body: Body, name: string): Body {
  const [first, ...rest] = body
  if (first?.type !== 'p') return body
  const [lead, ...inlines] = first.children
  if (lead?.type !== 'text') return body
  const text = lead.text.slice(name.length + 1).replace(/^[ \t]/, '')
  return [{ type: 'p', children: text ? [{ ...lead, text }, ...inlines] : inlines }, ...rest]
}

/** A shortcut typed at the start of the box, or null for a message. */
export function parseCommand(body: Body): ParsedCommand | null {
  const first = body[0]
  const lead = first?.type === 'p' ? first.children[0] : undefined
  const match = lead?.type === 'text' ? HEAD.exec(lead.text) : null
  if (!match) return null
  const name = match[1]
  const rest = withoutHead(body, name)
  const userIds: string[] = []
  const words: Body = rest.map((block) => {
    if (block.type !== 'p') return block
    const children = block.children.filter((n: Inline) => {
      if (n.type !== 'user') return true
      if (!userIds.includes(n.id)) userIds.push(n.id)
      return false
    })
    return { ...block, children }
  })
  return { name, args: bodyText(words).replace(/[ \t]+/g, ' ').trim(), userIds }
}

/** /shrug: what follows, as written, then the shrug. */
export function shrugBody(body: Body): Body {
  const rest = withoutHead(body, 'shrug').filter((b) => b.type !== 'p' || b.children.length > 0)
  const last = rest.at(-1)
  if (last?.type === 'p') return [...rest.slice(0, -1), { type: 'p', children: [...last.children, { type: 'text', text: ` ${SHRUG}` }] }]
  return [...rest, { type: 'p', children: [{ type: 'text', text: SHRUG }] }]
}

/** What a command did: a line for me under the box, or a message for the box to send (its prompts included). */
export type CommandOutcome = { notice?: string; send?: Body }

/** The shortcuts a box offers and what runs them (the page decides both). */
export type ComposerSlash = { commands: SlashCommand[]; run: (command: ParsedCommand, body: Body) => Promise<CommandOutcome> }

/** Why a `/word` at the start didn't run: it isn't a shortcut, or not one this place offers. */
export function refusal(name: string): string {
  const known = COMMANDS.some((c) => c.name === name)
  return `/${name} ${known ? "doesn't work here" : "isn't a shortcut"}. To send it as a message, start it with a space.`
}
