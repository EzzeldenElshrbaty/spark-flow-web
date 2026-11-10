// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useFormCheck } from './useFormCheck'

afterEach(cleanup)

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

describe('the caret goes to the first error (UX Phase 5A, 5.9)', () => {
  function Form({ name, roles }: { name: string; roles: string[] }) {
    const { errors, attempt, formRef } = useFormCheck({ name: name ? undefined : 'Give their name.', roles: roles.length ? undefined : 'Give them a role.' })
    return (
      <form ref={formRef}>
        <input aria-label="Name" aria-invalid={Boolean(errors.name)} defaultValue={name} />
        <fieldset data-invalid={errors.roles ? '' : undefined}>
          <legend>Roles</legend>
          <input type="checkbox" aria-label="Admin" />
        </fieldset>
        <button type="button" onClick={() => attempt()}>
          Save
        </button>
      </form>
    )
  }

  it('a failed Save focuses the first field marked invalid', () => {
    render(<Form name="" roles={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Name' }))
  })

  it('with only a group wrong, its first control', () => {
    render(<Form name="Laila" roles={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: 'Admin' }))
  })
})
