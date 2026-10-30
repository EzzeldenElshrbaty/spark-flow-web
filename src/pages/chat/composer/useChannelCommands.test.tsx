// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Channel } from '@/api/types'
import { bodyText, parseBody, type Body } from '@/lib/messageBody'
import { parseCommand, type CommandOutcome, type ParsedCommand } from '@/lib/slashCommands'
import { useChannelCommands, type ChannelCommandUi } from '@/pages/chat/composer/useChannelCommands'

const mute = vi.fn(async (_: { id: string; muted: boolean }) => {})
const update = vi.fn(async (_: { id: string; patch: { topic?: string } }) => {})
const leave = vi.fn(async (_: string) => {})
const navigate = vi.fn()
let rights = { manage: true, leave: true, archive: true }
vi.mock('@/api/chat', () => ({
  useSetMuted: () => ({ mutateAsync: mute }),
  useUpdateChannel: () => ({ mutateAsync: update }),
  useLeaveChannel: () => ({ mutateAsync: leave }),
}))
vi.mock('@/pages/chat/ChannelActions', () => ({ useChannelRights: () => rights }))
vi.mock('@/layout/useCurrentWorkspace', () => ({ useCurrentWorkspace: () => ({ workspace: { slug: 'engineering' } }) }))
vi.mock('react-router', () => ({ useNavigate: () => navigate }))

const backend = { id: 'c-backend', kind: 'channel', name: 'backend', muted: false } as Channel
const dm = { id: 'd-1', kind: 'dm', name: null, muted: true } as unknown as Channel

beforeEach(() => {
  rights = { manage: true, leave: true, archive: true }
  for (const f of [mute, update, leave, navigate]) f.mockClear()
})
afterEach(cleanup)

const ui = (more: Partial<ChannelCommandUi> = {}): ChannelCommandUi => ({ openDetails: vi.fn(), ...more })
const names = (channel: Channel, u = ui()) => renderHook(() => useChannelCommands(channel, u)).result.current.commands.map((c) => c.name)
const cmd = (text: string) => parseCommand(parseBody(text)) as ParsedCommand
const run = async (channel: Channel, text: string, u = ui()) => {
  const { result } = renderHook(() => useChannelCommands(channel, u))
  let outcome: CommandOutcome | undefined
  await act(async () => {
    outcome = await result.current.run(cmd(text), parseBody(text))
  })
  return outcome
}

describe('useChannelCommands (spec 6.8)', () => {
  it('offers by rights: an Admin in a channel gets every one but /task without a project; a member less; a DM only /mute and /shrug', () => {
    expect(names(backend)).toEqual(['invite', 'topic', 'mute', 'leave', 'shrug'])
    expect(names(backend, ui({ newTask: { projectName: 'Nexus Core', open: vi.fn() }, remind: vi.fn() }))).toEqual(['remind', 'task', 'invite', 'topic', 'mute', 'leave', 'shrug'])
    rights = { manage: false, leave: true, archive: false }
    expect(names(backend)).toEqual(['mute', 'leave', 'shrug'])
    rights = { manage: false, leave: false, archive: false }
    expect(names(dm)).toEqual(['mute', 'shrug'])
  })

  it('words /task for the project and /mute for what it will do', () => {
    const { result } = renderHook(() => useChannelCommands(dm, ui({ newTask: { projectName: 'Nexus Core', open: vi.fn() } })))
    expect(result.current.commands.find((c) => c.name === 'task')?.description).toBe('Create a Flow task in Nexus Core')
    expect(result.current.commands.find((c) => c.name === 'mute')?.description).toBe('Unmute this conversation')
  })

  it('/mute mutes and says how to undo it; in a muted DM it unmutes', async () => {
    expect(await run(backend, '/mute')).toEqual({ notice: '#backend is muted. Type /mute to unmute it.' })
    expect(mute).toHaveBeenLastCalledWith({ id: 'c-backend', muted: true })
    expect(await run(dm, '/mute')).toEqual({ notice: 'This conversation is unmuted.' })
    expect(mute).toHaveBeenLastCalledWith({ id: 'd-1', muted: false })
  })

  it('/topic with words sets it; without, opens About to write one', async () => {
    const u = ui()
    expect(await run(backend, '/topic Deploys on Thursdays', u)).toEqual({})
    expect(update).toHaveBeenCalledWith({ id: 'c-backend', patch: { topic: 'Deploys on Thursdays' } })
    await run(backend, '/topic', u)
    expect(u.openDetails).toHaveBeenCalledWith('about', { editTopic: true })
  })

  it('/invite opens Add people with the people named; /leave leaves and goes Home', async () => {
    const u = ui()
    await run(backend, '/invite', u)
    expect(u.openDetails).toHaveBeenCalledWith('members', { addPeople: [] })
    await run(backend, '/leave', u)
    expect(leave).toHaveBeenCalledWith('c-backend')
    expect(navigate).toHaveBeenCalledWith('/w/engineering')
  })

  it('/task opens the sheet with the title and the first person as assignee; /remind opens the reminder with the words', async () => {
    const open = vi.fn()
    const remind = vi.fn()
    const u = ui({ newTask: { projectName: 'Nexus Core', open }, remind })
    await run(backend, '/task Fix the cursor filter', u)
    expect(open).toHaveBeenCalledWith({ title: 'Fix the cursor filter', assigneeId: null })
    await run(backend, '/remind check the deploy', u)
    expect(remind).toHaveBeenCalledWith('check the deploy')
  })

  it('/shrug sends the shrug', async () => {
    const outcome = (await run(backend, '/shrug fine')) as { send: Body }
    expect(bodyText(outcome.send)).toBe('fine ¯\\_(ツ)_/¯')
  })
})
