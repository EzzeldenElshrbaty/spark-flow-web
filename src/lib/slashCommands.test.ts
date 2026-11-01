import { describe, expect, it } from 'vitest'
import { bodyText, parseBody, type Body, type Inline } from '@/lib/messageBody'
import { COMMANDS, commandOptions, parseCommand, shrugBody } from '@/lib/slashCommands'

const p = (...children: Inline[]): Body => [{ type: 'p', children }]

describe('parseCommand (spec 6.8 shortcuts)', () => {
  it('reads /name and what follows', () => {
    expect(parseCommand(parseBody('/topic Deploys on Thursdays'))).toEqual({ name: 'topic', args: 'Deploys on Thursdays', text: 'Deploys on Thursdays', userIds: [] })
    expect(parseCommand(parseBody('/mute'))).toEqual({ name: 'mute', args: '', text: '', userIds: [] })
    // An unknown name is still a command: the composer says it isn't one rather than posting it.
    expect(parseCommand(parseBody('/foo bar'))?.name).toBe('foo')
  })

  it('text that only looks like a command is a message', () => {
    for (const text of ['/v2/invoices is slow', ' /mute', '/etc/hosts', 'see /mute', '/', '/ mute', '/Mute']) {
      expect(parseCommand(text.startsWith(' ') ? p({ type: 'text', text }) : parseBody(text)), text).toBeNull()
    }
    expect(parseCommand([])).toBeNull()
    expect(parseCommand([{ type: 'code', text: '/mute' }])).toBeNull()
  })

  it('takes the people mentioned out of the words and lists them', () => {
    const body = p({ type: 'text', text: '/invite ' }, { type: 'user', id: 'u-2', name: 'Nour El-Sayed' }, { type: 'text', text: ' ' }, { type: 'user', id: 'u-3', name: 'Hossam Gaber' })
    expect(parseCommand(body)).toEqual({ name: 'invite', args: '', text: '@Nour El-Sayed @Hossam Gaber', userIds: ['u-2', 'u-3'] })
    const task = p({ type: 'text', text: '/task Fix the cursor filter ' }, { type: 'user', id: 'u-2', name: 'Nour El-Sayed' })
    expect(parseCommand(task)).toEqual({ name: 'task', args: 'Fix the cursor filter', text: 'Fix the cursor filter @Nour El-Sayed', userIds: ['u-2'] })
  })
})

describe('commandOptions', () => {
  it('lists the offered commands that start with what was typed, in the spec order', () => {
    expect(commandOptions('', COMMANDS).map((c) => c.name)).toEqual(['remind', 'task', 'invite', 'topic', 'mute', 'leave', 'search', 'shrug'])
    expect(commandOptions('t', COMMANDS).map((c) => c.name)).toEqual(['task', 'topic'])
    expect(commandOptions('MU', COMMANDS).map((c) => c.name)).toEqual(['mute'])
    expect(commandOptions('x', COMMANDS)).toEqual([])
    expect(commandOptions('t', COMMANDS.filter((c) => c.name !== 'task')).map((c) => c.name)).toEqual(['topic'])
  })
})

describe('shrugBody', () => {
  it('drops /shrug, keeps marks and mentions, and ends with the shrug', () => {
    const body = p({ type: 'text', text: '/shrug ' }, { type: 'text', text: 'ok', marks: ['b'] }, { type: 'text', text: ' ' }, { type: 'user', id: 'u-2', name: 'Nour El-Sayed' })
    const out = shrugBody(body)
    expect(bodyText(out)).toBe('ok @Nour El-Sayed ¯\\_(ツ)_/¯')
    expect(out[0]).toMatchObject({ type: 'p', children: [{ type: 'text', text: 'ok', marks: ['b'] }, { type: 'text', text: ' ' }, { type: 'user', id: 'u-2' }, { type: 'text', text: ' ¯\\_(ツ)_/¯' }] })
  })

  it('on its own it is just the shrug', () => {
    expect(bodyText(shrugBody(parseBody('/shrug')))).toBe('¯\\_(ツ)_/¯')
  })
})
