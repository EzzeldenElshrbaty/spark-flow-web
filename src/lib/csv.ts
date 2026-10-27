/**
 * A CSV file's text: fields with a comma, a quote or a line break are quoted (quotes doubled), lines end in CRLF, and
 * a BOM goes first so Excel reads it as UTF-8 (names in Arabic stay readable). Text that looks like a formula is
 * kept as text (CSV injection).
 */
export function toCsv(rows: (string | number)[][]): string {
  const field = (value: string | number) => {
    // A text cell starting with = + - @ (or a tab/CR) would run as a formula in a spreadsheet: a quote keeps it text.
    const text = typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? `'${value}` : String(value)
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  return `﻿${rows.map((row) => row.map(field).join(',')).join('\r\n')}`
}

/** Saves `csv` as a file named `name`, through a short-lived object URL. */
export function downloadCsv(name: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
