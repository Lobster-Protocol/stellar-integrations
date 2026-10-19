import { useEffect, useRef, useState } from 'react'
import { useWallet } from '../contexts/WalletContext'
import { useNetwork } from '../contexts/NetworkContext'
import { useCustody } from '../contexts/CustodyContext'
import { useBuildPingTx, useSubmitAndWait } from '../integrations/lobster/hooks'
import { buildTreasuryPaymentTx } from '../integrations/dfns/demo-tx'
import { awaitDfnsSignature } from '../integrations/dfns/await-signature'
import { pollSignatureStatus, requestTransfer } from '../integrations/dfns/relay'
import { readableDfnsError } from '../integrations/dfns/errors'
import { networkPassphrase } from '../integrations/lobster/client'
import { txLanded } from '../integrations/stellar/landed'
import { stellarExplorer, cn } from '../utils/format'
import { InfoTip } from './InfoTip'
import { WALLET_CONNECT_ID } from '@creit-tech/stellar-wallets-kit/modules/wallet-connect'

type State =
  | { phase: 'idle' }
  | { phase: 'building' }
  | { phase: 'signing' }
  | { phase: 'submitting' }
  | { phase: 'pending' }
  | { phase: 'confirmed'; txHash: string }
  | { phase: 'cleared'; ref: string; held: boolean }
  | { phase: 'failed'; errorMsg: string }

const RESTING_PHASES: ReadonlyArray<State['phase']> = ['idle', 'confirmed', 'cleared', 'failed']

