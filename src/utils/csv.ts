// a spreadsheet runs a cell starting with one of these as a formula; anything
// but a plain number gets a leading quote
const FORMULA_START = /^[=+\-@\t\r]/

function cell(value: string | number): string {
  let s = typeof value === 'number' ? String(value) : value
  if (FORMULA_START.test(s) && !Number.isFinite(Number(s))) s = `'${s}`
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`
  return s
}

// CRLF per RFC 4180. Without the BOM Excel falls back to the local codepage.
export function toCsv(columns: string[], rows: Array<Array<string | number>>): string {
  const lines = [columns.map(cell).join(',')]
  for (const row of rows) lines.push(row.map(cell).join(','))
  return '\ufeff' + lines.join('\r\n') + '\r\n'
}

// account and network go in the name, or two exports of the same page can't be told apart
export function exportName(
  base: string,
  parts: { account?: string | null; network: string; at?: Date },
): string {
  const day = (parts.at ?? new Date()).toISOString().slice(0, 10)
  const who = parts.account ? `-${parts.account.slice(0, 6)}` : ''
  return `lobster-${base}${who}-${parts.network}-${day}`
}
