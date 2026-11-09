import { describe, expect, it } from 'vitest'
import { inviteHelp, isEmail, MAX_INVITES, normalEmail } from '@/lib/invites'

describe('emails for invites (spec 6.10)', () => {
  it('trims and lowercases, and knows an email when it sees one', () => {
    expect(normalEmail('  Sam@Client.COM ')).toBe('sam@client.com')
    for (const ok of ['sam@client.com', 'lina.m+flow@partner.co.uk']) expect(isEmail(ok), ok).toBe(true)
    for (const bad of ['sam@client', 'sam', '@client.com', 'sam @client.com', 'sam@client..com', '']) expect(isEmail(bad), bad).toBe(false)
    expect(MAX_INVITES).toBe(20)
  })

  it('says what happens to the emails picked, one or several', () => {
    expect(inviteHelp(['sam@client.com'], 'backend')).toBe("sam@client.com isn’t in Spark Systems yet. They’ll get an email invite as a guest who can see #backend only.")
    expect(inviteHelp(['sam@client.com', 'lina@partner.io'], 'backend')).toBe("2 people aren’t in Spark Systems yet. They’ll get email invites as guests who can see #backend only.")
    expect(inviteHelp([], 'backend')).toBeUndefined()
  })
})

describe('emails, after the slice 5 review', () => {
  it('refuses punctuation a paste brings along, and characters no address has', () => {
    for (const bad of ['sam@client.com;', 'sam@client.com,', '<sam@client.com>', 'sam@client.com"', 'sam,lina@client.com']) expect(isEmail(bad), bad).toBe(false)
    for (const ok of ['o_hassan@spark-sys.com', 'lina.m+flow@partner.co.uk', "o'neil@client.ie"]) expect(isEmail(ok), ok).toBe(true)
  })
})
