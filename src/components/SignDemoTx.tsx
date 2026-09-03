import { useEffect, useRef, useState } from 'react'
import { useWallet } from '../contexts/WalletContext'
import { useNetwork } from '../contexts/NetworkContext'
import { useCustody } from '../contexts/CustodyContext'
import { useBuildPingTx, useSubmitAndWait } from '../integrations/lobster/hooks'
import { buildTreasuryPaymentTx, buildTreasuryTrustlineTx } from '../integrations/dfns/demo-tx'
import { pollSignatureStatus, requestTransfer } from '../integrations/dfns/relay'
import { networkPassphrase } from '../integrations/lobster/client'
import { stellarExplorer, cn } from '../utils/format'
import { InfoTip } from './InfoTip'

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
  const { address, walletName } = useWallet()
  const { network } = useNetwork()
  const { signer, dfnsAddress, setMode } = useCustody()

  const buildPing = useBuildPingTx(network)
  const submit = useSubmitAndWait(network)

  const [state, setState] = useState<State>({ phase: 'idle' })
  const inFlight = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => abortRef.current?.abort(), [])

  const isDfns = signer.name === 'dfns'
  // dfns signs from the mpc treasury, so the tx must source from that account and
  // not the connected browser wallet; the relay guard rejects any other source.
  const source = isDfns ? dfnsAddress : address

  async function handleAction(kind: 'ping' | 'transfer' | 'small' | 'large' | 'trustline') {
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
      if (kind === 'small' || kind === 'large') {
        // the two sit on either side of the 5 USD line in the treasury policy,
        // which is the whole point of having both: the small one clears with no
        // human, the large one waits for a named approver. both pay the
        // treasury itself, so the balance never moves.
        xdr = await buildTreasuryPaymentTx(network, source, kind === 'small' ? '0.0100000' : '80.0000000')
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
            approval rules first, and the buttons deliberately land on both sides of them. The 0.01
            XLM payment is under the limit, so it signs and broadcasts on its own and the hash shows
            up straight away. The 80 XLM one is over it, so it waits for a named approver first.
            Calling the Factory is a contract read, which DFNS cannot put a dollar value on, so that
            one waits too. Every button pays the treasury itself, so the balance never moves. The
            rules are listed on the{' '}
            <a href="/audit" className="text-coral hover:underline">
              Audit
            </a>{' '}
            page.
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
          Browser wallet
        </button>
        <button
          type="button"
          onClick={() => setMode('dfns')}
          className={cn(
            'px-3 py-1 rounded-full font-medium transition-all',
            isDfns ? 'bg-bg-card text-primary shadow-sm' : 'text-text-muted',
          )}
        >
          DFNS MPC
        </button>
      </div>

      {!source ? (
        <p className="text-xs text-text-muted">
          {isDfns
            ? 'No DFNS treasury wallet on this network yet. Create one in the custody panel to try this.'
            : 'Connect a Stellar wallet to try this.'}
        </p>
      ) : network === 'mainnet' ? (
        <p className="text-xs text-coral">
          The Factory isn't on mainnet yet. Switch to testnet to send a real transaction.
        </p>
      ) : (
        <div className="space-y-3">
          {isDfns ? (
            <div className="flex flex-wrap gap-2">
              {/* the Soroban leg: a read-only Factory view, signed by MPC. it is
                  what a reviewer needs to see a soroban tx come out of DFNS, and
                  the signer admits it because a view moves nothing. DFNS cannot
                  put a dollar value on a contract call, so it never slips under
                  an amount threshold and always waits for an approver. */}
              <button
                onClick={() => handleAction('ping')}
                disabled={busy}
                className="px-4 py-2 rounded-full bg-primary text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Call the Factory (DFNS MPC)
              </button>
              <button
                onClick={() => handleAction('transfer')}
                disabled={busy}
                className="px-4 py-2 rounded-full bg-bg text-text text-sm font-semibold ring-1 ring-primary/30 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Pay 0.01 XLM to itself, no approver
              </button>
              <button
                onClick={() => handleAction('small')}
                disabled={busy}
                className="px-4 py-2 rounded-full bg-bg text-text text-sm font-semibold ring-1 ring-primary/30 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Pay 0.01 XLM, under the limit
              </button>
              <button
                onClick={() => handleAction('large')}
                disabled={busy}
                className="px-4 py-2 rounded-full bg-bg text-text text-sm font-semibold ring-1 ring-primary/30 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Pay 80 XLM, over the limit
              </button>
              <button
                onClick={() => handleAction('trustline')}
                disabled={busy}
                className="px-4 py-2 rounded-full bg-bg text-text text-sm font-semibold ring-1 ring-primary/30 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Turn on a LOBS trustline (DFNS MPC)
              </button>
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

          {state.phase === 'pending' && (
            <div className="text-xs text-primary bg-primary/5 rounded-lg px-3 py-2">
              Waiting for approval in DFNS. Someone else has to approve it
              (the app can't approve its own request), then the hash shows up here.
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
            <div className="text-xs text-coral bg-coral/5 rounded-lg px-3 py-2">{state.errorMsg}</div>
          )}
        </div>
      )}
    </div>
  )
}