export default function SignDemoTx() {
  const { address, walletName, walletId } = useWallet()
  const { network } = useNetwork()
  const { signer, dfnsAddress, setMode } = useCustody()

  const buildPing = useBuildPingTx(network)
  const submit = useSubmitAndWait(network)

  const [state, setState] = useState<State>({ phase: 'idle' })
  const inFlight = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => abortRef.current?.abort(), [])

  const isDfns = signer.name === 'dfns'
  // DFNS over WalletConnect signs on the left tab
  const isWc = walletId === WALLET_CONNECT_ID
  // dfns signs as the treasury, and the relay guard rejects any other tx source
  const source = isDfns ? dfnsAddress : address

  async function handleAction(kind: 'ping' | 'transfer' | 'payment') {
    if (!source || inFlight.current) return
    inFlight.current = true
    // a stale aborted controller would make the catch read a real error as Stop waiting
    abortRef.current = null
    try {
      setState({ phase: 'building' })
      if (kind === 'transfer') {
        // dfns can only read a payment it builds itself, and the treasury is
        // whitelisted, so this clears with no approver
        const out = await requestTransfer(source, '100000')
        if (out.txHash) {
          txLanded(network, out.txHash)
          setState({ phase: 'confirmed', txHash: out.txHash })
        }
        // the relay token can't read transfers back, so show the ref instead of waiting for a hash
        else setState({ phase: 'cleared', ref: out.id, held: out.held })
        return
      }
      let xdr: string
      if (kind === 'payment') {
        xdr = await buildTreasuryPaymentTx(network, source, '0.0100000')
      } else {
        const ping = await buildPing.mutateAsync(source)
        if (ping.restorePreamble) {
          setState({ phase: 'failed', errorMsg: 'The Factory storage has expired on-chain and needs restoring before this call.' })
          return
        }
        xdr = ping.xdr
      }

      setState({ phase: 'signing' })
      const { signedTxXdr, broadcastHash, pendingId } = await signer.signTransaction(xdr, {
        networkPassphrase: networkPassphrase(network),
        address: source,
      })

      // held for approval; only the poll gets a hash
      if (pendingId) {
        setState({ phase: 'pending' })
        const ac = new AbortController()
        abortRef.current = ac
        // dfns broadcasts a classic payment itself but only signs a soroban call
        const hash =
          kind === 'payment'
            ? await pollSignatureStatus(pendingId, { signal: ac.signal })
            : await awaitDfnsSignature(pendingId, network, ac.signal)
        if (kind === 'payment') txLanded(network, hash)
        setState({ phase: 'confirmed', txHash: hash })
        return
      }

      if (broadcastHash) {
        txLanded(network, broadcastHash)
        setState({ phase: 'confirmed', txHash: broadcastHash })
        return
      }
      if (!signedTxXdr) throw new Error('signer returned neither a hash nor an envelope')

      setState({ phase: 'submitting' })
      const { hash, status } = await submit.mutateAsync(signedTxXdr)
      if (status === 'SUCCESS') {
        setState({ phase: 'confirmed', txHash: hash })
      } else {
        setState({ phase: 'failed', errorMsg: `The network reported ${status}.` })
      }
    } catch (err: unknown) {
      // Stop waiting isn't a failure
      if (abortRef.current?.signal.aborted) {
        setState({ phase: 'idle' })
        return
      }
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      setState({ phase: 'failed', errorMsg })
    } finally {
      inFlight.current = false
    }
  }

  const busy = !RESTING_PHASES.includes(state.phase)
  const pingLabel: Record<State['phase'], string> = {
    idle: `Call the Factory with ${walletName ?? 'wallet'}`,
    building: 'Building...',
    signing: 'Awaiting signature...',
    submitting: 'Submitting...',
    pending: 'Awaiting approval...',
    confirmed: 'Call again',
    cleared: 'Call again',
    failed: 'Retry',
  }
  const phaseText: Partial<Record<State['phase'], string>> = {
    building: 'Building...',
    signing: 'Signing...',
    submitting: 'Submitting...',
  }

  return (
    <div className="rounded-3xl p-5 bg-bg-card card">
      <h3 className="text-sm font-semibold text-text mb-1">Sign a testnet transaction</h3>
      <p className="text-xs text-text-secondary mb-4">
        {isDfns ? (
          <>
            The testnet treasury signs through DFNS with MPC <InfoTip term="mpc" label="MPC signing" />.
            Its policy, listed under Signing policies above, lets a payment to an address on the
            treasury list straight through and holds anything else for an approver. With the first
            button DFNS builds the payment itself, so the policy sees the recipient is the treasury and
            clears it. The other two send DFNS an unsigned transaction to sign, which the policy can't
            read, so it holds them; on the Lobster demo the relay approves them automatically. Each one
            costs only the network fee: both payments go from the treasury to itself, and the Factory
            call only asks the contract for its admin.
          </>
        ) : (
          <>
            Sends a harmless test call to the Lobster Factory <InfoTip term="factory" label="the Factory" />{' '}
            from your wallet. It only costs the network fee.
          </>
        )}
      </p>

      <div className="flex items-center gap-1 mb-4 bg-bg rounded-full p-0.5 text-xs w-fit">
        <button
          type="button"
          onClick={() => setMode('wallet-kit')}
          className={cn(
            'px-3 py-1 rounded-full font-medium transition-all',
            !isDfns ? 'bg-bg-card text-primary shadow-sm' : 'text-text-muted',
          )}
        >
          {isWc ? 'Your DFNS wallet' : 'Browser wallet'}
        </button>
        <button
          type="button"
          onClick={() => setMode('dfns')}
          className={cn(
            'px-3 py-1 rounded-full font-medium transition-all',
            isDfns ? 'bg-bg-card text-primary shadow-sm' : 'text-text-muted',
          )}
        >
          DFNS relay (advanced)
        </button>
      </div>

      {!source ? (
        <p className="text-xs text-text-muted">
          {isDfns
            ? "This tab signs through a DFNS relay, the Lobster testnet demo or one you run yourself. A DFNS wallet you've connected signs under the other tab, no relay needed."
            : 'Connect a Stellar wallet to try this.'}
        </p>
      ) : network === 'mainnet' ? (
        <p className="text-xs text-coral">
          This demo only sends on testnet. Switch to testnet to send one.
        </p>
      ) : (
        <div className="space-y-3">
          {isDfns ? (
            <div className="space-y-3">
              <button
                onClick={() => handleAction('transfer')}
                disabled={busy}
                className="px-4 py-2 rounded-full bg-primary text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Sign now with DFNS MPC, no approver needed
              </button>
              <div>
                <p className="text-[11px] text-text-muted mb-2">
                  These two are held for approval before DFNS signs them.
                </p>
                <div className="flex flex-wrap gap-2">
                  {/* both go to /dfns/sign as raw xdr, which no policy rule can read */}
                  <button
                    onClick={() => handleAction('ping')}
                    disabled={busy}
                    className="px-4 py-2 rounded-full bg-bg text-text text-sm font-semibold ring-1 ring-primary/30 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Call the Factory (DFNS MPC)
                  </button>
                  <button
                    onClick={() => handleAction('payment')}
                    disabled={busy}
                    className="px-4 py-2 rounded-full bg-bg text-text text-sm font-semibold ring-1 ring-primary/30 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Pay 0.01 XLM as raw XDR (held, then approved)
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => handleAction('ping')}
              disabled={busy}
              className="px-4 py-2 rounded-full bg-primary text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {pingLabel[state.phase]}
            </button>
          )}

          {busy && phaseText[state.phase] && (
            <p className="text-xs text-text-muted">{phaseText[state.phase]}</p>
          )}

          {!isDfns && isWc && state.phase === 'signing' && (
            <p className="text-xs text-primary bg-primary/5 rounded-lg px-3 py-2">
              Open your DFNS wallet or console to review and approve this request. It does not sign
              until you approve it there.
            </p>
          )}

          {state.phase === 'pending' && (
            <div className="text-xs text-primary bg-primary/5 rounded-lg px-3 py-2 space-y-2">
              <p>
                Held for approval by the DFNS policy. Whoever asked for it can't approve it, so it
                waits until an approver releases it in the DFNS console.
              </p>
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="text-[11px] text-text-muted hover:text-coral"
              >
                Stop waiting
              </button>
            </div>
          )}

          {state.phase === 'cleared' && (
            <div className="text-xs text-text-secondary">
              <div className={cn('font-medium mb-1', state.held ? 'text-primary' : 'text-green')}>
                {state.held
                  ? 'Held for an approver, because the recipient is not on the treasury list'
                  : 'Sent with no approval, because the recipient is on the treasury list'}
              </div>
              <div className="font-mono break-all bg-bg rounded-lg px-2 py-1">{state.ref}</div>
              <p className="mt-1">
                {state.held
                  ? 'It stays queued until a named approver releases it in the DFNS console.'
                  : 'DFNS took the payment straight to the network. It lands on the treasury account within a few seconds.'}
              </p>
              <a
                href={stellarExplorer(network, 'account', source)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-1 text-primary hover:underline"
              >
                Open the treasury account
              </a>
            </div>
          )}

          {state.phase === 'confirmed' && (
            <div className="text-xs text-text-secondary">
              <div className="text-green font-medium mb-1">Confirmed on testnet</div>
              <div className="font-mono break-all bg-bg rounded-lg px-2 py-1">{state.txHash}</div>
              <a
                href={stellarExplorer(network, 'tx', state.txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-1 text-primary hover:underline"
              >
                View on Stellar Expert
              </a>
            </div>
          )}

          {state.phase === 'failed' && (
            <div className="text-xs text-coral bg-coral/5 rounded-lg px-3 py-2">{readableDfnsError(state.errorMsg)}</div>
          )}
        </div>
      )}
    </div>
  )
}
