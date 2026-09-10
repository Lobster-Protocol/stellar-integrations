import { useEffect, useRef, useState } from 'react'
import { useWallet } from '../contexts/WalletContext'
import { useNetwork } from '../contexts/NetworkContext'
import { useCustody } from '../contexts/CustodyContext'
import { useBuildPingTx, useSubmitAndWait } from '../integrations/lobster/hooks'
import { buildTreasuryPaymentTx, buildTreasuryTrustlineTx } from '../integrations/dfns/demo-tx'
import { pollSignatureStatus, requestTransfer } from '../integrations/dfns/relay'
import { readableDfnsError } from '../integrations/dfns/errors'
import { networkPassphrase } from '../integrations/lobster/client'
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
  // a DFNS wallet connected over WalletConnect signs on the left tab (it is the
  // connected wallet); the right tab is the separate relay-treasury demo.
  const isWc = walletId === WALLET_CONNECT_ID
  // dfns signs from the mpc treasury, so the tx must source from that account and
  // not the connected browser wallet; the relay guard rejects any other source.
  const source = isDfns ? dfnsAddress : address

  async function handleAction(kind: 'ping' | 'transfer' | 'payment' | 'trustline') {
    if (!source || inFlight.current) return
    inFlight.current = true
    try {
      setState({ phase: 'building' })
      if (kind === 'transfer') {
        // dfns builds this payment itself, which is the only request shape its
        // approval rules can read. the destination is the treasury and it is on
        // the list, so the rule lets it through with nobody in the loop.
        const out = await requestTransfer(source, '100000')
        if (out.txHash) setState({ phase: 'confirmed', txHash: out.txHash })
        // a transfer cannot be polled from here: the relay credential is not
        // allowed to read transfers back, so say where it went rather than
        // promising a hash that will never arrive on its own.
        else setState({ phase: 'cleared', ref: out.id, held: out.held })
        return
      }
      let xdr: string
      if (kind === 'payment') {
        xdr = await buildTreasuryPaymentTx(network, source, '0.0100000')
      } else if (kind === 'trustline') {
        xdr = await buildTreasuryTrustlineTx(network, source)
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

      // held for a human approval in dfns: show the pending state and poll until a
      // second approver signs off, then the hash lands.
      if (pendingId) {
        setState({ phase: 'pending' })
        const ac = new AbortController()
        abortRef.current = ac
        const hash = await pollSignatureStatus(pendingId, { signal: ac.signal })
        setState({ phase: 'confirmed', txHash: hash })
        return
      }

      // dfns broadcasts a classic tx itself, so the hash is the whole artifact;
      // the wallet kit hands back an envelope to submit and poll.
      if (broadcastHash) {
        setState({ phase: 'confirmed', txHash: broadcastHash })
        return
      }
      if (!signedTxXdr) throw new Error('signer returned neither a hash nor an envelope')

      setState({ phase: 'submitting' })
      const { hash, status } = await submit.mutateAsync(signedTxXdr)
      if (status === 'SUCCESS') {
        setState({ phase: 'confirmed', txHash: hash })
      } else {
        setState({ phase: 'failed', errorMsg: `Tx final status: ${status}` })
      }
    } catch (err: unknown) {
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
    signing: 'Signing (MPC)...',
    submitting: 'Submitting...',
  }

  return (
    <div className="rounded-3xl p-5 bg-bg-card card">
      <h3 className="text-sm font-semibold text-text mb-1">Sign a testnet transaction</h3>
      <p className="text-xs text-text-secondary mb-4">
        {isDfns ? (
          <>
            The treasury wallet is held by DFNS and signed by its MPC network{' '}
            <InfoTip term="mpc" label="MPC signing" />. Every request is checked against the treasury
            rule first, and the buttons deliberately land on both sides of it. The rule allows a
            payment to an address on the treasury list and holds everything else for a named
            approver. The first payment button asks DFNS to build the payment, so it can read the
            recipient, see our own address and let it through: the hash lands in seconds with nobody
            in the loop. The other buttons hand DFNS a signed envelope instead, which it cannot read
            a recipient out of, so those wait for the approver. Every one of them pays the treasury
            itself, so the balance never moves. The rule itself is listed above, next to the live
            wallets, the policies and the audit export, which already prove the integration with no
            transaction at all.
          </>
        ) : (
          <>
            Sends a harmless test call to the Lobster Factory <InfoTip term="factory" label="the Factory" />{' '}
            through your wallet: it builds the transaction, your wallet signs it, and it goes to the
            Stellar network. It only costs the network fee.
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
            ? 'This is the advanced DFNS relay demo - a server you run and connect from + MPC. Your own connected DFNS wallet signs under the other tab, no relay needed.'
            : 'Connect a Stellar wallet to try this.'}
        </p>
      ) : network === 'mainnet' ? (
        <p className="text-xs text-coral">
          The Factory isn't on mainnet yet. Switch to testnet to send a real transaction.
        </p>
      ) : (
        <div className="space-y-3">
          {isDfns ? (
            <div className="space-y-3">
              {/* the one path that clears with no human: DFNS builds the payment to the
                  treasury itself, reads its own address off the list, and lets it through.
                  this is the "see MPC sign now" button a reviewer should reach first. */}
              <button
                onClick={() => handleAction('transfer')}
                disabled={busy}
                className="px-4 py-2 rounded-full bg-primary text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Sign now with DFNS MPC, no approver needed
              </button>
              <div>
                <p className="text-[11px] text-text-muted mb-2">
                  Approval demo: these hit the other side of the treasury rule on purpose and wait
                  for a designated approver in the DFNS console, so they do not finish on this screen
                  by themselves.
                </p>
                <div className="flex flex-wrap gap-2">
                  {/* a Soroban view signed by MPC; DFNS can't price a contract call, so it
                      always waits for an approver. */}
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
                    Pay 0.01 XLM as raw XDR, needs an approver
                  </button>
                  <button
                    onClick={() => handleAction('trustline')}
                    disabled={busy}
                    className="px-4 py-2 rounded-full bg-bg text-text text-sm font-semibold ring-1 ring-primary/30 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Turn on a LOBS trustline (DFNS MPC)
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
            <div className="text-xs text-primary bg-primary/5 rounded-lg px-3 py-2">
              Held for approval in DFNS. This is the policy engine holding it (four-eyes: whoever
              starts a transaction cannot approve it). A designated approver releases it, not you.
              To watch a signature complete instead, use the "no approver needed" action above.
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
                href={stellarExplorer(network, 'account', source ?? '')}
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
