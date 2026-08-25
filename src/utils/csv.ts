// Fields a spreadsheet treats as a formula rather than as text. A cell that
// opens with one of these runs when the file is opened, so anything that isn't
// a plain number gets quoted out of harm's way.
const FORMULA_START = /^[=+\-@\t\r]/

function cell(value: string | number): string {
  let s = typeof value === 'number' ? String(value) : value
  if (FORMULA_START.test(s) && !Number.isFinite(Number(s))) s = `'${s}`
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`
  return s
}

// RFC 4180 line endings, and a byte order mark so Excel reads the file as UTF-8
// instead of falling back to the machine's local codepage.
export function toCsv(columns: string[], rows: Array<Array<string | number>>): string {
  const lines = [columns.map(cell).join(',')]
  for (const row of rows) lines.push(row.map(cell).join(','))
  return '\ufeff' + lines.join('\r\n') + '\r\n'
}

// Filenames carry the account and the network they came from: two exports of the
// same page are only comparable if you can tell which wallet each one is.
export function exportName(
  base: string,
  parts: { account?: string | null; network: string; at?: Date },
): string {
  const day = (parts.at ?? new Date()).toISOString().slice(0, 10)
  const who = parts.account ? `-${parts.account.slice(0, 6)}` : ''
  return `lobster-${base}${who}-${parts.network}-${day}`
}
