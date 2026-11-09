import {
  IconArrowBackUp,
  IconAt,
  IconBellOff,
  IconBookmark,
  IconChevronDown,
  IconClock,
  IconDots,
  IconEdit,
  IconFolder,
  IconHash,
  IconLayoutDashboard,
  IconLayoutKanban,
  IconListCheck,
  IconLock,
  IconMessages,
  IconPencil,
  IconPlus,
  IconSend,
  IconSettings,
  IconSortAscendingLetters,
  IconUsers,
  type TablerIcon,
} from '@tabler/icons-react'
import clsx from 'clsx'
import { useId, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { Avatar } from '@/components/sf/Avatar'
import { Count } from '@/components/sf/Badge'
import { IconButton } from '@/components/sf/Button'
import { Menu, MenuItem } from '@/components/sf/Menu'
import { useSaveSidebarOrder } from '@/api/sidebar'
import type { Project, SidebarSection } from '@/api/types'
import { SortableSideList } from '@/layout/SortableSideList'
import { Icon } from '@/components/sf/Icon'
import { WorkspaceModeSwitch } from '@/layout/ModeSwitch'
import { NewTaskButton } from '@/layout/NewTaskButton'
import { useSidebarGroups, type ChannelRow } from '@/layout/useSidebarGroups'
import { useWorkspaceMode } from '@/layout/useWorkspaceMode'
import { countNoun, sidebarRowState } from '@/lib/channels'
import { isFlowbot } from '@/lib/flowbot'
import { paths } from '@/lib/paths'
import { SIDEBAR_WIDTH, useUiStore } from '@/lib/uiStore'
import { usePermission } from '@/lib/usePermission'
import { useRole } from '@/lib/useRole'
import { canSee, settingsItem } from '@/navigation'
import { ChannelSheet } from '@/pages/chat/ChannelSheet'
import { NewMessageSheet } from '@/pages/chat/NewMessageSheet'

type SideLinkProps = {
  to: string
  label: string
  /** A Tabler icon, or a node such as a DM's avatar. */
  icon?: TablerIcon | ReactNode
  /** Unread mentions: the red count at the end. */
  mentions?: number
  /** What the count is read out as, one and many: mentions unless said (Activity's are unread items). */
  noun?: [string, string]
  /** Something new to read: bold, strong text. */
  unread?: boolean
  /** Muted channels: dim, a bell-off icon, never a count. */
  muted?: boolean
  /** An unsent draft: a pencil at the end when there's no count. */
  draft?: boolean
  /** Muted trailing number (Drafts & sent, Saved). */
  trail?: number
  /** Said after the trail count to screen readers: "Threads, 2 with new replies". */
  trailNoun?: string
  /** The row is active anywhere under this path (a project's link goes to one view but stays lit on the other). */
  within?: string
  /** Active only on this exact path (Home, whose path is the start of every other). */
  end?: boolean
  /** Overrides the route match (a row that borrows another page's link never lights up). */
  active?: boolean
  collapsed: boolean
  onNavigate?: () => void
  /** A row that can be dragged: the instructions a screen reader reads with it (spec 5.1). */
  describedBy?: string
}

function isIcon(icon: SideLinkProps['icon']): icon is TablerIcon {
  return typeof icon === 'function' || (typeof icon === 'object' && icon !== null && 'render' in icon)
}

/** One 28px row of the sidebar (44px in the phone and tablet drawer, for touch; spec 5.1 and 6.16): read, unread, active, muted, mentions and draft states. */
export function SideLink({
  to,
  label,
  icon,
  mentions = 0,
  noun = ['mention', 'mentions'],
  unread = false,
  muted = false,
  draft = false,
  trail,
  trailNoun,
  within,
  end,
  active: forced,
  collapsed,
  onNavigate,
  describedBy,
}: SideLinkProps) {
  const { pathname } = useLocation()
  const inside = forced ?? (within ? pathname === within || pathname.startsWith(`${within}/`) : undefined)
  const count = muted ? 0 : mentions
  const counted = `${count} ${count === 1 ? noun[0] : noun[1]}`
  const bold = !muted && (unread || count > 0)
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      aria-label={collapsed ? label : undefined}
      aria-describedby={describedBy}
      // A row that drags is ours to drag: the browser mustn't drag (and on a drop, open) the link itself.
      draggable={describedBy ? false : undefined}
      className={({ isActive }) =>
        clsx(
          'sf-focus flex h-11 w-full flex-none items-center gap-2 rounded-sf-md px-2 font-sf lg:h-7 text-[14px]/[20px] whitespace-nowrap transition-colors duration-150 ease-sf',
          collapsed && 'justify-center',
          (inside ?? isActive)
            ? 'bg-sf-sidebar-active text-sf-sidebar-text-strong'
            : clsx(
                'hover:bg-sf-sidebar-hover',
                bold ? 'text-sf-sidebar-text-strong' : muted ? 'text-sf-sidebar-text-muted' : 'text-sf-sidebar-text',
              ),
          bold ? 'font-semibold' : 'font-normal',
        )
      }
    >
      {({ isActive }) => {
        const active = inside ?? isActive
        return (
          <>
            {icon && (
              <span className="relative inline-flex flex-none">
                {isIcon(icon) ? (
                  <Icon
                    icon={icon}
                    size={18}
                    className={
                      active ? 'text-sf-sidebar-accent' : bold ? 'text-sf-sidebar-text-strong' : 'text-sf-sidebar-text-muted'
                    }
                  />
                ) : (
                  icon
                )}
                {collapsed && (count > 0 || unread) && !muted && (
                  <span aria-hidden className="absolute -end-1 -top-1 size-2 rounded-sf-full bg-sf-accent-fill" />
                )}
              </span>
            )}
            {collapsed ? (
              (count > 0 || unread) && !muted && <span className="sr-only">{count > 0 ? `, ${counted}` : ', unread'}</span>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate">{label}</span>
                {count > 0 ? (
                  <>
                    {/* Read as "backend, 3 mentions". */}
                    <span className="sr-only">, </span>
                    <Count value={count} label={count === 1 ? noun[0] : noun[1]} className="ms-auto" />
                  </>
                ) : muted ? (
                  <Icon icon={IconBellOff} size={16} className="ms-auto text-sf-sidebar-text-muted" />
                ) : draft ? (
                  <span className="ms-auto inline-flex">
                    <Icon icon={IconPencil} size={16} className="text-sf-sidebar-text-muted" />
                    <span className="sr-only">, draft</span>
                  </span>
                ) : trail ? (
                  <span className="sf-meta ms-auto text-sf-sidebar-text-muted tabular-nums">
                    {trailNoun ? (
                      <>
                        <span className="sr-only">{`, ${trail} ${trailNoun}`}</span>
                        <span aria-hidden>{trail}</span>
                      </>
                    ) : (
                      trail
                    )}
                  </span>
                ) : null}
              </>
            )}
          </>
        )
      }}
    </NavLink>
  )
}

