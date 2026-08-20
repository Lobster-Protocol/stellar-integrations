import { useRef, useState } from 'react'
import { useWallet } from '../contexts/WalletContext'
import { useNetwork } from '../contexts/NetworkContext'
import { useSigner } from '../contexts/CustodyContext'
import { useBuildPingTx, useSubmitAndWait } from '../integrations/lobster/hooks'
import { buildTreasuryPaymentTx } from '../integrations/dfns/demo-tx'
import { networkPassphrase } from '../integrations/lobster/client'
import { stellarExplorer } from '../utils/format'

type State =
  | { phase: 'idle' }
  | { phase: 'building' }
  | { phase: 'signing' }
  | { phase: 'submitting' }
  | { phase: 'confirmed'; txHash: string }
  | { phase: 'failed'; errorMsg: string }

const RESTING_PHASES: ReadonlyArray<State['phase']> = ['idle', 'confirmed', 'failed']

export default function SignDemoTx() {
  const { address, walletName } = useWallet()
  const { network } = useNetwork()
  const signer = useSigner()

  const buildPing = useBuildPingTx(network)
  const submit = useSubmitAndWait(network)

  const [state, setState] = useState<State>({ phase: 'idle' })

  // double-click guard during submit
  const inFlight = useRef(false)

  async function handleClick() {
    if (!address || inFlight.current) return
    inFlight.current = true
    try {
      setState({ phase: 'building' })
      let xdr: string
      if (signer.name === 'dfns') {
        // DFNS custody signs a classic self-payment: a payment op the relay guard
        // allows and DFNS can broadcast + weigh against its policy. the Factory
        // ping is a soroban call the guard blocks (anti-drain), so it is wallet-
        // kit only.
        xdr = await buildTreasuryPaymentTx(network, address, '0.0100000')
      } else {
        const ping = await buildPing.mutateAsync(address)
        if (ping.restorePreamble) {
          setState({ phase: 'failed', errorMsg: 'Factory storage is archived. A restore tx is needed before this ping.' })
          return
        }
        xdr = ping.xdr
      }

      setState({ phase: 'signing' })
      const { signedTxXdr, broadcastHash } = await signer.signTransaction(xdr, {
        networkPassphrase: networkPassphrase(network),
        address,
      })

      // DFNS signs AND broadcasts a classic tx, so the hash is the artifact and
      // there is nothing to submit. the wallet kit hands back an envelope to
      // submit and poll.
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

  const isDfns = signer.name === 'dfns'
  const idleLabel = isDfns
    ? 'Sign a treasury payment with DFNS MPC'
    : `Ping Factory with ${walletName ?? 'wallet'}`
  const buttonLabel: Record<State['phase'], string> = {
    idle: idleLabel,
    building: 'Building tx...',
    signing: isDfns ? 'MPC signing...' : 'Awaiting signature...',
    submitting: 'Submitting & polling...',
    confirmed: 'Sign again',
    failed: 'Retry',
  }

  return (
    <div className="rounded-3xl p-5 bg-bg-card card">
      <h3 className="text-sm font-semibold text-text mb-1">Sign a testnet transaction</h3>
      <p className="text-xs text-text-secondary mb-4">
        {isDfns
          ? 'Signs a small self-payment from the DFNS-held treasury through the MPC nodes, checked against the approval policy and broadcast by DFNS. No value leaves the account; the hash below is the on-chain artifact.'
          : 'Pings the Factory via your wallet. Builds the XDR, asks the wallet to sign, submits to Stellar RPC and waits for inclusion. Costs only the resource fee.'}
      </p>

      {!address ? (
        <p className="text-xs text-text-muted">Connect a Stellar wallet to try this.</p>
      ) : network === 'mainnet' ? (
        <p className="text-xs text-coral">
          The Factory isn't on mainnet yet. Switch to testnet to send a real tx.
        </p>
      ) : (
        <div className="space-y-3">
          <button
            onClick={handleClick}
            disabled={!RESTING_PHASES.includes(state.phase)}
            className="px-4 py-2 rounded-full bg-primary text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {buttonLabel[state.phase]}
          </button>

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
