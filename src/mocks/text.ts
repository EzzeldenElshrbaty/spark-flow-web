const TICKET_KEY = /\b[A-Z]{2,5}-\d+\b/g

/** Ticket keys such as NEX-104 in a piece of text: unique, in order of first appearance. */
export function parseTicketKeys(content: string): string[] {
  return [...new Set(content.match(TICKET_KEY) ?? [])]
}