/** A labelled group of rows with a chevron to close it; open or closed is remembered. */
export function SideSection({
  id,
  label,
  actions,
  collapsed,
  first = false,
  children,
}: {
  id: string
  label: string
  /** Buttons at the end of the label row (add, options); shown on hover or focus where hover exists. */
  actions?: ReactNode
  collapsed: boolean
  first?: boolean
  children: ReactNode
}) {
  const listId = useId()
  const closed = useUiStore((state) => state.collapsedSections.includes(id))
  const toggle = useUiStore((state) => state.toggleSection)
  if (collapsed) return <ul className={clsx('flex flex-col gap-0.5', !first && 'mt-3')}>{children}</ul>
  return (
    <div className={clsx('flex flex-none flex-col gap-0.5', !first && 'mt-3')}>
      <div className="group/section flex h-11 flex-none items-center gap-1 ps-2 pe-1 text-sf-sidebar-text-muted lg:h-7">
        <button
          type="button"
          aria-expanded={!closed}
          aria-controls={listId}
          onClick={() => toggle(id)}
          className="sf-focus sf-label inline-flex h-11 cursor-pointer items-center gap-1 rounded-sf-sm hover:text-sf-sidebar-text-strong lg:h-auto"
        >
          {label}
          <Icon
            icon={IconChevronDown}
            size={14}
            className={clsx('transition-transform duration-150 ease-sf', closed && '-rotate-90 rtl:rotate-90')}
          />
        </button>
        {actions && (
          <span className="ms-auto flex gap-0.5 group-hover/section:opacity-100 focus-within:opacity-100 [@media(hover:hover)]:opacity-0">
            {actions}
          </span>
        )}
      </div>
      <ul id={listId} hidden={closed} className="flex flex-col gap-0.5">
        {children}
      </ul>
    </div>
  )
}

