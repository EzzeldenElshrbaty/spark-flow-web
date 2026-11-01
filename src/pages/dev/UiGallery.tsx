import {
  IconArrowBackUp,
  IconBell,
  IconBold,
  IconAt,
  IconHash,
  IconLock,
  IconBookmark,
  IconClock,
  IconDots,
  IconHeadphones,
  IconLink,
  IconPencil,
  IconPlus,
  IconSortDescending,
  IconStar,
  IconTrash,
  IconUserPlus,
} from '@tabler/icons-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Avatar, Facepile } from '@/components/sf/Avatar'
import { Count, Kbd, Tag } from '@/components/sf/Badge'
import { Button, IconButton } from '@/components/sf/Button'
import { SfDarkScope } from '@/components/sf/layers'
import { Menu, MenuHeading, MenuItem, MenuSeparator, Submenu } from '@/components/sf/Menu'
import { Modal } from '@/components/sf/Modal'
import { SplitButton } from '@/components/sf/SplitButton'
import { ToastProvider, ToastRegion, useToast } from '@/components/sf/Toast'
import { Checkbox, Toggle } from '@/components/sf/Toggle'
import { TokenInput, type Suggestion, type Token } from '@/components/sf/TokenInput'
import { Tooltip } from '@/components/sf/Tooltip'
import { SideLink } from '@/layout/Sidebar'

// Dev-only page (not in production builds): every Phase 0 primitive and state, light and dark side by side.

const people = [
  { id: 'u-1', name: 'Hossam Gaber' },
  { id: 'u-2', name: 'Hala Nabil' },
  { id: 'u-3', name: 'Sara Adel' },
  { id: 'u-4', name: 'Omar Fathy' },
  { id: 'u-5', name: 'Mona Ali' },
]

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-sf-line py-6">
      <h2 className="sf-label m-0 text-sf-text-muted">{title}</h2>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </section>
  )
}

