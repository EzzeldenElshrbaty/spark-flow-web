// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useFormCheck } from './useFormCheck'

type Errors = { title?: string; estimate?: string }
const rules = (title: string): Errors => (title.trim() ? {} : { title: 'Give the task a title.' })

describe('useFormCheck (UX Phase 4, 4.4)', () => {
  it('shows nothing before the first Save', () => {
    const { result } = renderHook(({ title }) => useFormCheck(rules(title)), { initialProps: { title: '' } })
    expect(result.current.errors).toEqual({})
  })

  it('attempt() shows the errors and says whether the form may save', () => {
    const { result, rerender } = renderHook(({ title }) => useFormCheck(rules(title)), { initialProps: { title: '' } })
    let ok = true
    act(() => {
      ok = result.current.attempt()
    })
    expect(ok).toBe(false)
    expect(result.current.errors).toEqual({ title: 'Give the task a title.' })
    rerender({ title: 'Login page' })
    act(() => {
      ok = result.current.attempt()
    })
    expect(ok).toBe(true)
  })

  it('after a Save, an error leaves as soon as its field is fixed and comes back if it breaks', () => {
    const { result, rerender } = renderHook(({ title }) => useFormCheck(rules(title)), { initialProps: { title: '' } })
    act(() => {
      result.current.attempt()
    })
    rerender({ title: 'L' })
    expect(result.current.errors).toEqual({})
    rerender({ title: ' ' })
    expect(result.current.errors).toEqual({ title: 'Give the task a title.' })
  })

  it('reset() hides them again until the next Save', () => {
    const { result } = renderHook(({ title }) => useFormCheck(rules(title)), { initialProps: { title: '' } })
    act(() => {
      result.current.attempt()
    })
    act(() => result.current.reset())
    expect(result.current.errors).toEqual({})
  })
})
