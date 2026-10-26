import { useQuery } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { inputClass } from '../../components/ui/Field'
import { pipelineStages } from '../../mocks/pipeline'
import { responseTimesApi } from '../../api/settingsLists'
import type { ResponseTimes } from '../../mocks/responseTimes'
import { ErrorText, Section, SettingsPage } from './shared'
import { useSettingsChange } from './useSettingsChange'

/** Settings → Response times (requirements §11.2): the limits behind the SLA flags and alerts. */
export function ResponseTimesPage() {
  const { data } = useQuery({ queryKey: ['settings', 'response-times'], queryFn: responseTimesApi.get })
  return (
    <SettingsPage title="Response times" subtitle="How fast leads and deals must move. Going past a limit flags the record and notifies the salesperson and their Sales Manager.">
      {!data ? <div className="h-64 animate-pulse rounded-xl bg-surface-strong" /> : <Form key={JSON.stringify(data)} saved={data} />}
    </SettingsPage>
  )
}

function NumberRow({ label, hint, unit, value, onChange }: { label: string; hint: string; unit: string; value: number; onChange: (value: number) => void }) {
  return (
    <li className="flex items-center gap-4 px-5 py-3">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-fg">{label}</span>
        <span className="block text-xs text-fg-muted">{hint}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="w-16">
          <input
            className={`${inputClass} text-right tabular-nums`}
          inputMode="numeric"
          value={value || ''}
          onChange={(event) => onChange(Number(event.target.value.replace(/\D/g, '')))}
            aria-label={label}
          />
        </span>
        <span className="min-w-10 whitespace-nowrap text-sm text-fg-muted">{unit}</span>
      </span>
    </li>
  )
}

function Form({ saved }: { saved: ResponseTimes }) {
  const [draft, setDraft] = useState(saved)
  const { run, pending, error } = useSettingsChange()
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const stages = pipelineStages()

  return (
    <div className="space-y-8">
      <Section title="Leads">
        <ul className="divide-y divide-line-subtle">
          <NumberRow
            label="Waiting for a salesperson"
            hint="A new lead left unassigned longer than this alerts the managers and Lead Intake."
            unit="business hours"
            value={draft.unassignedHours}
            onChange={(unassignedHours) => setDraft({ ...draft, unassignedHours })}
          />
          <NumberRow
            label="First contact"
            hint="After a lead is assigned, the salesperson contacts them within this time."
            unit="business hours"
            value={draft.firstContactHours}
            onChange={(firstContactHours) => setDraft({ ...draft, firstContactHours })}
          />
        </ul>
      </Section>
      <Section title="Opportunities" description="Days a deal can stay in one stage before it counts as stuck.">
        <ul className="divide-y divide-line-subtle">
          {stages.map((stage) => (
            <NumberRow
              key={stage.id}
              label={stage.label}
              hint={`Stuck after ${draft.stuckDays[stage.id] || '…'} days here.`}
              unit="days"
              value={draft.stuckDays[stage.id]}
              onChange={(days) => setDraft({ ...draft, stuckDays: { ...draft.stuckDays, [stage.id]: days } })}
            />
          ))}
        </ul>
      </Section>
      <p className="flex items-start gap-2 px-1 text-xs text-fg-muted">
        <Bell className="mt-0.5 size-3.5 shrink-0" />
        Only business hours count: each market's working days and hours, without its holidays (Settings → Working days). A lead that arrives at 10 PM starts its clock when the next working day opens.
      </p>
      {(dirty || error) && (
        <div className="sticky bottom-20 flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-line bg-surface/95 p-3 shadow-lg backdrop-blur lg:bottom-4">
          <ErrorText>{error}</ErrorText>
          <Button variant="secondary" onClick={() => setDraft(saved)}>
            Cancel
          </Button>
          <Button disabled={pending || !dirty} onClick={() => run(() => responseTimesApi.save(draft))}>
            Save
          </Button>
        </div>
      )}
    </div>
  )
}