/** Three pulse rows while a group loads. */
function GroupSkeleton() {
  return (
    <>
      {[0, 1, 2].map((row) => (
        <li key={row} aria-hidden className="h-11 flex-none animate-pulse lg:h-7 rounded-sf-md bg-sf-sidebar-hover" />
      ))}
    </>
  )
}

/** A channel or DM row: `#` or a lock, or the other person's avatar; bold, count and muted by `sidebarRowState`. */
function ChannelLink({ slug, row: r, mentions, collapsed, onNavigate, describedBy }: { slug: string; row: ChannelRow; mentions: number; collapsed?: boolean; onNavigate?: () => void; describedBy?: string }) {
  const { channel, label, presence, group, otherId } = r
  const state = sidebarRowState(channel, mentions)
  const icon =
    channel.kind === 'channel' ? (channel.isPrivate ? IconLock : IconHash) : group ? IconUsers : isFlowbot(otherId) ? <Avatar id={otherId} name={label} size="sm" app on="frame" decorative /> : <Avatar id={otherId} name={label} size="sm" presence={presence} on="frame" decorative />
  return (
    <SideLink
      to={paths.channel(slug, channel.id)}
      label={label}
      icon={icon}
      unread={state.bold}
      mentions={state.count}
      noun={countNoun(channel)}
      muted={state.muted}
      draft={r.draft}
      collapsed={Boolean(collapsed)}
      onNavigate={onNavigate}
      describedBy={describedBy}
    />
  )
}

/**
 * Starred's or Channels' rows (spec 5.1): in my order, dragged to change it (not in the collapsed rail). A drop shows
 * at once and saves; a refusal puts the old order back and says so under the section.
 */
function OrderedRows({
  section,
  label,
  rows,
  slug,
  mentions,
  collapsed,
  onNavigate,
  onReorder,
}: {
  section: SidebarSection
  label: string
  rows: ChannelRow[]
  slug: string
  mentions: Map<string, number>
  collapsed: boolean
  onNavigate?: () => void
  onReorder: (section: SidebarSection, ids: string[]) => void
}) {
  const link = (r: ChannelRow, describedBy?: string) => (
    <ChannelLink slug={slug} row={r} mentions={mentions.get(r.channel.id) ?? 0} collapsed={collapsed} onNavigate={onNavigate} describedBy={describedBy} />
  )
  if (collapsed)
    return rows.map((r) => (
      <li key={r.channel.id} className="flex-none">
        {link(r)}
      </li>
    ))
  return (
    <SortableSideList label={label} items={rows.map((r) => ({ id: r.channel.id, label: r.label, muted: r.channel.muted }))} onReorder={(ids) => onReorder(section, ids)}>
      {(item, describedBy) => link(rows.find((r) => r.channel.id === item.id)!, describedBy)}
    </SortableSideList>
  )
}

/** The Projects section's rows (slice Y+): in my order, dragged to change it, except in the collapsed rail. */
function ProjectRows({ projects, slug, collapsed, onNavigate, onReorder }: { projects: Project[]; slug: string; collapsed: boolean; onNavigate?: () => void; onReorder: (ids: string[]) => void }) {
  const link = (project: Project, describedBy?: string) => (
    <SideLink
      to={paths.project(slug, project.key)}
      label={project.name}
      within={paths.project(slug, project.key).replace(/\/[^/]+$/, '')}
      icon={IconFolder}
      collapsed={collapsed}
      onNavigate={onNavigate}
      describedBy={describedBy}
    />
  )
  if (collapsed)
    return projects.map((project) => (
      <li key={project.id} className="flex-none">
        {link(project)}
      </li>
    ))
  return (
    <SortableSideList label="Projects" items={projects.map((p) => ({ id: p.id, label: p.name, muted: false }))} onReorder={onReorder}>
      {(item, describedBy) => link(projects.find((p) => p.id === item.id)!, describedBy)}
    </SortableSideList>
  )
}

/**
 * A section's ⋯ while I have my own order there: throws it away. "Sort A–Z" where the default is A–Z (channels),
 * "Reset order" where it isn't (projects keep the order they were made in).
 */
