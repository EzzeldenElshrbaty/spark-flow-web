import { IconFolder, IconHash, IconListCheck, IconUsers } from '@tabler/icons-react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { LexicalTypeaheadMenuPlugin, MenuOption, type MenuTextMatch } from '@lexical/react/LexicalTypeaheadMenuPlugin'
import clsx from 'clsx'
import { $createTextNode, COMMAND_PRIORITY_LOW, type TextNode } from 'lexical'
import { useMemo, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { Presence, User } from '@/api/types'
import { Avatar } from '@/components/sf/Avatar'
import { Kbd } from '@/components/sf/Badge'
import { Icon } from '@/components/sf/Icon'
import { channelOptions, mentionOptions } from '@/lib/mentionQuery'
import { $createEntityNode, type Entity } from '@/pages/chat/composer/bodyEditor'

/** What the composer can name: people (and who is in this channel), projects, tasks and channels. */
export type ComposerDirectory = {
  users: User[]
  projects: { key: string; name: string }[]
  tasks: { key: string; title: string }[]
  channels: { id: string; name: string }[]
  /** This channel's members: anyone else is marked "Not in this channel". */
  memberIds?: string[]
}

type Item =
  | { kind: 'all' }
  | { kind: 'user'; user: User; inChannel: boolean }
  | { kind: 'project'; key: string; name: string }
  | { kind: 'task'; key: string; title: string }
  | { kind: 'channel'; id: string; name: string }

class Choice extends MenuOption {
  item: Item
  constructor(item: Item) {
    super(item.kind === 'user' ? item.user.id : item.kind === 'all' ? 'all' : item.kind === 'channel' ? item.id : item.key)
    this.item = item
  }
}

const PRESENCE: Record<Presence, string> = { active: 'Active', away: 'Away', offline: 'Offline' }
const MAX_QUERY = 50
// `@` or `#` at the start or after a space or "(", then the query up to the caret.
const TRIGGER = new RegExp(`(^|[\\s(])([@#])([^\\s@#]{0,${MAX_QUERY}})$`)

/**
 * Autocomplete (spec 6.8, `sf-ac`): `@` offers people, @all, projects and tasks; `#` offers channels. It opens above
 * the composer; arrow keys move, Enter or Tab picks, Escape closes; picking puts a pill (or a task key) in place of
 * what was typed. `menuOpen` tells the composer not to send on Enter while it's open.
 */
export function AutocompletePlugin({ directory, menuOpen, anchor }: { directory: ComposerDirectory; menuOpen: RefObject<boolean>; anchor: RefObject<HTMLElement | null> }) {
  const [editor] = useLexicalComposerContext()
  const [query, setQuery] = useState<string | null>(null)
  // Open from the plugin's own open and close (Escape closes it while the query is still typed).
  const [open, setOpen] = useState(false)
  const trigger = useRef<'@' | '#'>('@')

  const triggerFn = (text: string): MenuTextMatch | null => {
    const m = TRIGGER.exec(text)
    if (!m) return null
    trigger.current = m[2] as '@' | '#'
    return { leadOffset: m.index + m[1].length, matchingString: m[3], replaceableString: m[2] + m[3] }
  }

  const options = useMemo(() => {
    if (query === null) return []
    if (trigger.current === '#') return channelOptions(query, directory.channels).map((c) => new Choice({ kind: 'channel', id: c.id, name: c.name }))
    return mentionOptions(query, directory).map((o) => {
      if (o.kind !== 'user') return new Choice(o)
      const user = directory.users.find((u) => u.id === o.id)!
      return new Choice({ kind: 'user', user, inChannel: !directory.memberIds || directory.memberIds.includes(o.id) })
    })
  }, [query, directory])
  menuOpen.current = open && query !== null && options.length > 0

  const pick = (choice: Choice, nodeToReplace: TextNode | null, closeMenu: () => void) => {
    editor.update(() => {
      const item = choice.item
      const entity: Entity | null =
        item.kind === 'user' ? { type: 'user', id: item.user.id, name: item.user.name } : item.kind === 'all' ? { type: 'all' } : item.kind === 'channel' ? { type: 'channel', id: item.id, name: item.name } : item.kind === 'project' ? { type: 'project', key: item.key } : null
      const node = entity ? $createEntityNode(entity) : $createTextNode(item.kind === 'task' ? item.key : '')
      if (nodeToReplace) nodeToReplace.replace(node)
      const space = $createTextNode(' ')
      node.insertAfter(space)
      space.select()
    })
    closeMenu()
  }

  return (
    <LexicalTypeaheadMenuPlugin<Choice>
      options={options}
      triggerFn={triggerFn}
      onQueryChange={setQuery}
      onSelectOption={pick}
      onOpen={() => setOpen(true)}
      onClose={() => {
        menuOpen.current = false
        setOpen(false)
      }}
      commandPriority={COMMAND_PRIORITY_LOW}
      menuRenderFn={(anchorElementRef, { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }) => {
        const container = anchorElementRef.current
        if (!container || options.length === 0) return null
        const box = anchor.current?.getBoundingClientRect()
        // Lexical's container is the listbox the editor points at (aria-controls, aria-activedescendant): name it.
        container.setAttribute('aria-label', trigger.current === '#' ? 'Link a channel' : 'Mention someone')
        container.id = 'typeahead-menu'
        return createPortal(
          <div className="sf">
            <div
              className="fixed z-[var(--z-menu)] flex max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-sf-lg bg-sf-surface-raised pt-2 shadow-sf-menu"
              style={box ? { left: Math.max(8, box.left), bottom: window.innerHeight - box.top + 8, width: Math.min(380, box.width) } : undefined}
            >
              <ul role="presentation" className="max-h-72 overflow-auto">
                {options.map((option, i) => (
                  <li
                    key={option.key}
                    id={`typeahead-item-${i}`}
                    ref={option.setRefElement}
                    role="option"
                    aria-selected={i === selectedIndex}
                    tabIndex={-1}
                    onMouseEnter={() => setHighlightedIndex(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectOptionAndCleanUp(option)}
                    className={clsx('sf-ui mx-2 flex min-h-9 cursor-pointer items-center gap-2 rounded-sf-md px-2 py-1 text-sf-text', i === selectedIndex && 'bg-sf-surface-hover')}
                  >
                    <Row item={option.item} />
                  </li>
                ))}
              </ul>
              <p aria-hidden className="sf-meta mt-2 flex items-center gap-1 border-t border-sf-line bg-sf-surface-sunken px-4 py-2 whitespace-nowrap text-sf-text-muted">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> move · <Kbd>Enter</Kbd> or <Kbd>Tab</Kbd> choose · <Kbd>Esc</Kbd> close
              </p>
            </div>
          </div>,
          container,
        )
      }}
    />
  )
}

function Row({ item }: { item: Item }) {
  if (item.kind === 'user')
    return (
      <>
        <Avatar id={item.user.id} name={item.user.name} size="sm" presence={item.user.presence} decorative />
        <span className="truncate font-medium">{item.user.name}</span>
        <span className="truncate text-[13px] text-sf-text-secondary">{item.inChannel ? PRESENCE[item.user.presence] : 'Not in this channel'}</span>
      </>
    )
  const [icon, main, sub] =
    item.kind === 'all'
      ? [IconUsers, '@all', 'Everyone in this channel']
      : item.kind === 'channel'
        ? [IconHash, item.name, '']
        : item.kind === 'project'
          ? [IconFolder, item.key, item.name]
          : [IconListCheck, item.key, item.title]
  return (
    <>
      <Icon icon={icon} size={18} className="text-sf-text-secondary" />
      <span className="truncate font-medium">{main}</span>
      {sub && <span className="truncate text-[13px] text-sf-text-secondary">{sub}</span>}
    </>
  )
}
