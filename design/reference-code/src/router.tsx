import { lazy, type ComponentType } from 'react'
import { createBrowserRouter, Navigate } from 'react-router'
import { AppLayout } from './layout/AppLayout'
import { allNavItems } from './navigation'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { presalesEnabled } from './lib/features'

/**
 * A page whose code downloads the first time it's opened, so the first visit (and the sign-in screen) only loads what
 * it shows. AppLayout's Suspense covers the moment it takes.
 */
function page<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  return lazy(() => load().then((module) => ({ default: module[name] })))
}

const ApprovalsPage = page(() => import('./pages/approvals/ApprovalsPage'), 'ApprovalsPage')
const CalendarPage = page(() => import('./pages/calendar/CalendarPage'), 'CalendarPage')
const ClientDetailPage = page(() => import('./pages/clients/ClientDetailPage'), 'ClientDetailPage')
const ClientsPage = page(() => import('./pages/clients/ClientsPage'), 'ClientsPage')
const HomePage = page(() => import('./pages/HomePage'), 'HomePage')
const LeadDetailPage = page(() => import('./pages/leads/LeadDetailPage'), 'LeadDetailPage')
const LeadsPage = page(() => import('./pages/leads/LeadsPage'), 'LeadsPage')
const OpportunitiesPage = page(() => import('./pages/opportunities/OpportunitiesPage'), 'OpportunitiesPage')
const OpportunityDetailPage = page(() => import('./pages/opportunities/OpportunityDetailPage'), 'OpportunityDetailPage')
const ProposalBuilderPage = page(() => import('./pages/opportunities/ProposalBuilderPage'), 'ProposalBuilderPage')
const PresalesPage = page(() => import('./pages/opportunities/PresalesPage'), 'PresalesPage')
const CatalogPage = page(() => import('./pages/settings/CatalogPage'), 'CatalogPage')
const ListsPage = page(() => import('./pages/settings/ListsPage'), 'ListsPage')
const CurrenciesPage = page(() => import('./pages/settings/CurrenciesPage'), 'CurrenciesPage')
const SettingsHome = page(() => import('./pages/settings/shared'), 'SettingsHome')
const LeadSourcesPage = page(() => import('./pages/settings/LeadSourcesPage'), 'LeadSourcesPage')
const MarketsPage = page(() => import('./pages/settings/MarketsPage'), 'MarketsPage')
const ResponseTimesPage = page(() => import('./pages/settings/ResponseTimesPage'), 'ResponseTimesPage')
const UsersPage = page(() => import('./pages/settings/UsersPage'), 'UsersPage')
const UserActivityPage = page(() => import('./pages/settings/UserActivityPage'), 'UserActivityPage')
const AuditLogPage = page(() => import('./pages/settings/AuditLogPage'), 'AuditLogPage')
const WorkingDaysPage = page(() => import('./pages/settings/WorkingDaysPage'), 'WorkingDaysPage')
const EmailNotificationsPage = page(() => import('./pages/settings/EmailNotificationsPage'), 'EmailNotificationsPage')
const PaymentsPage = page(() => import('./pages/payments/PaymentsPage'), 'PaymentsPage')
const RecurringServicesPage = page(() => import('./pages/payments/RecurringServicesPage'), 'RecurringServicesPage')
const ProjectsPage = page(() => import('./pages/projects/ProjectsPage'), 'ProjectsPage')
const ProjectDetailPage = page(() => import('./pages/projects/ProjectDetailPage'), 'ProjectDetailPage')
const TargetsPage = page(() => import('./pages/targets/TargetsPage'), 'TargetsPage')
const PersonTargetPage = page(() => import('./pages/targets/PersonTargetPage'), 'PersonTargetPage')
const TargetSettingsPage = page(() => import('./pages/settings/TargetSettingsPage'), 'TargetSettingsPage')
const ReportsPage = page(() => import('./pages/reports/ReportsPage'), 'ReportsPage')
const ReportPage = page(() => import('./pages/reports/ReportPage'), 'ReportPage')
const HelpPage = page(() => import('./pages/help/HelpPage'), 'HelpPage')

/** Settings pages that are built; the rest still show "next in line". */
const builtSettings = [
  { path: '/settings/users', element: <UsersPage /> },
  { path: '/settings/user-activity', element: <UserActivityPage /> },
  { path: '/settings/audit-log', element: <AuditLogPage /> },
  { path: '/settings/markets', element: <MarketsPage /> },
  { path: '/settings/currencies', element: <CurrenciesPage /> },
  { path: '/settings/calendars', element: <WorkingDaysPage /> },
  { path: '/settings/lead-sources', element: <LeadSourcesPage /> },
  { path: '/settings/sla', element: <ResponseTimesPage /> },
  { path: '/settings/targets', element: <TargetSettingsPage /> },
  { path: '/settings/notification-emails', element: <EmailNotificationsPage /> },
]

export const router = createBrowserRouter([
  // The sign-in screens show before the app; signed in, their links lead Home.
  ...['/sign-in', '/forgot-password', '/set-password'].map((path) => ({ path, element: <Navigate to="/" replace /> })),
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      // Help for the signed-in user's role (the guide comes from the API, behind sign-in).
      { path: '/help', element: <HelpPage /> },
      { path: '/help/:chapter', element: <HelpPage /> },
      { path: '/leads', element: <LeadsPage /> },
      { path: '/leads/:id', element: <LeadDetailPage /> },
      { path: '/opportunities', element: <OpportunitiesPage /> },
      { path: '/opportunities/:id', element: <OpportunityDetailPage /> },
      { path: '/opportunities/:id/proposal', element: <ProposalBuilderPage /> },
      // Old Presales links go to Opportunities while presales is switched off.
      { path: '/presales', element: presalesEnabled ? <PresalesPage /> : <Navigate to="/opportunities" replace /> },
      // The Proposals page was dropped (Ahmed, 2026-10-04): proposals live inside each opportunity and in Approvals.
      { path: '/proposals', element: <Navigate to="/opportunities" replace /> },
      { path: '/approvals', element: <ApprovalsPage /> },
      { path: '/activities', element: <CalendarPage /> },
      { path: '/clients', element: <ClientsPage /> },
      { path: '/clients/:id', element: <ClientDetailPage /> },
      { path: '/payments', element: <PaymentsPage /> },
      { path: '/recurring-services', element: <RecurringServicesPage /> },
      { path: '/projects', element: <ProjectsPage /> },
      { path: '/projects/:id', element: <ProjectDetailPage /> },
      { path: '/settings/lists', element: <ListsPage /> },
      { path: '/settings/catalog', element: <CatalogPage /> },
      ...builtSettings,
      { path: '/targets', element: <TargetsPage /> },
      { path: '/targets/:userId', element: <PersonTargetPage /> },
      { path: '/reports', element: <ReportsPage /> },
      { path: '/reports/:id', element: <ReportPage /> },
      ...allNavItems
        .filter((item) => !['/', '/leads', '/opportunities', '/presales', '/approvals', '/activities', '/clients', '/payments', '/recurring-services', '/projects', '/targets', '/reports'].includes(item.path))
        .flatMap((item) => [
          { path: item.path, element: item.path === '/settings' ? <SettingsHome /> : <PlaceholderPage item={item} /> },
          ...(item.children ?? [])
            .filter((child) => !['/settings/lists', '/settings/catalog', ...builtSettings.map((route) => route.path)].includes(`${item.path}/${child.path}`))
            .map((child) => ({
              path: `${item.path}/${child.path}`,
              element: <PlaceholderPage item={{ ...child, roles: item.roles }} />,
            })),
        ]),
    ],
  },
])