function OrderMenu({ label, reset = 'Sort A–Z', onReset }: { label: string; reset?: 'Sort A–Z' | 'Reset order'; onReset: () => void }) {
  return (
    <Menu label={`${label} options`} trigger={(props) => <IconButton label={`${label} options`} icon={IconDots} size="xs" tone="sidebar-muted" className="max-lg:size-11" {...props} />}>
      <MenuItem icon={reset === 'Sort A–Z' ? IconSortAscendingLetters : IconArrowBackUp} onSelect={onReset}>
        {reset}
      </MenuItem>
    </Menu>
  )
}

export function SidebarContent({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean
  onNavigate?: () => void
}) {
  const { grants } = useRole()
  const check = usePermission()
  const { workspace, starred, channels, dms, apps, projects, mentions, activityUnread, threadsUnread, customOrder, savedInProgress, draftsAndScheduled, chatLoading, projectsLoading, failed } = useSidebarGroups()
  const slug = workspace?.slug
  const [newChannel, setNewChannel] = useState(false)
  const [newMessage, setNewMessage] = useState(false)
  const row = { collapsed, onNavigate }
  // My order of Starred and Channels (spec 5.1): a drop or Sort A–Z saves; a refusal says so under its section.
  const { save: reorder, error: orderError } = useSaveSidebarOrder(workspace?.id)
  const orderProblem = (section: SidebarSection) =>
    orderError === section && (
      <li className="flex-none px-2 py-1">
        <p role="alert" className="sf-small m-0 text-sf-sidebar-text-strong">
          Couldn’t save the order. Try again.
        </p>
      </li>
    )
  // One side of Flow at a time (spec 5.5): the switch above picks Projects or Chat.
  const side = useWorkspaceMode()
  const onProjects = side === 'projects'
  const onChat = side === 'chat'

  return (
    <div className="sf flex h-full flex-col px-2 pb-2 text-sf-sidebar-text">
      <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-1" aria-label="Workspace">
        {slug && onProjects && (
          <SideSection id="work" label="Work" first {...row}>
            <li className="flex-none">
              <SideLink to={paths.dashboard(slug)} label="Dashboard" icon={IconLayoutDashboard} {...row} />
            </li>
            <li className="flex-none">
              <SideLink to={paths.home(slug)} end label="My work" icon={IconListCheck} {...row} />
            </li>
            <li className="flex-none">
              <SideLink to={paths.projects(slug)} label="Projects" icon={IconLayoutKanban} {...row} />
            </li>
            <li className="flex-none">
              <SideLink to={paths.teams(slug)} label="Teams" icon={IconUsers} {...row} />
            </li>
          </SideSection>
        )}

        {slug && onProjects && check('timeCost.view') && (
          <SideSection id="manage" label="Manage" {...row}>
            <li className="flex-none">
              <SideLink to={paths.timeCost(slug)} label="Time & cost" icon={IconClock} {...row} />
            </li>
          </SideSection>
        )}

        {slug && onChat && (
          // The switch says Chat already, so these rows open the side without a heading of their own.
          <ul className="flex flex-none flex-col gap-0.5">
            <li className="flex-none">
              <SideLink
                to={paths.threads(slug)}
                label="Threads"
                icon={IconMessages}
                unread={threadsUnread > 0}
                trail={threadsUnread || undefined}
                trailNoun="with new replies"
                {...row}
              />
            </li>
            <li className="flex-none">
              <SideLink to={paths.activity(slug)} label="Activity" icon={IconAt} mentions={activityUnread} noun={['unread', 'unread']} {...row} />
            </li>
            <li className="flex-none">
              <SideLink to={paths.drafts(slug)} label="Drafts & sent" icon={IconSend} trail={draftsAndScheduled || undefined} {...row} />
            </li>
            <li className="flex-none">
              <SideLink to={paths.saved(slug)} label="Saved" icon={IconBookmark} trail={savedInProgress || undefined} {...row} />
            </li>
          </ul>
        )}

        {slug && workspace && onChat && !chatLoading && starred.length > 0 && (
          <SideSection id="starred" label="Starred" actions={customOrder.starred && <OrderMenu label="Starred" onReset={() => reorder('starred', [])} />} {...row}>
            <OrderedRows section="starred" label="Starred" rows={starred} slug={slug} mentions={mentions.byChannel} onReorder={reorder} collapsed={collapsed} onNavigate={onNavigate} />
            {orderProblem('starred')}
          </SideSection>
        )}

        {slug && workspace && onChat && (
          <SideSection
            id="channels"
            label="Channels"
            actions={
              <>
                {customOrder.channels && <OrderMenu label="Channels" onReset={() => reorder('channels', [])} />}
                <IconButton label="New channel" icon={IconPlus} size="xs" tone="sidebar-muted" className="max-lg:size-11" onClick={() => setNewChannel(true)} />
              </>
            }
            {...row}
          >
            {chatLoading ? (
              <GroupSkeleton />
            ) : (
              <>
                <OrderedRows section="channels" label="Channels" rows={channels} slug={slug} mentions={mentions.byChannel} onReorder={reorder} collapsed={collapsed} onNavigate={onNavigate} />
                {orderProblem('channels')}
                <li className="flex-none">
                  <AddChannelsRow collapsed={collapsed} onAdd={() => setNewChannel(true)} />
                </li>
              </>
            )}
          </SideSection>
        )}

        {slug && workspace && onChat && (
          <SideSection
            id="dms"
            label="Direct messages"
            actions={
              <IconButton label="New message" icon={IconPlus} size="xs" tone="sidebar-muted" className="max-lg:size-11" onClick={() => setNewMessage(true)} />
            }
            {...row}
          >
            {chatLoading ? (
              <GroupSkeleton />
            ) : (
              dms.map((r) => (
                <li key={r.channel.id} className="flex-none">
                  <ChannelLink slug={slug} row={r} mentions={0} {...row} />
                </li>
              ))
            )}
          </SideSection>
        )}

        {slug && workspace && onChat && !chatLoading && apps.length > 0 && (
          <SideSection id="apps" label="Apps" {...row}>
            {apps.map((r) => (
              <li key={r.channel.id} className="flex-none">
                <ChannelLink slug={slug} row={r} mentions={0} {...row} />
              </li>
            ))}
          </SideSection>
        )}

        {slug && onProjects && (projectsLoading || projects.length > 0) && (
          <SideSection id="projects" label="Projects" actions={customOrder.projects && <OrderMenu label="Projects" reset="Reset order" onReset={() => reorder('projects', [])} />} {...row}>
            {projectsLoading ? (
              <GroupSkeleton />
            ) : (
              <>
                <ProjectRows projects={projects} slug={slug} collapsed={collapsed} onNavigate={onNavigate} onReorder={(ids) => reorder('projects', ids)} />
                {orderProblem('projects')}
              </>
            )}
          </SideSection>
        )}

        {failed && !collapsed && (
          <p className="sf-meta mt-3 px-2 text-sf-sidebar-text-muted">Some of this list didn’t load. Refresh to try again.</p>
        )}
      </nav>
      {slug && canSee(settingsItem, grants) && (
        <div className="flex-none border-t border-sf-sidebar-hover pt-2">
          <SideLink to={paths.settings(slug)} label={settingsItem.label} icon={IconSettings} {...row} />
        </div>
      )}
      {newChannel && workspace && (
        <ChannelSheet workspaceId={workspace.id} workspaceSlug={workspace.slug} onClose={() => setNewChannel(false)} />
      )}
      {newMessage && workspace && (
        <NewMessageSheet workspaceId={workspace.id} workspaceSlug={workspace.slug} onClose={() => setNewMessage(false)} />
      )}
    </div>
  )
}

