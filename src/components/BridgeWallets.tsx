import type { ReactNode } from 'react'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { ExternalLink } from 'lucide-react'

import { cn, formatBalance, shortenAddress, stellarExplorer } from '../utils/format'
import { useWallet } from '../contexts/WalletContext'
import { useCustody } from '../contexts/CustodyContext'
import { useAccountBalances, useAccountExists } from '../integrations/horizon/account'
import { useEvmHoldings } from '../integrations/cctp/hooks'
import { CONTRACTS, cctpChainsFor, type CctpSourceChain, type Network } from '../config/contracts'
import {
  evmChainNote,
  fmtGas,
  fmtUsdc,
  readableConnectError,
  stellarNetworkMismatch,
  useStellarWalletNetwork,
} from '../integrations/cctp/wallets'
import CopyButton from './CopyButton'
import { InfoTip } from './InfoTip'

export function EvmConnectButtons({ small }: { small?: boolean }) {
  const { connectors, connect, isPending, error } = useConnect()
  // a wallet that announces itself (EIP-6963) is listed under its own name, and the
  // generic entry would offer the same wallet again as "Injected"
  const options = connectors.length > 1 ? connectors.filter((c) => c.id !== 'injected') : connectors
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1 flex-wrap justify-end">
        {options.map((c) => (
          <button
            key={c.uid}
            onClick={() => connect({ connector: c })}
            disabled={isPending}
            className={cn(
              'rounded-md bg-primary text-white font-medium disabled:opacity-50',
              small ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs',
            )}
          >
            {c.id === 'injected' ? 'Browser wallet' : c.name}
          </button>
        ))}
      </div>
      {error && <p className="text-[10px] text-coral">{readableConnectError(error.message)}</p>}
    </div>
  )
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 items-baseline">
      <span className="text-text-secondary shrink-0">{label}</span>
      <span className="text-text text-right min-w-0">{children}</span>
    </div>
  )
}

