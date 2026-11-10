import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// UX Phase 6, 6.3: help says what the app does now.

const chapter = (name: string) => readFileSync(new URL(`./${name}.md`, import.meta.url), 'utf8')

describe('help chapters', () => {
  it('getting started puts My work under More on a phone', () => {
    const text = chapter('getting-started')
    expect(text).not.toContain('Home is in More')
    expect(text).toMatch(/More[^\n]*My work/)
  })

  it('getting started says what happens to unsaved changes', () => {
    const section = chapter('getting-started').split('## ').find((part) => part.startsWith('Unsaved changes')) ?? ''
    expect(section).toContain('Discard')
    expect(section).toContain('Esc')
  })

  it('archived records says Delete for good asks you to type the key', () => {
    const text = chapter('archived')
    expect(text).not.toContain('asks first')
    expect(text).toMatch(/type/i)
  })
})