/** The last row of Channels (spec 5.1, .sf-side-add): muted, with a +; it opens New channel. */
export function AddChannelsRow({ collapsed, onAdd }: { collapsed: boolean; onAdd: () => void }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className={clsx(
        'sf-focus flex h-11 w-full flex-none cursor-pointer items-center gap-2 rounded-sf-md px-2 font-sf text-[14px]/[20px] whitespace-nowrap text-sf-sidebar-text-muted transition-colors duration-150 ease-sf hover:bg-sf-sidebar-hover hover:text-sf-sidebar-text lg:h-7',
        collapsed && 'justify-center',
      )}
    >
      <Icon icon={IconPlus} size={18} className="flex-none" />
      <span className={collapsed ? 'sr-only' : 'truncate'}>Add channels</span>
    </button>
  )
}

/** The logo goes to Home, which opens the last place visited. Logo lockup: white Spark logo, divider, FLOW. */
export function Logo({ collapsed = false, onClick }: { collapsed?: boolean; onClick?: () => void }) {
  return (
    <Link to="/" onClick={onClick} className="sf-focus flex items-center gap-3 rounded-sf-md" aria-label="Spark Flow home">
      {collapsed ? (
        <img src="/spark-mark-white.png" alt="Spark Flow" className="h-4 w-auto" />
      ) : (
        <span dir="ltr" className="flex items-center gap-3 ps-2">
          <img src="/spark-logo-white.png" alt="Spark Systems" className="h-7 w-auto" />
          <span aria-hidden className="h-5 w-px bg-sf-ink-700" />
          <span className="sf-label text-sf-sidebar-text">FLOW</span>
        </span>
      )}
    </Link>
  )
}

