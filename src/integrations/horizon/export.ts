import { NotFoundError } from '@stellar/stellar-sdk'

import type { Network } from '../../config/contracts'
import { protocolLabel, tokenLabel } from '../stellar/token-registry'
import { stellarExplorer } from '../../utils/format'
import { toCsv } from '../../utils/csv'
import { getHorizonServer } from './client'
import { KIND_LABEL, toActivityEvent, type ActivityEvent } from './activity'

// 200 is Horizon's per-page ceiling; 100 pages is 20 000 operations, past any
// account exported from a browser, and a cap beats a cursor that never runs out
const PAGE = 200
const MAX_PAGES = 100

export interface FullHistory {
  events: ActivityEvent[]
  // false when the page budget ran out before the window was fully read
  complete: boolean
}

export interface HistoryWindow {
  // unix millis, inclusive; null means unbounded on that side
  since?: number | null
  until?: number | null
  onProgress?: (count: number) => void
}

// an export reads its whole window, not just what the feed has loaded. Horizon
// serves newest first, so the walk stops once a page reaches past the start date
export async function fetchAllActivity(
  network: Network,
  account: string,
  window: HistoryWindow = {},
): Promise<FullHistory> {
  const { since = null, until = null, onProgress } = window
  const server = getHorizonServer(network)
  const events: ActivityEvent[] = []
  let cursor = ''

  const done = (complete: boolean): FullHistory => ({
    events: events.filter((e) => {
      const at = Date.parse(e.at)
      return (since == null || at >= since) && (until == null || at <= until)
    }),
    complete,
  })

  for (let page = 0; page < MAX_PAGES; page++) {
    let call = server.operations().forAccount(account).order('desc').limit(PAGE)
    if (cursor) call = call.cursor(cursor)

    let records
    try {
      records = (await call.call()).records
    } catch (err) {
      // an account Horizon has never seen is not on-chain, so there is no history
      // to read: mark the export incomplete rather than asserting a confirmed zero.
      if (err instanceof NotFoundError) return done(false)
      throw err
    }

    for (const r of records) events.push(toActivityEvent(r, account))
    onProgress?.(events.length)

    if (records.length < PAGE) return done(true)

    const oldest = events[events.length - 1]
    if (since != null && Date.parse(oldest.at) < since) return done(true)

    cursor = records[records.length - 1].paging_token
  }

  return done(false)
}

export const ACTIVITY_COLUMNS = [
  'Timestamp (UTC)',
  'Date (UTC)',
  'Type',
  'Detail',
  'Asset',
  'Amount',
  'Direction',
  'Counterparty',
  'Venue',
  'Contract',
  'Function',
  'Status',
  'Operation',
  'Transaction',
  'Explorer',
]

// one row per asset moved, with a signed amount so the Amount column sums
// straight away; an operation that moved nothing still gets a row to match the
// count on screen
export function activityRows(
  events: ActivityEvent[],
  network: Network,
): Array<Array<string | number>> {
  const rows: Array<Array<string | number>> = []

  for (const e of events) {
    const venue = e.contractId ? (protocolLabel(e.contractId, network) ?? '') : ''
    let path = ''
    if (e.swapPath) {
      const [from, to] = e.swapPath
      path = `${tokenLabel(from, network) ?? from} to ${tokenLabel(to, network) ?? to}`
    }
    const head = [
      e.at,
      e.at.slice(0, 10),
      KIND_LABEL[e.kind],
      path,
    ]
    const tail = [
      venue,
      e.contractId ?? '',
      e.fn ?? '',
      e.ok ? 'success' : 'failed',
      e.id,
      e.txHash,
      stellarExplorer(network, 'tx', e.txHash),
    ]

    if (e.moves.length === 0) {
      rows.push([...head, '', '', '', '', ...tail])
      continue
    }
    for (const m of e.moves) {
      const signed = m.direction === 'out' ? `-${m.amount}` : m.amount
      rows.push([...head, m.code, signed, m.direction === 'out' ? 'sent' : 'received', m.counterparty ?? '', ...tail])
    }
  }

  return rows
}

export function activityCsv(events: ActivityEvent[], network: Network): string {
  return toCsv(ACTIVITY_COLUMNS, activityRows(events, network))
}

// unflattened, with enough header for anyone re-running their own numbers
export function activityJson(
  history: FullHistory,
  network: Network,
  account: string,
  at = new Date(),
): string {
  return JSON.stringify(
    {
      account,
      network,
      generatedAt: at.toISOString(),
      source: 'horizon operations, decoded client side',
      operations: history.events.length,
      complete: history.complete,
      events: history.events,
    },
    null,
    2,
  )
}
