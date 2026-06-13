import { useState } from 'react'

import { useDfnsWallets, useCreateDfnsWallet } from '../integrations/dfns/hooks'
import { useNetwork } from '../contexts/NetworkContext'
import { CONTRACTS } from '../config/contracts'
import { shortenAddress, stellarExplorer } from '../utils/format'
import { isAccountId } from '../integrations/stellar/strkey-guards'

async function friendbotFund(address: string): Promise<void> {
  const faucet = CONTRACTS.testnet.friendbot
  const res = await fetch(`${faucet}/?addr=${encodeURIComponent(address)}`)
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`friendbot ${res.status}: ${detail.slice(0, 200)}`)
  }
}

export default function DfnsWalletList() {
  const wallets = useDfnsWallets()
  const create = useCreateDfnsWallet()
  const { network } = useNetwork()
  const [name, setName] = useState('')
  const [funding, setFunding] = useState<Record<string, 'pending' | 'done' | string>>({})

  if (!import.meta.env.VITE_LOBSTER_API_URL) {
    return null
  }

  const dfnsNetwork = network === 'mainnet' ? 'Stellar' : 'StellarTestnet'

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
      setFunding((m) => ({ ...m, [address]: (err as Error).message }))
    }
  }

  return (
    <div className="rounded-3xl p-5 bg-bg-card card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text">DFNS wallets</h3>
        <span className="text-xs text-text-muted">{wallets.data?.items.length ?? 0}</span>
      </div>

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

      {create.isError && (
        <p className="text-xs text-coral mb-2">{(create.error as Error).message}</p>
      )}

      {wallets.isLoading ? (
        <p className="text-xs text-text-muted">Loading...</p>
      ) : wallets.isError ? (
        <p className="text-xs text-coral">{(wallets.error as Error).message}</p>
      ) : (wallets.data?.items.length ?? 0) === 0 ? (
        <p className="text-xs text-text-muted">No wallets yet.</p>
      ) : (
        <ul className="divide-y divide-text-muted/10">
          {(wallets.data?.items ?? []).map((w) => {
            const validAddress = isAccountId(w.address)
            const fundState = funding[w.address]
            return (
              <li key={w.id} className="py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-text truncate">{w.name || 'unnamed'}</span>
                  {validAddress ? (
                    <a
                      href={stellarExplorer(network, 'account', w.address)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-primary hover:underline"
                    >
                      {shortenAddress(w.address)}
                    </a>
                  ) : (
                    <span className="text-coral">invalid address</span>
                  )}
                  <span className="text-text-muted">{w.network}</span>
                  {validAddress && w.network === 'StellarTestnet' && (
                    <button
                      type="button"
                      onClick={() => handleFund(w.address)}
                      disabled={fundState === 'pending' || fundState === 'done'}
                      className="px-2 py-1 rounded-full bg-bg text-text-secondary hover:bg-bg-card disabled:opacity-40"
                    >
                      {fundState === 'pending' ? 'funding...' : fundState === 'done' ? 'funded' : 'friendbot'}
                    </button>
                  )}
                </div>
                {fundState && fundState !== 'pending' && fundState !== 'done' && (
                  <div className="text-coral mt-1">{fundState}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
