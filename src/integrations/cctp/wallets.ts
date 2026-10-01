import { useQuery } from '@tanstack/react-query'
import { formatUnits } from 'viem'
import { StellarWalletsKit } from '@creit-tech/stellar-wallets-kit'

import { networkPassphrase } from '../lobster/client'
import { CCTP_EVM_USDC_DECIMALS, cctpChainsFor, type Network } from '../../config/contracts'

// wagmi's raw "Connector not found." reads like a bug in the page rather than a
// missing wallet extension
export function readableConnectError(message: string): string {
  if (/connector not found|no injected|provider not found|window\.ethereum/i.test(message)) {
    return 'No browser wallet answered. Install MetaMask or Rabby, then try again.'
  }
  if (/user rejected|user denied|rejected the request/i.test(message)) {
    return 'The wallet turned the connection down.'
  }
  return message.split('\n')[0].slice(0, 160)
}

// en-US like the rest of the app: the amount fields only take a dot, and "0,5"
// from a French browser next to them would read as another number format
export function fmtUsdc(units: bigint, decimals = CCTP_EVM_USDC_DECIMALS): string {
  const n = Number(formatUnits(units, decimals))
  return n.toLocaleString('en-US', { maximumFractionDigits: 6 })
}

export function fmtGas(wei: bigint): string {
  const n = Number(formatUnits(wei, 18))
  return n === 0 ? '0' : n.toLocaleString('en-US', { maximumSignificantDigits: 3 })
}

// the EVM wallet's own chain, said in terms of this page's network
export function evmChainNote(network: Network, chainId: number | undefined, chainName: string | undefined): string | null {
  if (!chainId) return null
  if (cctpChainsFor(network).some((c) => c.chainId === chainId)) return null
  const other: Network = network === 'mainnet' ? 'testnet' : 'mainnet'
  const name = chainName ?? `chain ${chainId}`
  return cctpChainsFor(other).some((c) => c.chainId === chainId)
    ? `${name} is a ${other} chain and this page is on ${network}. Your wallet will be asked to switch when it signs.`
    : `${name} is not a chain this bridge uses. Your wallet will be asked to switch when it signs.`
}

// what network the Stellar wallet says it is on; a wallet that cannot tell is left alone
export function useStellarWalletNetwork(address: string | null) {
  return useQuery({
    queryKey: ['stellar-wallet-network', address],
    queryFn: async () => (await StellarWalletsKit.getNetwork()).networkPassphrase as string,
    enabled: !!address,
    retry: false,
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
}

export function stellarNetworkMismatch(network: Network, walletPassphrase: string | undefined): string | null {
  if (!walletPassphrase || walletPassphrase === networkPassphrase(network)) return null
  const page = network === 'mainnet' ? 'Mainnet' : 'Testnet'
  const other = network === 'mainnet' ? 'Testnet' : 'Mainnet'
  return `Your Stellar wallet is on ${other} and this page is on ${page}. Switch the wallet's network before signing.`
}
