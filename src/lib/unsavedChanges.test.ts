// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { pickGuard, shouldBlock, useUnsavedChanges, useUnsavedGuards, type UnsavedGuard } from './unsavedChanges'

const guard = (id: string, scope: UnsavedGuard['scope']): UnsavedGuard => ({ id, scope, ask: () => {} })
const nav = (historyAction: 'POP' | 'PUSH' | 'REPLACE', from = '/w/a/projects', to = '/w/a/projects') => ({ historyAction, from, to })

afterEach(() => useUnsavedGuards.setState({ guards: [] }))

describe('shouldBlock (UX Phase 1, 1.2)', () => {
  it('blocks nothing without a guard', () => {
    expect(shouldBlock([], nav('POP'))).toBe(false)
    expect(shouldBlock([], nav('PUSH', '/a', '/b'))).toBe(false)
  })

  it('a sheet guard blocks only Back and Forward, so a form’s own Save can close it', () => {
    const guards = [guard('s', 'sheet')]
    expect(shouldBlock(guards, nav('POP'))).toBe(true)
    expect(shouldBlock(guards, nav('PUSH', '/a', '/b'))).toBe(false)
    expect(shouldBlock(guards, nav('REPLACE'))).toBe(false)
  })

  it('a page guard blocks leaving the page, not a change of query on it', () => {
    const guards = [guard('p', 'page')]
    expect(shouldBlock(guards, nav('PUSH', '/w/a/settings/roles', '/w/a/settings'))).toBe(true)
    expect(shouldBlock(guards, nav('POP', '/w/a/settings/roles', '/w/a/settings'))).toBe(true)
    expect(shouldBlock(guards, nav('PUSH', '/w/a/settings/roles', '/w/a/settings/roles'))).toBe(false)
  })

  it('Back asks the newest sheet; leaving the page asks the page, whatever sheet sits on top (review fix)', () => {
    const guards = [guard('p', 'page'), guard('s', 'sheet')]
    expect(pickGuard(guards, nav('POP', '/a', '/b'))?.id).toBe('s')
    // A sheet that saves and moves on (New message, New channel) mustn't take a changed page with it.
    expect(pickGuard(guards, nav('PUSH', '/a', '/b'))?.id).toBe('p')
    expect(shouldBlock(guards, nav('PUSH', '/a', '/b'))).toBe(true)
    // Its own Save closing it on the same page goes through.
    expect(shouldBlock(guards, nav('REPLACE', '/a', '/a'))).toBe(false)
    expect(pickGuard([guard('s', 'sheet')], nav('PUSH', '/a', '/b'))).toBeNull()
  })
})

describe('useUnsavedChanges', () => {
  it('adds a guard while dirty and takes it away when clean or unmounted', () => {
    const ask = () => {}
    const { rerender, unmount } = renderHook(({ dirty }) => useUnsavedChanges(dirty, 'sheet', ask), { initialProps: { dirty: false } })
    expect(useUnsavedGuards.getState().guards).toHaveLength(0)
    rerender({ dirty: true })
    expect(useUnsavedGuards.getState().guards.map((g) => g.scope)).toEqual(['sheet'])
    rerender({ dirty: false })
    expect(useUnsavedGuards.getState().guards).toHaveLength(0)
    rerender({ dirty: true })
    unmount()
    expect(useUnsavedGuards.getState().guards).toHaveLength(0)
  })

  it('calls the newest ask it was given', () => {
    const calls: string[] = []
    const { rerender } = renderHook(({ tag }) => useUnsavedChanges(true, 'page', () => calls.push(tag)), { initialProps: { tag: 'first' } })
    rerender({ tag: 'second' })
    useUnsavedGuards.getState().guards[0]!.ask(() => {}, () => {})
    expect(calls).toEqual(['second'])
  })
})
