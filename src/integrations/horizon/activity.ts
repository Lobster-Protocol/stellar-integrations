import { useInfiniteQuery } from '@tanstack/react-query'
import { Address, Horizon, NotFoundError, scValToNative, xdr } from '@stellar/stellar-sdk'

import type { Network } from '../../config/contracts'
import { getHorizonServer } from './client'
import { useAccountBalances } from './account'

type OpRecord = Horizon.ServerApi.OperationRecord
type BalanceChange = Horizon.HorizonApi.BalanceChange

export type ActivityKind =
  | 'swap'
  | 'liquidity-add'
  | 'liquidity-remove'
  | 'position-open'
  | 'sent'
  | 'received'
  | 'mint'
  | 'burn'
  | 'trustline'
  | 'account-funded'
  | 'storage-rent'
  | 'contract-read'
  | 'contract-deploy'
  | 'contract-call'

export interface AssetMove {
  code: string
  issuer?: string
  amount: string
  direction: 'in' | 'out'
  // the account or contract on the other side, when the ledger names one
  counterparty?: string
}

export interface ActivityEvent {
  id: string
  kind: ActivityKind
  at: string
  txHash: string
  ok: boolean
  moves: AssetMove[]
  contractId?: string
  // raw soroban function name, shown in the expanded row
  fn?: string
  // token pair a swap routed through, decoded from the router's path argument
  swapPath?: [string, string]
}

// What a reader sees instead of "invoke host function". Kept short on purpose:
// the amounts underneath carry the detail.
export const KIND_LABEL: Record<ActivityKind, string> = {
  swap: 'Swap',
  'liquidity-add': 'Added liquidity',
  'liquidity-remove': 'Withdrew liquidity',
  'position-open': 'Opened a position',
  sent: 'Sent',
  received: 'Received',
  mint: 'Minted',
  burn: 'Burned',
  trustline: 'Trustline',
  'account-funded': 'Account funded',
  'storage-rent': 'Storage rent',
  'contract-read': 'Contract read',
  'contract-deploy': 'Contract deployed',
  'contract-call': 'Contract call',
}

// Groups the filter bar offers. Reads and rent are the noise a wallet
// accumulates, so they get one bucket rather than one each.
export const KIND_GROUPS = {
  moves: ['sent', 'received', 'mint', 'burn'],
  trading: ['swap'],
  liquidity: ['liquidity-add', 'liquidity-remove', 'position-open'],
  housekeeping: ['trustline', 'account-funded', 'storage-rent', 'contract-read', 'contract-deploy', 'contract-call'],
} as const satisfies Record<string, readonly ActivityKind[]>

export type KindGroup = keyof typeof KIND_GROUPS

export function groupOf(kind: ActivityKind): KindGroup {
  for (const [group, kinds] of Object.entries(KIND_GROUPS)) {
    if ((kinds as readonly ActivityKind[]).includes(kind)) return group as KindGroup
  }
  return 'housekeeping'
}

// Free text search over a row: the label a reader sees, the amounts, the token
// codes, whoever was on the other side, and the identifiers they'd paste from an
// explorer. Anything visible in the feed should find its own row.
export function matchesQuery(e: ActivityEvent, raw: string): boolean {
  const q = raw.trim().toLowerCase()
  if (!q) return true
  const hay = [
    KIND_LABEL[e.kind],
    e.fn ?? '',
    e.txHash,
    e.contractId ?? '',
    ...(e.swapPath ?? []),
    ...e.moves.flatMap((m) => [m.code, m.amount, m.counterparty ?? '']),
  ]
  return hay.some((h) => h.toLowerCase().includes(q))
}

// A soroban call carries its target contract in the first parameter and the
// method name in the first Sym. Everything else is call arguments, which we only
// read for a swap. Horizon hands these back as base64 ScVals.
function decodeCall(params: { value: string; type: string }[]) {
  let contractId: string | undefined
  let fn: string | undefined
  const addressVecs: string[][] = []

  for (const p of params) {
    try {
      const v = xdr.ScVal.fromXDR(p.value, 'base64')
      if (p.type === 'Sym' && !fn) {
        fn = v.sym().toString()
      } else if (p.type === 'Address' && !contractId) {
        const a = Address.fromScVal(v).toString()
        if (a.startsWith('C')) contractId = a
      } else if (p.type === 'Vec') {
        const items = scValToNative(v)
        if (Array.isArray(items) && items.every((i) => typeof i === 'string')) {
          addressVecs.push(items as string[])
        }
      }
    } catch {
      // a parameter we cannot parse tells us nothing; the rest still classify
    }
  }

  const path = addressVecs.find((v) => v.length >= 2)
  return {
    contractId,
    fn,
    swapPath: path ? ([path[0], path[path.length - 1]] as [string, string]) : undefined,
  }
}

