import {
  IconAt,
  IconBellOff,
  IconBookmark,
  IconChevronDown,
  IconClock,
  IconEdit,
  IconFolder,
  IconHash,
  IconHome,
  IconLayoutDashboard,
  IconLayoutKanban,
  IconListCheck,
  IconLock,
  IconMessages,
  IconPencil,
  IconPlus,
  IconSend,
  IconSettings,
  IconUsers,
  type TablerIcon,
} from '@tabler/icons-react'
import clsx from 'clsx'
import { useId, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { Avatar } from '@/components/sf/Avatar'
import { Count } from '@/components/sf/Badge'
import { IconButton } from '@/components/sf/Button'
import { Icon } from '@/components/sf/Icon'
import { useSidebarGroups, type ChannelRow } from '@/layout/useSidebarGroups'
import { sidebarRowState } from '@/lib/channels'
import { hasFeature } from '@/lib/features'
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
  /** The row is active anywhere under this path (a project's link goes to one view but stays lit on the other). */
  within?: string
  /** Active only on this exact path (Home, whose path is the start of every other). */
  end?: boolean
  /** Overrides the route match (a row that borrows another page's link never lights up). */
  active?: boolean
  collapsed: boolean
  onNavigate?: () => void
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
  within,
  end,
  active: forced,
  collapsed,
  onNavigate,
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
                  <span className="sf-meta ms-auto text-sf-sidebar-text-muted tabular-nums">{trail}</span>
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
function ChannelLink({ slug, row: r, mentions, collapsed, onNavigate }: { slug: string; row: ChannelRow; mentions: number; collapsed?: boolean; onNavigate?: () => void }) {
  const { channel, label, presence, group, otherId } = r
  const state = sidebarRowState(channel, mentions)
  const icon =
    channel.kind === 'channel' ? (channel.isPrivate ? IconLock : IconHash) : group ? IconUsers : <Avatar id={otherId} name={label} size="sm" presence={presence} on="frame" decorative />
  return (
    <SideLink
      to={paths.channel(slug, channel.id)}
      label={label}
      icon={icon}
      unread={state.bold}
      mentions={state.count}
      muted={state.muted}
      draft={r.draft}
      collapsed={Boolean(collapsed)}
      onNavigate={onNavigate}
    />
  )
}

export function SidebarContent({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean
  onNavigate?: () => void
}) {
  const { role, persona } = useRole()
  const check = usePermission()
  const { workspace, starred, channels, dms, projects, mentions, activityUnread, chatLoading, projectsLoading, failed } = useSidebarGroups()
  const slug = workspace?.slug
  const [newChannel, setNewChannel] = useState(false)
  const [newMessage, setNewMessage] = useState(false)
  const managesAny = projectsLoading ? undefined : projects.some((p) => p.managerId === persona.id)
  const canDashboard = check('dashboard.view', { managesAny })
  const preview = hasFeature('chatRedesign')
  const row = { collapsed, onNavigate }

  return (
    <div className="sf flex h-full flex-col px-2 pb-2 text-sf-sidebar-text">
      <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-1" aria-label="Workspace">
        {slug && (
          <SideSection id="work" label="Work" first {...row}>
            <li className="flex-none">
              <SideLink to={paths.home(slug)} end label="Home" icon={IconHome} {...row} />
            </li>
            <li className="flex-none">
              <SideLink to={paths.projects(slug)} label="Projects" icon={IconLayoutKanban} {...row} />
            </li>
            <li className="flex-none">
              <SideLink to={paths.tasks(slug)} label="My tasks" icon={IconListCheck} {...row} />
            </li>
            <li className="flex-none">
              <SideLink to={paths.teams(slug)} label="Teams" icon={IconUsers} {...row} />
            </li>
          </SideSection>
        )}

        {slug && (canDashboard || check('timeCost.view')) && (
          <SideSection id="manage" label="Manage" {...row}>
            {canDashboard && (
              <li className="flex-none">
                <SideLink to={paths.dashboard(slug)} label="Dashboard" icon={IconLayoutDashboard} {...row} />
              </li>
            )}
            {check('timeCost.view') && (
              <li className="flex-none">
                <SideLink to={paths.timeCost(slug)} label="Time & cost" icon={IconClock} {...row} />
              </li>
            )}
          </SideSection>
        )}

        {slug && (
          <SideSection id="chat" label="Chat" {...row}>
            {preview && (
              <li className="flex-none">
                <SideLink to={`/w/${slug}/threads`} label="Threads" icon={IconMessages} {...row} />
              </li>
            )}
            <li className="flex-none">
              <SideLink to={paths.activity(slug)} label="Activity" icon={IconAt} mentions={activityUnread} noun={['unread', 'unread']} {...row} />
            </li>
            {preview && (
              <>
                <li className="flex-none">
                  <SideLink to={`/w/${slug}/drafts`} label="Drafts & sent" icon={IconSend} {...row} />
                </li>
                <li className="flex-none">
                  <SideLink to={`/w/${slug}/saved`} label="Saved" icon={IconBookmark} {...row} />
                </li>
              </>
            )}
          </SideSection>
        )}

        {slug && workspace && !chatLoading && starred.length > 0 && (
          <SideSection id="starred" label="Starred" {...row}>
            {starred.map((r) => (
              <li key={r.channel.id} className="flex-none">
                <ChannelLink slug={slug} row={r} mentions={mentions.byChannel.get(r.channel.id) ?? 0} {...row} />
              </li>
            ))}
          </SideSection>
        )}

        {slug && workspace && (
          <SideSection
            id="channels"
            label="Channels"
            actions={
              <IconButton label="New channel" icon={IconPlus} size="xs" tone="sidebar-muted" className="max-lg:size-11" onClick={() => setNewChannel(true)} />
            }
            {...row}
          >
            {chatLoading ? (
              <GroupSkeleton />
            ) : (
              channels.map((r) => (
                <li key={r.channel.id} className="flex-none">
                  <ChannelLink slug={slug} row={r} mentions={mentions.byChannel.get(r.channel.id) ?? 0} {...row} />
                </li>
              ))
            )}
          </SideSection>
        )}

        {slug && workspace && (
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

        {slug && (projectsLoading || projects.length > 0) && (
          <SideSection id="projects" label="Projects" {...row}>
            {projectsLoading ? (
              <GroupSkeleton />
            ) : (
              projects.map((project) => (
                <li key={project.id} className="flex-none">
                  <SideLink
                    to={paths.project(slug, project.key)}
                    label={project.name}
                    within={paths.project(slug, project.key).replace(/\/[^/]+$/, '')}
                    icon={IconFolder}
                    {...row}
                  />
                </li>
              ))
            )}
          </SideSection>
        )}

        {failed && !collapsed && (
          <p className="sf-meta mt-3 px-2 text-sf-sidebar-text-muted">Some of this list didn’t load. Refresh to try again.</p>
        )}
      </nav>
      {slug && canSee(settingsItem, role) && (
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

/** Logo row with the white New message button at the end (spec 5.1). */
export function SidebarHeader({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { workspace } = useSidebarGroups()
  const [newMessage, setNewMessage] = useState(false)
  return (
    <div className={clsx('sf flex h-14 flex-none items-center gap-1 ps-2 pe-3', collapsed && 'justify-center px-0')}>
      <Logo collapsed={collapsed} onClick={onNavigate} />
      {!collapsed && workspace && (
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
      <div className="min-h-0 flex-1">
        <SidebarContent collapsed={collapsed} />
      </div>
      {!collapsed && <SidebarResizer />}
    </aside>
  )
}
