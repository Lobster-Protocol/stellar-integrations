import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { useWallet } from '../contexts/WalletContext'
import { useNetwork } from '../contexts/NetworkContext'
import { useAccountExists } from '../integrations/horizon/account'
import { friendbotFund } from '../integrations/stellar/friendbot'
import { Card } from './ui'

type Fund = 'idle' | 'pending' | 'done' | { error: string }

// A wallet is not on the ledger until it is funded, so most panels have nothing
// real to read for it. Say that once, above every page, rather than let each
// empty state blame the price or an empty history for a missing account. On
// testnet the faucet button gets a fresh wallet moving without leaving the app.
export default function AccountMissingNotice() {
  const { address } = useWallet()
  const { network } = useNetwork()
  const qc = useQueryClient()
  const [fund, setFund] = useState<Fund>('idle')

  if (useAccountExists(network, address) !== 'missing') return null

  async function fundIt() {
    if (!address) return
    setFund('pending')
    try {
      await friendbotFund(address)
      setFund('done')
      qc.invalidateQueries({ queryKey: ['horizon', 'balances', network, address] })
    } catch (err) {
      setFund({ error: err instanceof Error ? err.message : 'friendbot did not respond' })
    }
  }

  return (
    <Card className="border border-amber-500/30 mb-4">
      <h3 className="text-sm font-semibold text-text">This wallet isn&apos;t on the ledger yet</h3>
      <p className="text-xs text-text-secondary mt-1 max-w-2xl">
        A Stellar account only exists once it has received some XLM. Until then there is nothing to
        read for it, which is why the panels below are empty. Fund this address on {network} to get
        started.
      </p>
      {network === 'testnet' && (
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <button
            onClick={fundIt}
            disabled={fund === 'pending' || fund === 'done'}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-primary text-white disabled:opacity-50"
          >
            {fund === 'pending' ? 'Funding...' : fund === 'done' ? 'Funded' : 'Fund with test XLM'}
          </button>
          {fund === 'done' && (
            <span className="text-xs text-green">Done. The panels will fill in a moment.</span>
          )}
          {typeof fund === 'object' && (
            <span className="text-xs text-coral break-words">{fund.error}</span>
          )}
        </div>
      )}
    </Card>
  )
}
