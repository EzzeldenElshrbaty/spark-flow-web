// Which part of each role's guide explains each page, for the round "?" Help button in the top bar. A topic is a
// chapter of the guide, or only some of its sub-headings when the chapter covers more than this page. `more` lists
// other chapters about the same page, for "More on this page". A role with nothing here gets no Help button there.
import type { Role } from '../lib/roles'

export type HelpTopic = { chapter: string; headings?: string[] }
export type PageHelp = { show: HelpTopic[]; more?: string[]; /** When the chapter's own title doesn't name the page. */ title?: string }

type PageHelpRule = { paths: string[]; roles: Partial<Record<Role, PageHelp>> }

const settings = (chapter: string, ...headings: string[]): Partial<Record<Role, PageHelp>> => ({ Management: { show: [{ chapter, headings }] } })

export const pageHelpRules: PageHelpRule[] = [
  {
    paths: ['/'],
    roles: {
      Management: { show: [{ chapter: 'company-overview' }], more: ['getting-started'] },
      'Sales Manager': { show: [{ chapter: 'my-team' }], more: ['coaching-follow-ups'] },
      Salesperson: { show: [{ chapter: 'your-home-page' }] },
    },
  },
  {
    paths: ['/leads'],
    roles: {
      Management: { show: [{ chapter: 'leads', headings: ['What you see on Leads', 'Assigning a lead'] }] },
      'Sales Manager': { show: [{ chapter: 'the-lead-queue' }] },
      Salesperson: { show: [{ chapter: 'leads', headings: ['The leads list', 'Adding a new lead', 'Response time: first contact within 2 business hours'] }] },
      'Lead Intake': { show: [{ chapter: 'your-leads-list' }], more: ['adding-a-new-lead', 'assigning-a-salesperson'] },
    },
  },
  {
    paths: ['/leads/:id'],
    roles: {
      Management: { show: [{ chapter: 'leads', headings: ['The lead page', 'Assigning a lead'] }], more: ['records-and-projects'] },
      'Sales Manager': { show: [{ chapter: 'the-lead-queue', headings: ['Assigning a lead', 'Changing the salesperson', 'Reopening a disqualified lead'] }] },
      Salesperson: { show: [{ chapter: 'leads', headings: ['The lead page', 'Logging an update', 'Not now, or not interested'] }], more: ['qualify-propose'] },
      'Lead Intake': { show: [{ chapter: 'following-a-lead' }], more: ['assigning-a-salesperson'] },
    },
  },
  {
    paths: ['/opportunities'],
    roles: {
      Management: { show: [{ chapter: 'opportunities-proposals', headings: ['The board and the list', 'Owners and lost deals'] }] },
      'Sales Manager': { show: [{ chapter: 'the-team-pipeline' }] },
      Salesperson: { show: [{ chapter: 'opportunities', headings: ['Board and list', 'Moving a deal forward'] }], more: ['proposals', 'closing'] },
    },
  },
  {
    paths: ['/opportunities/:id'],
    roles: {
      Management: { show: [{ chapter: 'opportunities-proposals', headings: ['Owners and lost deals', 'Proposals', 'Marking a deal Won'] }], more: ['approvals', 'records-and-projects'] },
      'Sales Manager': { show: [{ chapter: 'the-team-pipeline' }] },
      Salesperson: { show: [{ chapter: 'opportunities', headings: ['The opportunity page', 'Moving a deal forward'] }], more: ['proposals', 'closing'] },
    },
  },
  {
    paths: ['/opportunities/:id/proposal'],
    roles: {
      Management: { show: [{ chapter: 'opportunities-proposals', headings: ['Proposals'] }] },
      'Sales Manager': { show: [{ chapter: 'the-team-pipeline', headings: ['Your own proposals'] }] },
      Salesperson: { show: [{ chapter: 'proposals' }], more: ['closing'] },
    },
  },
  {
    paths: ['/approvals'],
    roles: {
      Management: { show: [{ chapter: 'approvals' }] },
      'Sales Manager': { show: [{ chapter: 'approvals' }] },
    },
  },
  {
    paths: ['/activities'],
    roles: {
      Management: { show: [{ chapter: 'calendar' }] },
      'Sales Manager': { show: [{ chapter: 'coaching-follow-ups' }] },
      Salesperson: { show: [{ chapter: 'calendar' }] },
    },
  },
  {
    paths: ['/clients'],
    roles: {
      Management: { show: [{ chapter: 'clients-contacts' }] },
      'Sales Manager': { show: [{ chapter: 'clients-contacts' }] },
      Salesperson: { show: [{ chapter: 'clients-contacts' }] },
    },
  },
  {
    paths: ['/clients/:id'],
    roles: {
      Management: { show: [{ chapter: 'clients-contacts', headings: ['The client page'] }], more: ['records-and-projects'] },
      'Sales Manager': { show: [{ chapter: 'clients-contacts' }] },
      Salesperson: { show: [{ chapter: 'clients-contacts' }] },
    },
  },
  {
    paths: ['/payments'],
    roles: {
      Management: { show: [{ chapter: 'payments-collections' }] },
      'Sales Manager': { show: [{ chapter: 'money', headings: ['Payments & Collections'] }] },
      Salesperson: { show: [{ chapter: 'after-the-win', headings: ['Payments & Collections'] }] },
      Accountant: { show: [{ chapter: 'payments-collections' }], more: ['recording-a-payment', 'foreign-currency-payments', 'due-dates-explained'] },
    },
  },
  {
    paths: ['/recurring-services'],
    roles: {
      Management: { show: [{ chapter: 'recurring-services' }] },
      'Sales Manager': { show: [{ chapter: 'money', headings: ['Recurring Services'] }] },
      Salesperson: { show: [{ chapter: 'after-the-win', headings: ['Recurring Services'] }] },
      Accountant: { show: [{ chapter: 'recurring-services' }] },
    },
  },
  {
    paths: ['/projects', '/projects/:id'],
    roles: {
      Management: { show: [{ chapter: 'projects' }] },
      'Sales Manager': { show: [{ chapter: 'projects' }] },
      Salesperson: { show: [{ chapter: 'after-the-win', headings: ['Projects'] }] },
      Accountant: { show: [{ chapter: 'projects' }], more: ['due-dates-explained'] },
    },
  },
  {
    paths: ['/targets', '/targets/:userId'],
    roles: {
      Management: { show: [{ chapter: 'targets' }] },
      'Sales Manager': { show: [{ chapter: 'targets' }] },
      Salesperson: { show: [{ chapter: 'targets-reports', headings: ['My target'] }] },
    },
  },
  {
    paths: ['/reports', '/reports/:id'],
    roles: {
      Management: { show: [{ chapter: 'notifications-reports', headings: ['Reports'] }] },
      'Sales Manager': { show: [{ chapter: 'reports' }] },
      Salesperson: { show: [{ chapter: 'targets-reports', headings: ['Reports'] }] },
    },
  },
  { paths: ['/settings'], roles: { Management: { title: 'Settings', show: [{ chapter: 'settings-team', headings: [] }], more: ['settings-team', 'settings-company', 'settings-sales'] } } },
  { paths: ['/settings/users'], roles: settings('settings-team', 'Adding a user', 'Looking after users') },
  { paths: ['/settings/user-activity'], roles: settings('settings-team', 'User activity') },
  { paths: ['/settings/notification-emails'], roles: settings('settings-team', 'Email notifications') },
  { paths: ['/settings/markets'], roles: settings('settings-company', 'Markets') },
  { paths: ['/settings/currencies'], roles: settings('settings-company', 'Currencies and rates') },
  { paths: ['/settings/calendars'], roles: settings('settings-company', 'Working days and holidays') },
  { paths: ['/settings/lists'], roles: settings('settings-sales', 'Lists') },
  { paths: ['/settings/lead-sources'], roles: settings('settings-sales', 'Lead sources and channels') },
  { paths: ['/settings/catalog'], roles: settings('settings-sales', 'Item catalog, discount limits and VAT') },
  { paths: ['/settings/sla'], roles: settings('settings-sales', 'Response times') },
  { paths: ['/settings/targets'], roles: settings('settings-sales', 'Target settings') },
]
