import { useRef, useState } from 'react'
import { useWallet } from '../contexts/WalletContext'
import { useNetwork } from '../contexts/NetworkContext'
import { useSigner } from '../contexts/CustodyContext'
import { useBuildPingTx, useSubmitAndWait } from '../integrations/lobster/hooks'
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
      const { xdr, restorePreamble } = await buildPing.mutateAsync(address)
      if (restorePreamble) {
        setState({ phase: 'failed', errorMsg: 'Factory storage is archived. A restore tx is needed before this ping.' })
        return
      }

      setState({ phase: 'signing' })
      const { signedTxXdr } = await signer.signTransaction(xdr, {
        networkPassphrase: networkPassphrase(network),
        address,
      })

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

  const signerLabel = signer.name === 'dfns' ? 'DFNS MPC' : walletName ?? 'wallet'
  const buttonLabel: Record<State['phase'], string> = {
    idle: `Ping Factory with ${signerLabel}`,
    building: 'Building tx...',
    signing: 'Awaiting signature...',
    submitting: 'Submitting & polling...',
    confirmed: 'Ping again',
    failed: 'Retry',
  }

  return (
    <div className="rounded-3xl p-5 bg-bg-card card">
      <h3 className="text-sm font-semibold text-text mb-1">Sign a testnet transaction</h3>
      <p className="text-xs text-text-secondary mb-4">
        Pings the Factory via your wallet. Builds the XDR, asks the wallet to sign, submits to Stellar RPC and waits for inclusion. Costs only the resource fee.
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
