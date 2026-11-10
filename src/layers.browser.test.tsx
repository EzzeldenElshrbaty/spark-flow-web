import '@/index.css'
import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { focusables } from '@/components/sf/layers'
import { axeProblems } from '@/test/axe'
import { renderApp } from '@/test/app'
import { AUDIT_TAGS, untilQuiet } from '@/test/uxChecks'

// UX Phase 6, 6.1: every sheet and dialog from the keyboard, as the Admin at 1440 in light. Each one takes focus, keeps
// Tab inside, passes axe, and gives focus back to what opened it. A form sheet keeps what was typed when Esc is pressed
// (the kit's "doesn't close by accident"); a chat dialog's Esc asks like Cancel. ✕ and Cancel ask the discard question
// first, and Keep editing keeps the text and the focus in the dialog.

type Layer = {
  /** The dialog's accessible name. */
  name: string
  path: string
  /** Opens it; returns where focus must come back to (the button, or the menu's trigger). */
  open: () => Promise<HTMLElement>
  kind: 'sheet' | 'modal'
  /** A form: makes a change and returns a check that it's still there. */
  change?: (dialog: HTMLElement) => Promise<() => boolean>
  question?: string
  /** The button that cancels (Manage phases has Done). */
  cancel?: string
}

const main = () => screen.getByRole('main')

async function press(button: HTMLElement) {
  await userEvent.click(button)
  return button
}

const mainButton = async (name: string | RegExp) => press(await within(main()).findByRole('button', { name }))
const anyButton = async (name: string | RegExp) => press((await screen.findAllByRole('button', { name }))[0]!)

async function viaMenu(trigger: string | RegExp, item: string) {
  const button = (await screen.findAllByRole('button', { name: trigger }))[0]!
  await userEvent.click(button)
  await userEvent.click(await screen.findByRole('menuitem', { name: item }))
  return button
}

/** Types "x" into a text field. */
const typeInto = (label: string) => async (dialog: HTMLElement) => {
  const field = within(dialog).getByRole('textbox', { name: label }) as HTMLInputElement
  const before = field.value
  await userEvent.click(field)
  await userEvent.keyboard('x')
  const typed = field.value
  expect(typed).not.toBe(before)
  return () => field.isConnected && field.value === typed
}

/** Sets a number or date field to `value`. */
const fill = (label: string, value: string) => async (dialog: HTMLElement) => {
  const field = within(dialog).getByLabelText(label) as HTMLInputElement
  await userEvent.fill(field, value)
  return () => field.isConnected && field.value === value
}

