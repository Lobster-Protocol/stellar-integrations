import { NotFoundError } from '@stellar/stellar-sdk'

import type { Network } from '../../config/contracts'
import { protocolLabel, tokenLabel } from '../stellar/token-registry'
import { stellarExplorer } from '../../utils/format'
import { toCsv } from '../../utils/csv'
import { getHorizonServer } from './client'
import { KIND_LABEL, toActivityEvent, type ActivityEvent } from './activity'

// Horizon's own ceiling per page. Walking 100 of them reads 20 000 operations,
// well past any account somebody exports from a browser, and stopping there
// beats spinning forever on a cursor that never runs out.
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

// The feed pages lazily because nobody scrolls 2 000 rows, but an export that
// only held what happened to be on screen would be worse than no export. With a
// start date the walk stops as soon as it has read past it: Horizon serves
// newest first, so anything beyond that page predates the window.
export async function fetchAllActivity(
  network: Network,
  account: string,
  window: HistoryWindow = {},
): Promise<FullHistory> {
  const { since = null, until = null, onProgress } = window
  const server = getHorizonServer(network)
  const events: ActivityEvent[] = []
  let cursor = ''

  const inside = (e: ActivityEvent) => {
    const at = Date.parse(e.at)
    return (since == null || at >= since) && (until == null || at <= until)
  }
  const done = (complete: boolean): FullHistory => ({ events: events.filter(inside), complete })

  for (let page = 0; page < MAX_PAGES; page++) {
    let call = server.operations().forAccount(account).order('desc').limit(PAGE)
    if (cursor) call = call.cursor(cursor)

    let records
    try {
      records = (await call.call()).records
    } catch (err) {
      // an account Horizon has never seen has no history, which is not a failure
      if (err instanceof NotFoundError) return done(true)
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

function pathLabel(e: ActivityEvent, network: Network): string {
  if (!e.swapPath) return ''
  const [from, to] = e.swapPath
  return `${tokenLabel(from, network) ?? from} to ${tokenLabel(to, network) ?? to}`
}

// One row per asset that moved, so a spreadsheet can sum the Amount column
// straight away. Operations that moved nothing still get a row: leaving them out
// would make the file disagree with the operation count on screen. Amounts are
// signed, and Direction repeats the sign in words for anyone reading by eye.
export function activityRows(
  events: ActivityEvent[],
  network: Network,
): Array<Array<string | number>> {
  const rows: Array<Array<string | number>> = []

  for (const e of events) {
    const venue = e.contractId ? (protocolLabel(e.contractId, network) ?? '') : ''
    const head = [
      e.at,
      e.at.slice(0, 10),
      KIND_LABEL[e.kind],
      pathLabel(e, network),
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

// The JSON side is for anyone who wants to re-run their own numbers: same
// events, nothing flattened, plus enough header to know what they are looking at.
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