function Column({ theme }: { theme: 'Light' | 'Dark' }) {
  const [modal, setModal] = useState(false)
  const [mute, setMute] = useState(true)
  const [check, setCheck] = useState(true)
  const [sort, setSort] = useState('newest')
  const [tokens, setTokens] = useState<Token[]>([
    { id: 'u-3', label: 'Sara Adel', kind: 'person' },
    { id: 'sam@client.com', label: 'sam@client.com', kind: 'email' },
  ])
  const [query, setQuery] = useState('')
  const show = useToast()
  const suggestions: Suggestion[] = people
    .filter((p) => query && p.name.toLowerCase().includes(query.toLowerCase()))
    .map((p) => ({ id: p.id, label: p.name, kind: 'person' as const, description: 'Member' }))

  return (
    <div className="sf relative min-w-0 flex-1 bg-sf-surface px-6 pb-20 text-sf-text">
      <h1 className="sf-title mt-6 mb-0">{theme}</h1>

      <Section title="Sidebar rows">
        <ul className="flex w-[260px] flex-col gap-0.5 rounded-sf-lg bg-sf-app-frame p-2">
          <li>
            <SideLink to="/dev/ui" end label="Active" icon={IconHash} collapsed={false} />
          </li>
          <li>
            <SideLink to="/read" label="read" icon={IconHash} collapsed={false} active={false} />
          </li>
          <li>
            <SideLink to="/unread" label="unread" icon={IconHash} unread collapsed={false} />
          </li>
          <li>
            <SideLink to="/mentions" label="mentions" icon={IconHash} mentions={3} collapsed={false} />
          </li>
          <li>
            <SideLink to="/muted" label="muted" icon={IconHash} muted mentions={3} collapsed={false} />
          </li>
          <li>
            <SideLink to="/draft" label="draft" icon={IconHash} draft collapsed={false} />
          </li>
          <li>
            <SideLink to="/private" label="private-channel" icon={IconLock} collapsed={false} />
          </li>
          <li>
            <SideLink to="/drafts" label="Drafts & sent" icon={IconAt} trail={4} collapsed={false} />
          </li>
          <li>
            <SideLink
              to="/dm"
              label="Hala Nabil"
              icon={<Avatar id="u-2" name="Hala Nabil" size="sm" presence="active" on="frame" decorative />}
              collapsed={false}
            />
          </li>
        </ul>
      </Section>

      <Section title="Type">
        <div className="flex flex-col gap-1">
          <span className="sf-display"># backend</span>
          <span className="sf-title">Add people to #backend</span>
          <span className="sf-heading">Heading 16/24</span>
          <span className="sf-body">Body 14/22, the message text.</span>
          <span className="sf-body-strong">Body strong 14/22</span>
          <span className="sf-ui-medium">UI medium 14/20</span>
          <span className="sf-small text-sf-text-secondary">Small 13/18, secondary</span>
          <span className="sf-meta text-sf-text-muted">Meta 12/16, muted</span>
          <span className="sf-label text-sf-text-muted">Label</span>
          <span className="sf-code">SPARK-142 · code 13/20</span>
          <span className="sf-body-ar" dir="rtl">
            نص عربي للتجربة
          </span>
        </div>
      </Section>

      <Section title="Buttons">
        <Button>Cancel</Button>
        <Button variant="primary" icon={IconUserPlus}>
          Add people
        </Button>
        <Button variant="danger">Delete message</Button>
        <Button variant="ghost">Ghost</Button>
        <Button size="sm">Small</Button>
        <Button disabled>Disabled</Button>
        <Button variant="primary" disabled>
          Saving…
        </Button>
      </Section>

      <Section title="Icon buttons">
        <IconButton label="Notifications" icon={IconBell} />
        <IconButton label="Bold" icon={IconBold} pressed shortcut={['⌘', 'B']} />
        <IconButton label="Star channel" icon={IconStar} tone="accent" />
        <IconButton label="Edit" icon={IconPencil} size="sm" />
        <IconButton label="Copy link" icon={IconLink} size="xs" />
        <IconButton label="Undo" icon={IconArrowBackUp} flip disabled />
        <SplitButton icon={IconHeadphones} label="Call" onClick={() => {}} menuLabel="More call options">
          <MenuItem>Start a call</MenuItem>
          <MenuItem>Copy call link</MenuItem>
        </SplitButton>
      </Section>

      <Section title="Avatars">
        {people.slice(0, 3).map((p) => (
          <Avatar key={p.id} id={p.id} name={p.name} />
        ))}
        <Avatar id="u-1" name="Hossam Gaber" presence="active" />
        <Avatar id="u-2" name="Hala Nabil" presence="away" />
        <Avatar id="flowbot" name="Flowbot" app />
        <Avatar id="u-4" name="Omar Fathy" size="md" presence="active" />
        <Avatar id="u-5" name="Mona Ali" size="sm" presence="active" />
        <Avatar id="u-3" name="Sara Adel" size="xl" />
        <Facepile people={people} label="5 members" />
      </Section>

      <Section title="Badge, tag, kbd">
        <Count value={3} label="mentions" />
        <Count value={128} label="mentions" />
        <Tag>App</Tag>
        <Tag tone="accent">Guest</Tag>
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </Section>

      <Section title="Tooltip (hover or Tab)">
        <IconButton label="Search" icon={IconPlus} shortcut={['⌘', 'K']} />
        <Tooltip label="Tuesday, 27 Oct 2026 at 3:02 PM" sub="Edited 3:05 PM" describe>
          <button type="button" className="sf-focus sf-meta rounded-sf-sm text-sf-text-muted">
            3:02 PM
          </button>
        </Tooltip>
      </Section>

      <Section title="Menu">
        <Menu label="Message actions" trigger={(props) => <IconButton label="More actions" icon={IconDots} {...props} />}>
          <MenuItem icon={IconBookmark} hint="S">
            Save for later
          </MenuItem>
          <Submenu icon={IconClock} label="Remind me">
            <MenuItem>In 20 minutes</MenuItem>
            <MenuItem>In 1 hour</MenuItem>
            <MenuItem>Tomorrow (9:00 AM)</MenuItem>
          </Submenu>
          <MenuItem icon={IconLink} hint="L">
            Copy link
          </MenuItem>
          <MenuItem disabled>Pin to channel</MenuItem>
          <MenuSeparator />
          <MenuItem icon={IconTrash} danger>
            Delete message
          </MenuItem>
        </Menu>
        <Menu label="Sort" trigger={(props) => <Button icon={IconSortDescending} {...props}>Sort</Button>}>
          <MenuHeading>Sort by</MenuHeading>
          {['newest', 'oldest', 'relevance'].map((s) => (
            <MenuItem key={s} checked={sort === s} onSelect={() => setSort(s)}>
              {s[0].toUpperCase() + s.slice(1)}
            </MenuItem>
          ))}
        </Menu>
      </Section>

      <Section title="Toggle and checkbox">
        <Toggle checked={mute} onChange={setMute} label="Mute channel" />
        <Toggle checked={!mute} onChange={(on) => setMute(!on)} label="Unmuted" />
        <Toggle checked={false} onChange={() => {}} label="Disabled" disabled />
        <Checkbox checked={check} onChange={setCheck}>
          Also send to #backend
        </Checkbox>
        <Checkbox checked={!check} onChange={(c) => setCheck(!c)}>
          Unchecked
        </Checkbox>
      </Section>

      <Section title="Token input">
        <div className="w-full max-w-md">
          <TokenInput
            label="Names or emails"
            tokens={tokens}
            onRemove={(id) => setTokens((t) => t.filter((x) => x.id !== id))}
            onAdd={(s) => setTokens((t) => [...t, { id: s.id, label: s.label, kind: 'person' }])}
            onCommit={(text) => setTokens((t) => [...t, { id: text, label: text, kind: 'email' }])}
            query={query}
            onQueryChange={setQuery}
            suggestions={suggestions}
            placeholder="Type a name or email"
            help="Type h to see suggestions."
          />
        </div>
        <div className="w-full max-w-md">
          <TokenInput
            label="With an error"
            tokens={[]}
            onRemove={() => {}}
            onAdd={() => {}}
            query="not-an-email"
            onQueryChange={() => {}}
            error="Enter a name from the list or an email address."
          />
        </div>
      </Section>

      <Section title="Modal and toast">
        <Button onClick={() => setModal(true)}>Open modal</Button>
        <Button
          onClick={() => show({ message: 'Message deleted', icon: IconTrash, action: { label: 'Undo', onAction: () => {} } })}
        >
          Show toast
        </Button>
        <Modal
          open={modal}
          onClose={() => setModal(false)}
          title="Add people to #backend"
          description="They'll see the channel's history."
          footer={
            <>
              <Button onClick={() => setModal(false)}>Cancel</Button>
              <Button variant="primary" onClick={() => setModal(false)}>
                Add
              </Button>
            </>
          }
        >
          <TokenInput
            label="Names or emails"
            tokens={tokens}
            onRemove={(id) => setTokens((t) => t.filter((x) => x.id !== id))}
            onAdd={(s) => setTokens((t) => [...t, { id: s.id, label: s.label, kind: 'person' }])}
            query={query}
            onQueryChange={setQuery}
            suggestions={suggestions}
          />
        </Modal>
      </Section>
      <ToastRegion />
    </div>
  )
}

export function UiGallery() {
  // The light column needs light tokens, so the page drops the app's dark class while it is open.
  useEffect(() => {
    const html = document.documentElement
    const wasDark = html.classList.contains('dark')
    html.classList.remove('dark')
    html.dataset.theme = 'light'
    return () => {
      html.classList.toggle('dark', wasDark)
      html.dataset.theme = wasDark ? 'dark' : 'light'
    }
  }, [])

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <ToastProvider>
        <Column theme="Light" />
      </ToastProvider>
      <SfDarkScope className="flex min-w-0 flex-1">
        <ToastProvider>
          <Column theme="Dark" />
        </ToastProvider>
      </SfDarkScope>
    </div>
  )
}