function EvmWalletCard({ network, chains }: { network: Network; chains: CctpSourceChain[] }) {
  const evm = useAccount()
  const { disconnect } = useDisconnect()
  const holdings = useEvmHoldings(chains, evm.address)
  const note = evmChainNote(network, evm.chainId, evm.chain?.name)

  return (
    <div className="rounded-2xl bg-bg px-4 py-3 text-xs space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-medium text-text">
          <span className={cn('h-1.5 w-1.5 rounded-full', evm.address ? 'bg-ok' : 'bg-text-muted')} />
          EVM wallet
        </span>
        {evm.address && (
          <button onClick={() => disconnect()} className="text-[11px] text-text-muted hover:text-coral">
            disconnect
          </button>
        )}
      </div>
      {!evm.address ? (
        <>
          <p className="text-text-secondary">
            Sends USDC from {chains.map((c) => c.name).join(', ')}, and receives it back. Connect MetaMask, Rabby or
            any browser wallet.
          </p>
          <EvmConnectButtons />
        </>
      ) : (
        <>
          <Line label={evm.connector?.id === 'injected' ? 'Browser wallet' : (evm.connector?.name ?? 'Wallet')}>
            <span className="inline-flex items-center gap-1 font-mono">
              {shortenAddress(evm.address, 6, 4)}
              <CopyButton value={evm.address} what="your EVM address" />
            </span>
          </Line>
          <Line label="On">{evm.chain?.name ?? (evm.chainId ? `chain ${evm.chainId}` : 'unknown')}</Line>
          {note && <p className="text-[11px] text-coral">{note}</p>}
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-text-muted">
                <th className="text-left font-normal">Chain</th>
                <th className="text-right font-normal">USDC</th>
                <th className="text-right font-normal">Gas (ETH)</th>
              </tr>
            </thead>
            <tbody>
              {chains.map((c) => {
                const h = holdings.data?.find((x) => x.key === c.key)
                return (
                  <tr key={c.key}>
                    <td className="text-text-secondary py-0.5">{c.name}</td>
                    <td className="text-right text-text">
                      {holdings.isLoading ? '...' : h?.usdc != null ? fmtUsdc(h.usdc) : '?'}
                    </td>
                    <td className={cn('text-right', h?.gas === 0n ? 'text-coral' : 'text-text')}>
                      {holdings.isLoading ? '...' : h?.gas != null ? fmtGas(h.gas) : '?'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="text-[10px] text-text-muted">
            Gas pays for the transactions this wallet signs: the burn on the way in, the mint on the way out when
            you receive it yourself.
          </p>
        </>
      )}
    </div>
  )
}

function StellarWalletCard({ network }: { network: Network }) {
  const { address, walletName, connect, connecting, disconnect } = useWallet()
  const { mode, dfnsAddress } = useCustody()
  const balances = useAccountBalances(network, address)
  const exists = useAccountExists(network, address)
  const walletNet = useStellarWalletNetwork(address)
  const { usdcIssuer } = CONTRACTS[network].cctp
  const usdc = balances.data?.find((b) => b.code === 'USDC' && b.issuer === usdcIssuer)
  const xlm = balances.data?.find((b) => b.isNative)
  const mismatch = stellarNetworkMismatch(network, walletNet.data)
  const treasury = mode === 'dfns' ? dfnsAddress : null

  return (
    <div className="rounded-2xl bg-bg px-4 py-3 text-xs space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-medium text-text">
          <span className={cn('h-1.5 w-1.5 rounded-full', address ? 'bg-ok' : 'bg-text-muted')} />
          Stellar wallet
        </span>
        {address && (
          <button onClick={disconnect} className="text-[11px] text-text-muted hover:text-coral">
            disconnect
          </button>
        )}
      </div>
      {!address ? (
        <>
          <p className="text-text-secondary">
            Receives the USDC on Stellar, and sends it back out. Freighter, xBull, LOBSTR or Albedo.
          </p>
          <div className="flex justify-end">
            <button
              onClick={connect}
              disabled={connecting}
              className="px-3 py-1.5 rounded-md bg-primary text-white text-xs font-medium disabled:opacity-50"
            >
              {connecting ? 'Connecting...' : 'Connect a Stellar wallet'}
            </button>
          </div>
        </>
      ) : (
        <>
          <Line label={walletName ?? 'Wallet'}>
            <span className="inline-flex items-center gap-1 font-mono">
              <a
                href={stellarExplorer(network, 'account', address)}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary hover:underline inline-flex items-center gap-1"
              >
                {shortenAddress(address, 6, 4)} <ExternalLink size={10} />
              </a>
              <CopyButton value={address} what="your Stellar address" />
            </span>
          </Line>
          <Line label="On">{network === 'mainnet' ? 'Stellar Mainnet' : 'Stellar Testnet'}</Line>
          {mismatch && <p className="text-[11px] text-coral">{mismatch}</p>}
          {exists === 'missing' ? (
            <p className="text-[11px] text-coral">
              This account is not on {network} yet: it needs some XLM before it can hold USDC or sign.
            </p>
          ) : (
            <>
              <Line label="USDC">{balances.isLoading ? '...' : usdc ? formatBalance(usdc.balance) : 'none'}</Line>
              <Line label="XLM">{balances.isLoading ? '...' : xlm ? formatBalance(xlm.balance) : '?'}</Line>
              <Line label="Trustline">
                <span className="inline-flex items-center gap-1">
                  {balances.isLoading ? '...' : usdc ? <span className="text-green">on</span> : <span className="text-coral">off, turn it on in the bridge</span>}
                  <InfoTip term="trustline" label="a trustline" />
                </span>
              </Line>
            </>
          )}
          <p className="text-[10px] text-text-muted">XLM pays Stellar's network fees, a few hundredths per signature.</p>
        </>
      )}
      {treasury && (
        <p className="text-[11px] text-text-secondary">
          Custody mode: USDC coming in goes to the DFNS treasury {shortenAddress(treasury, 6, 4)}. A browser wallet
          only pays the delivery fee.
        </p>
      )}
    </div>
  )
}

// both ends of the bridge side by side, each connected on its own
export default function BridgeWallets({ network }: { network: Network }) {
  const chains = cctpChainsFor(network)
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <EvmWalletCard network={network} chains={chains} />
      <StellarWalletCard network={network} />
    </div>
  )
}
