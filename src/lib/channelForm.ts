export const CHANNEL_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/
export const MAX_TOPIC = 250

/** A channel's name, topic and the people in it besides you. */
export type ChannelValues = { name: string; topic: string; isPrivate: boolean; memberIds: string[] }

/** What's wrong with a channel form, field by field; the mock refuses with the same sentences. */
export function channelFormErrors(values: ChannelValues, takenNames: string[]): Partial<Record<'name' | 'topic' | 'members', string>> {
  const errors: Partial<Record<'name' | 'topic' | 'members', string>> = {}
  const name = values.name.trim()
  if (!name) errors.name = 'Give the channel a name.'
  else if (!CHANNEL_NAME.test(name)) errors.name = 'Use lowercase letters, numbers and hyphens.'
  else if (takenNames.includes(name)) errors.name = 'That name is taken.'
  if (values.topic.trim().length > MAX_TOPIC) errors.topic = `Keep the topic under ${MAX_TOPIC} characters.`
  if (values.isPrivate && values.memberIds.length === 0) errors.members = 'Add at least one person.'
  return errors
}