/** Logo row with the white button at the end (spec 5.1, 5.5): New message on the Chat side, New task on Projects. */
export function SidebarHeader({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { workspace } = useSidebarGroups()
  const side = useWorkspaceMode()
  const [newMessage, setNewMessage] = useState(false)
  return (
    <div className={clsx('sf flex h-14 flex-none items-center gap-1 ps-2 pe-3', collapsed && 'justify-center px-0')}>
      <Logo collapsed={collapsed} onClick={onNavigate} />
      {!collapsed && workspace && side === 'projects' && <NewTaskButton />}
      {!collapsed && workspace && side === 'chat' && (
        <>
          <IconButton label="New message" icon={IconEdit} tone="compose" className="ms-auto" onClick={() => setNewMessage(true)} />
          {newMessage && (
            <NewMessageSheet workspaceId={workspace.id} workspaceSlug={workspace.slug} onClose={() => setNewMessage(false)} />
          )}
        </>
      )}
    </div>
  )
}

const KEY_STEP = 16

function rtl(el: Element) {
  return el.closest('[dir]')?.getAttribute('dir') === 'rtl'
}

/**
 * The sidebar's end edge: drag it, or focus it and use the arrow keys (Home / End for the limits), to set the
 * width between 200 and 420px (spec 5.1). Double-click goes back to 260. The width is remembered.
 */
export function SidebarResizer() {
  const width = useUiStore((state) => state.sidebarWidth)
  const setWidth = useUiStore((state) => state.setSidebarWidth)
  const drag = useRef<{ x: number; width: number; pointerId: number } | null>(null)

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuenow={width}
      aria-valuemin={SIDEBAR_WIDTH.min}
      aria-valuemax={SIDEBAR_WIDTH.max}
      tabIndex={0}
      onKeyDown={(event) => {
        const grow = rtl(event.currentTarget) ? 'ArrowLeft' : 'ArrowRight'
        const shrink = grow === 'ArrowRight' ? 'ArrowLeft' : 'ArrowRight'
        if (event.key === grow) setWidth(width + KEY_STEP)
        else if (event.key === shrink) setWidth(width - KEY_STEP)
        else if (event.key === 'Home') setWidth(SIDEBAR_WIDTH.min)
        else if (event.key === 'End') setWidth(SIDEBAR_WIDTH.max)
        else return
        event.preventDefault()
      }}
      onDoubleClick={() => setWidth(SIDEBAR_WIDTH.initial)}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        drag.current = { x: event.clientX, width, pointerId: event.pointerId }
        event.currentTarget.setPointerCapture?.(event.pointerId)
        event.preventDefault()
      }}
      onPointerMove={(event) => {
        const start = drag.current
        if (!start || start.pointerId !== event.pointerId) return
        const delta = event.clientX - start.x
        setWidth(start.width + (rtl(event.currentTarget) ? -delta : delta))
      }}
      onPointerUp={() => {
        drag.current = null
      }}
      onPointerCancel={() => {
        drag.current = null
      }}
      className="sf-focus absolute inset-y-0 -end-1 z-10 w-2 cursor-col-resize touch-none after:absolute after:inset-y-0 after:start-[3px] after:w-0.5 after:bg-transparent after:transition-colors after:duration-150 hover:after:bg-sf-sidebar-active focus-visible:after:bg-sf-sidebar-accent"
    />
  )
}

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const width = useUiStore((state) => state.sidebarWidth)
  return (
    <aside
      style={{ width: collapsed ? 72 : width }}
      className="sf sticky top-0 hidden h-screen flex-none flex-col bg-sf-app-frame lg:flex"
    >
      <SidebarHeader collapsed={collapsed} />
      <div className={clsx('flex flex-none pb-3', collapsed ? 'justify-center' : 'px-2')}>
        <WorkspaceModeSwitch size={collapsed ? 'rail' : 'sidebar'} />
      </div>
      <div className="min-h-0 flex-1">
        <SidebarContent collapsed={collapsed} />
      </div>
      {!collapsed && <SidebarResizer />}
    </aside>
  )
}
