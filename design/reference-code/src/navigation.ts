// Side menu of Spark CRM (requirements §15, with Referral Partners removed for now, Presales added and Projects §9.1).
// `roles` mirrors the visibility matrix (§2.3); the real app will check `permission` instead.
import {
  BadgeCheck,
  Building2,
  CalendarCheck,
  ChartColumn,
  ClipboardList,
  FolderKanban,
  House,
  Repeat,
  Settings,
  SquareKanban,
  Target,
  UserPlus,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from './lib/roles'
import { presalesEnabled } from './lib/features'

export type NavItem = {
  path: string
  label: string
  permission: string
  icon?: LucideIcon
  roles?: Role[]
  description?: string
  children?: NavItem[]
}

export type NavGroup = { label: string; items: NavItem[] }

const everyoneButIntake: Role[] = ['Management', 'Sales Manager', 'Salesperson']
const managers: Role[] = ['Management', 'Sales Manager']
// The Accountant works only on the money clients pay.
const moneyArea: Role[] = [...everyoneButIntake, 'Accountant']
const presalesArea: Role[] = ['Management', 'Sales Manager', 'Presales']

export const settingsSections: NavItem[] = [
  { path: 'lists', label: 'Lists: services, activities, pipeline stages, reasons, payment methods', permission: 'settings.manage' },
  { path: 'markets', label: 'Markets', permission: 'settings.manage' },
  { path: 'currencies', label: 'Currencies & indicative rates', permission: 'settings.manage' },
  { path: 'users', label: 'Users, roles & permissions', permission: 'settings.manage' },
  { path: 'user-activity', label: 'User activity', permission: 'settings.manage' },
  { path: 'audit-log', label: 'Audit log', permission: 'settings.manage' },
  { path: 'calendars', label: 'Working days & holidays', permission: 'settings.manage' },
  { path: 'lead-sources', label: 'Lead sources & channels', permission: 'settings.manage' },
  { path: 'catalog', label: 'Item catalog, discount limits and VAT', permission: 'settings.manage' },
  { path: 'sla', label: 'Response times (SLA)', permission: 'settings.manage' },
  { path: 'notification-emails', label: 'Email notifications', permission: 'settings.manage' },
  { path: 'targets', label: 'Target settings', permission: 'settings.manage' },
]

export const navGroups: NavGroup[] = [
  {
    label: 'Sell',
    items: [
      { path: '/', label: 'Home', permission: 'dashboard.view', icon: House, roles: everyoneButIntake, description: "Today's work, pipeline and target." },
      { path: '/leads', label: 'Leads', permission: 'leads.view', icon: UserPlus, roles: ['Management', 'Sales Manager', 'Salesperson', 'Lead Intake'], description: 'New enquiries, the unassigned queue and qualification.' },
      { path: '/opportunities', label: 'Opportunities', permission: 'opportunities.view', icon: SquareKanban, roles: everyoneButIntake, description: 'The pipeline board from Preparing proposal to Won.' },
      { path: '/activities', label: 'Calendar', permission: 'activities.view', icon: CalendarCheck, roles: everyoneButIntake, description: 'Next steps by day and week, overdue items and logged updates.' },
    ],
  },
  {
    label: 'Team',
    items: [
      ...(presalesEnabled ? [{ path: '/presales', label: 'Presales', permission: 'presales.work', icon: ClipboardList, roles: presalesArea, description: 'Scoping requests for presales, with their deadlines.' }] : []),
      { path: '/approvals', label: 'Approvals', permission: 'approvals.decide', icon: BadgeCheck, roles: managers, description: 'Signed deals to confirm as Won, and discount and exchange-rate requests.' },
      { path: '/clients', label: 'Clients & Contacts', permission: 'clients.view', icon: Building2, roles: everyoneButIntake, description: 'Client companies and their contacts.' },
      { path: '/projects', label: 'Projects', permission: 'projects.view', icon: FolderKanban, roles: moneyArea, description: 'Won deals: when they started, whether they’re finished, and their files.' },
    ],
  },
  {
    label: 'Money',
    items: [
      { path: '/payments', label: 'Payments & Collections', permission: 'payments.view', icon: Wallet, roles: moneyArea, description: 'What clients owe on won deals, collections and overdue payments.' },
      { path: '/recurring-services', label: 'Recurring Services', permission: 'recurring.view', icon: Repeat, roles: moneyArea, description: 'Recurring items from won deals and upcoming renewals.' },
      { path: '/targets', label: 'Targets', permission: 'targets.view', icon: Target, roles: everyoneButIntake, description: 'Each salesperson’s cycle and the company’s year, against money collected.' },
      { path: '/reports', label: 'Reports', permission: 'reports.view', icon: ChartColumn, roles: everyoneButIntake, description: 'Funnel, conversion, forecast, SLA and lead source reports.' },
    ],
  },
]

export const settingsItem: NavItem = {
  path: '/settings',
  label: 'Settings',
  permission: 'settings.manage',
  icon: Settings,
  roles: ['Management'],
  description: 'Markets, currencies, users, stages, catalog and rules.',
  children: settingsSections,
}

export const allNavItems: NavItem[] = [...navGroups.flatMap((group) => group.items), settingsItem]

export function canSee(item: NavItem, role: Role) {
  return !item.roles || item.roles.includes(role)
}

// Items pinned to the mobile bottom bar; everything else lives under "More".
export const mobilePrimaryPaths = ['/', '/leads', '/opportunities', '/activities', ...(presalesEnabled ? ['/presales'] : []), '/payments', '/recurring-services']
