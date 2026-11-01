import type { TimeReport } from '@/api/types'
import { localDay } from '@/lib/dates'

const tenth = (n: number) => Math.round(n * 10) / 10

/** The Time & cost table on screen as CSV rows: a header, then one row per line; hours to a tenth, money in whole EGP. */
export function reportRows(report: TimeReport, by: 'project' | 'person' | 'week', names: { project: (id: string) => string; person: (id: string) => string }): (string | number)[][] {
  if (by === 'project') return [['Project', 'Hours', 'Cost (EGP)'], ...report.byProject.map((r) => [names.project(r.projectId), tenth(r.hours), Math.round(r.cost)])]
  if (by === 'person') return [['Person', 'Rate (EGP/h)', 'Hours', 'Cost (EGP)'], ...report.byPerson.map((r) => [names.person(r.userId), r.rate, tenth(r.hours), Math.round(r.cost)])]
  return [['Week of', 'Hours', 'Cost (EGP)'], ...report.byWeek.map((r) => [localDay(new Date(r.weekStart)), tenth(r.hours), Math.round(r.cost)])]
}

/** What an export held, for the audit log (slice 2): "30 days · By project · All projects". */
export function exportDetail(days: number, grouping: string, projectName: string | null): string {
  return [`${days} days`, grouping, projectName ?? 'All projects'].join(' · ')
}
