// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Field, inputClass } from './Field'

afterEach(cleanup)

describe('Field for screen readers (UX Phase 5A, 5.9)', () => {
  it('names the control by its label alone, says it’s required, and reads its error as a description', () => {
    render(
      <Field label="Title" required error="Give the task a title.">
        <input />
      </Field>,
    )
    const input = screen.getByRole('textbox', { name: 'Title', description: 'Give the task a title.' })
    expect(input.getAttribute('aria-required')).toBe('true')
  })

  it('a hint is the description when there’s no error, and keeps what the control was already described by', () => {
    render(
      <>
        <p id="extra">Shown on the profile.</p>
        <Field label="Title" hint="Optional">
          <input aria-describedby="extra" />
        </Field>
      </>,
    )
    expect(screen.getByRole('textbox', { name: 'Title', description: 'Shown on the profile. Optional' })).toBeTruthy()
  })

  it('a click on the label text puts the caret in the field', () => {
    render(
      <Field label="Client">
        <input />
      </Field>,
    )
    fireEvent.click(screen.getByText('Client'))
    // jsdom doesn't move focus for a label click; the label wraps the field, so a browser does.
    expect(screen.getByText('Client').closest('label')?.contains(screen.getByRole('textbox'))).toBe(true)
  })
})

describe('field borders (UX Phase 5B, 5.8)', () => {
  it('fields use the 3:1 input border, not the light divider line', () => {
    expect(inputClass).toContain('border-line-input')
    expect(inputClass).not.toMatch(/border-line(?![-\w])/)
  })
})

