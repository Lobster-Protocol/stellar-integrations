import { useState } from 'react'

import { useDfnsWallets, useCreateDfnsWallet } from '../integrations/dfns/hooks'
import { useNetwork } from '../contexts/NetworkContext'
import { shortenAddress, stellarExplorer } from '../utils/format'
import { isAccountId } from '../integrations/stellar/strkey-guards'
import { friendbotFund } from '../integrations/stellar/friendbot'
import type { Network } from '../config/contracts'
import { Card, CardHead, Empty } from './ui'

type FundState = 'pending' | 'done' | { error: string }

// DFNS names the chains itself; a wallet's own chain decides which explorer it
// links to, not whichever network the dashboard toggle happens to be on.
const DFNS_NETWORKS = ['Stellar', 'StellarTestnet'] as const
type DfnsNetwork = (typeof DFNS_NETWORKS)[number]

const GROUP_TITLE: Record<DfnsNetwork, string> = {
  Stellar: 'Mainnet',
  StellarTestnet: 'Testnet',
}

function explorerNetwork(dfnsNetwork: string): Network {
  return dfnsNetwork === 'Stellar' ? 'mainnet' : 'testnet'
}

export default function DfnsWalletList() {
  const wallets = useDfnsWallets()
  const create = useCreateDfnsWallet()
  const { network } = useNetwork()
  const [name, setName] = useState('')
  const [funding, setFunding] = useState<Record<string, FundState>>({})

  if (!import.meta.env.VITE_LOBSTER_API_URL) {
    return null
  }

  const dfnsNetwork: DfnsNetwork = network === 'mainnet' ? 'Stellar' : 'StellarTestnet'
  const items = wallets.data?.items ?? []

  async function handleCreate() {
    const proposed = name.trim() || `lobster-${dfnsNetwork.toLowerCase()}-${Date.now()}`
    await create.mutateAsync({ name: proposed, network: dfnsNetwork })
    setName('')
  }

  async function handleFund(address: string) {
    setFunding((m) => ({ ...m, [address]: 'pending' }))
    try {
      await friendbotFund(address)
      setFunding((m) => ({ ...m, [address]: 'done' }))
    } catch (err) {
      setFunding((m) => ({ ...m, [address]: { error: (err as Error).message } }))
    }
  }

  const groups = DFNS_NETWORKS.map((n) => ({
    network: n,
    list: items.filter((w) => w.network === n),
  })).filter((g) => g.list.length > 0)

  // anything DFNS reports on a chain we don't group above still has to show
  const other = items.filter((w) => !DFNS_NETWORKS.includes(w.network as DfnsNetwork))
  if (other.length > 0) groups.push({ network: 'StellarTestnet', list: other })

  return (
    <Card>
      <CardHead
        title="DFNS wallets"
        note="Keys held by the DFNS MPC nodes, grouped by the chain each wallet lives on. Testnet wallets can be funded from friendbot."
        meta={<span className="text-xs text-text-muted">{items.length} total</span>}
      />

      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`name (${dfnsNetwork})`}
          className="flex-1 bg-bg rounded-lg px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={handleCreate}
          disabled={create.isPending}
          className="px-4 py-2 rounded-full bg-primary text-white text-sm font-semibold disabled:opacity-40"
        >
          {create.isPending ? 'Creating...' : 'New wallet'}
        </button>
      </div>

      {create.isError && <p className="text-xs text-coral mb-2">{(create.error as Error).message}</p>}

      {wallets.isLoading ? (
        <p className="text-xs text-text-muted">Loading...</p>
      ) : wallets.isError ? (
        <p className="text-xs text-coral">{(wallets.error as Error).message}</p>
      ) : items.length === 0 ? (
        <Empty>No wallets yet.</Empty>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.network}>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-[10px] uppercase tracking-wider text-text-muted">
                  {GROUP_TITLE[g.network]}
                </span>
                <span className="text-[10px] text-text-muted">{g.list.length}</span>
              </div>
              <ul className="divide-y divide-border">
                {g.list.map((w) => {
                  const valid = isAccountId(w.address)
                  const fundState = funding[w.address]
                  return (
                    <li key={w.id} className="py-2 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-text truncate flex-1" title={w.name || 'unnamed'}>
                          {w.name || 'unnamed'}
                        </span>
                        {valid ? (
                          <a
                            href={stellarExplorer(explorerNetwork(w.network), 'account', w.address)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={w.address}
                            className="font-mono text-primary hover:underline shrink-0"
                          >
                            {shortenAddress(w.address)}
                          </a>
                        ) : (
                          <span className="text-coral shrink-0">invalid address</span>
                        )}
                        <span className="w-20 text-right shrink-0">
                          {valid && w.network === 'StellarTestnet' ? (
                            <button
                              type="button"
                              onClick={() => handleFund(w.address)}
                              disabled={fundState === 'pending' || fundState === 'done'}
                              className="px-2 py-1 rounded-full bg-bg text-text-secondary hover:bg-bg-card disabled:opacity-40"
                            >
                              {fundState === 'pending'
                                ? 'funding...'
                                : fundState === 'done'
                                  ? 'funded'
                                  : 'friendbot'}
                            </button>
                          ) : null}
                        </span>
                      </div>
                      {typeof fundState === 'object' && (
                        <div className="text-coral mt-1">{fundState.error}</div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
