import { describe, expect, it } from 'vitest'
import { keyFromName, validateProject, type ProjectFormValues } from './projectForm'

const values = (over: Partial<ProjectFormValues> = {}): ProjectFormValues => ({
  name: 'Sela kiosk', key: 'SK', clientName: 'Sela', description: '', links: [], managerId: 'u-4', memberIds: [], teamIds: [],
  methodology: 'waterfall', startDate: '2026-11-01', dueDate: '2026-12-31', ...over,
})

describe('keyFromName', () => {
  it('takes the first letters of each word, 2 to 5 capitals', () => {
    expect(keyFromName('Sela booking')).toBe('SB')
    expect(keyFromName('Nexus Core Platform')).toBe('NCP')
    expect(keyFromName('Mobile')).toBe('MOB') // one word: its first 3 letters
    expect(keyFromName('a b c d e f g')).toBe('ABCDE')
    expect(keyFromName('El-Moasser 2.0 portal')).toBe('EMP')
    expect(keyFromName('')).toBe('')
  })
})

describe('validateProject', () => {
  it('passes good values', () => {
    expect(validateProject(values(), ['NEX'])).toEqual({})
  })

  it('names every problem with the spec sentences', () => {
    expect(validateProject(values({ name: ' ', key: 'NEX', managerId: '', startDate: '2026-12-31', dueDate: '2026-11-01' }), ['NEX'])).toEqual({
      name: 'Give the project a name.',
      key: 'Key NEX is already used.',
      managerId: 'Pick a project manager.',
      dueDate: 'The due date is before the start date.',
    })
    expect(validateProject(values({ key: 'a1' }), []).key).toBe('The key is 2 to 5 capital letters, such as NEX.')
  })

  it('accepts only https links with a label', () => {
    expect(validateProject(values({ links: [{ label: 'Staging', url: 'https://staging.example.com' }] }), []).links).toBeUndefined()
    expect(validateProject(values({ links: [{ label: 'Bad', url: 'javascript:alert(1)' }] }), []).links).toBe('Links must start with https://.')
    expect(validateProject(values({ links: [{ label: '', url: 'https://x.example.com' }] }), []).links).toBe('Give every link a label.')
  })
})
