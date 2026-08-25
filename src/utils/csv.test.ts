import { describe, it, expect } from 'vitest'

import { toCsv, exportName } from './csv'

const BOM = '\ufeff'

function body(csv: string): string[] {
  return csv.replace(BOM, '').trimEnd().split('\r\n')
}

describe('toCsv', () => {
  it('opens with a byte order mark and separates rows with CRLF', () => {
    const csv = toCsv(['a', 'b'], [['1', '2']])
    expect(csv.startsWith(BOM)).toBe(true)
    expect(csv).toContain('\r\n')
    expect(body(csv)).toEqual(['a,b', '1,2'])
  })

  it('quotes a field holding a comma, a quote or a newline', () => {
    const csv = toCsv(['x'], [['a,b'], ['say "hi"'], ['one\ntwo']])
    expect(body(csv)).toEqual(['x', '"a,b"', '"say ""hi"""', '"one\ntwo"'])
  })

  it('defuses a cell a spreadsheet would run as a formula', () => {
    const csv = toCsv(['x'], [['=1+1'], ['@SUM(A1)'], ['+cmd']])
    expect(body(csv)).toEqual(['x', "'=1+1", "'@SUM(A1)", "'+cmd"])
  })

  it('leaves a negative amount alone so the column still adds up', () => {
    const csv = toCsv(['amount'], [['-12.5'], ['-0.0000001'], [-3]])
    expect(body(csv)).toEqual(['amount', '-12.5', '-0.0000001', '-3'])
  })
})

describe('exportName', () => {
  it('names the account, the network and the day', () => {
    const at = new Date('2026-08-25T09:00:00Z')
    expect(exportName('activity', { account: 'GABCDEFXYZ', network: 'testnet', at })).toBe(
      'lobster-activity-GABCDE-testnet-2026-08-25',
    )
  })

  it('drops the account segment when there is no wallet', () => {
    const at = new Date('2026-08-25T09:00:00Z')
    expect(exportName('holdings', { account: null, network: 'mainnet', at })).toBe(
      'lobster-holdings-mainnet-2026-08-25',
    )
  })
})