function kindOfSorobanFn(fn: string | undefined): ActivityKind {
  if (!fn) return 'contract-deploy'
  if (fn.startsWith('swap_')) return 'swap'
  if (fn.startsWith('add_liquidity') || fn === 'deposit') return 'liquidity-add'
  if (fn.startsWith('withdraw')) return 'liquidity-remove'
  if (fn === 'create_pool' || fn.startsWith('deploy')) return 'position-open'
  if (fn === 'mint') return 'mint'
  if (fn === 'burn' || fn === 'burn_from') return 'burn'
  if (fn === 'transfer' || fn === 'transfer_from') return 'sent'
  if (fn.startsWith('get_') || fn === 'balance' || fn === 'symbol' || fn === 'decimals') {
    return 'contract-read'
  }
  return 'contract-call'
}

function moveFrom(c: BalanceChange, account: string): AssetMove | null {
  if (c.from !== account && c.to !== account) return null
  const out = c.from === account
  return {
    code: c.asset_type === 'native' ? 'XLM' : (c.asset_code ?? 'unknown'),
    issuer: c.asset_issuer,
    amount: c.amount,
    direction: out ? 'out' : 'in',
    counterparty: out ? c.to : c.from,
  }
}

// Horizon puts the protocol 22 name on the wire while the SDK union still
// carries the pre-rename one, so neither string alone catches every rent op.
const RENT_OPS = new Set(['extend_footprint_ttl', 'bump_footprint_expiration', 'restore_footprint'])

export function toActivityEvent(op: OpRecord, account: string): ActivityEvent {
  const base = {
    id: op.id,
    at: op.created_at,
    txHash: op.transaction_hash,
    ok: op.transaction_successful,
    moves: [] as AssetMove[],
  }

  if (RENT_OPS.has(op.type)) return { ...base, kind: 'storage-rent' }

  switch (op.type) {
    case 'invoke_host_function': {
      const { contractId, fn, swapPath } = decodeCall(op.parameters ?? [])
      const moves = (op.asset_balance_changes ?? [])
        .map((c) => moveFrom(c, account))
        .filter((m): m is AssetMove => m !== null)
      // a call that moved nothing and only read state is housekeeping, whatever
      // its name suggests
      const kind = kindOfSorobanFn(fn)
      return { ...base, kind, moves, contractId, fn, swapPath }
    }

    case 'payment': {
      const out = op.from === account
      return {
        ...base,
        kind: out ? 'sent' : 'received',
        moves: [
          {
            code: op.asset_type === 'native' ? 'XLM' : (op.asset_code ?? 'unknown'),
            issuer: op.asset_issuer,
            amount: op.amount,
            direction: out ? 'out' : 'in',
            counterparty: out ? op.to : op.from,
          },
        ],
      }
    }

    case 'create_account':
      return {
        ...base,
        kind: 'account-funded',
        moves: [
          { code: 'XLM', amount: op.starting_balance, direction: 'in', counterparty: op.funder },
        ],
      }

    case 'change_trust':
      return { ...base, kind: 'trustline' }

    default:
      return { ...base, kind: 'contract-call' }
  }
}

const PAGE = 30

export function useActivity(network: Network, account: string | null) {
  // a wallet with no funds is not on-chain yet, so it has no operations and
  // asking Horizon just 404s. wait until balances confirm the account exists.
  const balances = useAccountBalances(network, account)
  const exists = balances.isSuccess && balances.data.length > 0
  return useInfiniteQuery({
    queryKey: ['activity', network, account],
    initialPageParam: '',
    queryFn: async ({ pageParam }) => {
      const server = getHorizonServer(network)
      try {
        let call = server.operations().forAccount(account!).order('desc').limit(PAGE)
        if (pageParam) call = call.cursor(pageParam)
        const page = await call.call()
        return {
          events: page.records.map((r) => toActivityEvent(r, account!)),
          cursor: page.records.at(-1)?.paging_token ?? null,
        }
      } catch (err) {
        if (err instanceof NotFoundError) return { events: [], cursor: null }
        throw err
      }
    },
    getNextPageParam: (last) => (last.events.length === PAGE ? last.cursor : undefined),
    enabled: !!account && exists,
    staleTime: 30_000,
    retry: 1,
  })
}
