import { CONTRACTS } from '../../config/contracts'

// testnet only: mainnet has no faucet.
export async function friendbotFund(address: string): Promise<void> {
  const faucet = CONTRACTS.testnet.friendbot
  const res = await fetch(`${faucet}/?addr=${encodeURIComponent(address)}`)
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`friendbot ${res.status}: ${detail.slice(0, 200)}`)
  }
}