const LAYERS: Layer[] = [
  { name: 'New task', path: '/w/engineering/p/NEX/tasks', open: () => mainButton('New task'), kind: 'sheet', change: typeInto('Title'), question: 'Discard this new task?' },
  {
    name: 'Edit task',
    path: '/w/engineering/p/NEX/tasks?ticket=NEX-101',
    open: async () => press(await within(await screen.findByRole('complementary', { name: 'Task' })).findByRole('button', { name: 'Edit task' })),
    kind: 'sheet',
    change: typeInto('Title'),
    question: 'Discard your changes?',
  },
  { name: 'New project', path: '/w/engineering/projects', open: () => mainButton('New project'), kind: 'sheet', change: typeInto('Name'), question: 'Discard this new project?' },
  { name: 'Edit project', path: '/w/engineering/p/NEX/overview', open: () => mainButton('Edit project'), kind: 'sheet', change: typeInto('Name'), question: 'Discard your changes?' },
  { name: 'Add deliverable', path: '/w/engineering/p/NEX/overview', open: () => mainButton('Add deliverable'), kind: 'sheet', change: typeInto('Title'), question: 'Discard this new deliverable?' },
  { name: 'Manage phases', path: '/w/engineering/p/NEX/overview', open: () => viaMenu('More actions', 'Manage phases'), kind: 'sheet', change: typeInto('New phase name'), question: 'Discard your changes?', cancel: 'Done' },
  { name: 'Add column', path: '/w/engineering/p/NEX/tasks?view=board', open: () => mainButton('Add column'), kind: 'sheet', change: typeInto('Name'), question: 'Discard this new column?' },
  { name: 'Column details', path: '/w/engineering/p/NEX/tasks?view=board', open: () => viaMenu('Column actions: To do', 'Change type'), kind: 'sheet', change: typeInto('Name'), question: 'Discard your changes?' },
  { name: 'Add time', path: '/w/engineering/p/NEX/time', open: () => mainButton('Add time'), kind: 'sheet', change: typeInto('Note'), question: 'Discard this time entry?' },
  { name: 'Add person', path: '/w/engineering/settings/users', open: () => mainButton('Add person'), kind: 'sheet', change: typeInto('Name'), question: 'Discard this new person?' },
  { name: 'Edit Mariam Fathy', path: '/w/engineering/settings/users', open: () => mainButton(/^Mariam Fathy/), kind: 'sheet', change: typeInto('Name'), question: 'Discard your changes?' },
  { name: 'New team', path: '/w/engineering/teams', open: () => mainButton('New team'), kind: 'sheet', change: typeInto('Name'), question: 'Discard this new team?' },
  { name: 'Rename Frontend', path: '/w/engineering/teams', open: () => viaMenu('Frontend actions', 'Rename'), kind: 'sheet', change: typeInto('Name'), question: 'Discard your changes?' },
  { name: 'Add role', path: '/w/engineering/settings/roles', open: () => mainButton('Add role'), kind: 'sheet', change: typeInto('Name'), question: 'Discard this new role?' },
  { name: 'Rename Member', path: '/w/engineering/settings/roles', open: () => viaMenu('Member actions', 'Rename'), kind: 'sheet', change: typeInto('Name'), question: 'Discard your changes?' },
  { name: 'Keep archived records', path: '/w/engineering/settings/archived', open: () => mainButton('Change'), kind: 'sheet', change: fill('Days', '45'), question: 'Discard your changes?' },
  {
    name: 'Working hours and timer',
    path: '/w/engineering/settings/attendance',
    open: () => mainButton('Change working hours and timer'),
    kind: 'sheet',
    change: fill('Pause timers after (hours)', '7'),
    question: 'Discard your changes?',
  },
  { name: 'New channel', path: '/w/engineering/c/c-general', open: () => anyButton('Add channels'), kind: 'modal', change: typeInto('Name'), question: 'Discard this new channel?' },
  {
    name: 'New message',
    path: '/w/engineering/c/c-general',
    open: () => anyButton('New message'),
    kind: 'modal',
    // Choosing a person is the change (typing a search isn't).
    change: async (dialog) => {
      const box = within(dialog).getAllByRole('checkbox')[0] as HTMLInputElement
      await userEvent.click(box)
      return () => box.isConnected && box.checked
    },
    question: 'Discard this new message?',
  },
  { name: 'Start timer', path: '/w/engineering/c/c-general', open: () => anyButton('Start timer'), kind: 'modal' },
  { name: 'Add a bookmark', path: '/w/engineering/c/c-general', open: () => anyButton('Add a bookmark'), kind: 'modal' },
  { name: 'Page history', path: '/w/engineering/c/c-general?tab=page', open: () => anyButton('History'), kind: 'modal' },
  {
    name: 'Jump to a date',
    path: '/w/engineering/c/c-general',
    open: async () => {
      const divider = (await screen.findAllByRole('button', { name: /^(Today|Yesterday|\w+day \d+ \w+)$/ }))[0]!
      await userEvent.click(divider)
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Jump to a specific date…' }))
      return divider
    },
    kind: 'modal',
  },
]

const inside = (dialog: HTMLElement) => dialog.contains(document.activeElement)

async function tabStaysInside(dialog: HTMLElement) {
  const items = focusables(dialog).filter((el) => el.getBoundingClientRect().width > 0)
  for (let i = 0; i < items.length + 2; i++) {
    await userEvent.keyboard('{Tab}')
    expect(inside(dialog), `Tab ${i + 1} left the dialog for ${document.activeElement?.outerHTML.slice(0, 80)}`).toBe(true)
  }
  items[0]!.focus()
  await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
  expect(document.activeElement, 'Shift+Tab from the first control').toBe(items.at(-1))
}

describe('every sheet and dialog from the keyboard', () => {
  for (const layer of LAYERS) {
    it(layer.name, async () => {
      const app = await renderApp({ path: layer.path, as: 'admin', theme: 'light', size: 'desktop' })
      await app.settled()
      const opener = await layer.open()
      const dialog = await screen.findByRole('dialog', { name: layer.name })
      await waitFor(() => expect(inside(dialog), 'focus moves into the dialog').toBe(true))

      await tabStaysInside(dialog)
      await untilQuiet()
      expect(await axeProblems(dialog, { tags: AUDIT_TAGS, skip: ['region'] })).toEqual([])

      if (layer.change) {
        const kept = await layer.change(dialog)
        await userEvent.keyboard('{Escape}')
        if (layer.kind === 'sheet') {
          expect(screen.queryByText(layer.question!), 'Esc on a form sheet asks nothing').toBeNull()
        } else {
          await userEvent.click(await within(dialog).findByRole('button', { name: 'Keep editing' }))
        }
        expect(kept(), 'Esc keeps the change').toBe(true)

        await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
        expect(within(dialog).getByText(layer.question!)).toBeTruthy()
        await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
        expect(kept(), 'Keep editing keeps the change').toBe(true)
        await waitFor(() => expect(inside(dialog), 'Keep editing keeps focus in the dialog').toBe(true))

        await userEvent.click(within(dialog).getByRole('button', { name: layer.cancel ?? 'Cancel' }))
        await userEvent.click(await within(dialog).findByRole('button', { name: 'Discard' }))
      } else {
        await userEvent.keyboard('{Escape}')
      }
      await waitFor(() => expect(screen.queryByRole('dialog', { name: layer.name })).toBeNull())
      await waitFor(() => expect(document.activeElement, 'focus returns to what opened it').toBe(opener))
    }, 30_000)
  }
})
