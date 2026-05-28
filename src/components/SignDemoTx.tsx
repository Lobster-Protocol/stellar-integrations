import { useRef, useState } from 'react'
import { StellarWalletsKit } from '@creit-tech/stellar-wallets-kit'
import { useWallet } from '../contexts/WalletContext'
import { useNetwork } from '../contexts/NetworkContext'
import { useBuildPingTx, useSubmitAndWait } from '../integrations/lobster/hooks'
import { networkPassphrase } from '../integrations/lobster/client'
import { cardStyle } from '../utils/format'

export default function SignDemoTx() {
  const { address, walletName } = useWallet()
  const { network } = useNetwork()

  const buildPing = useBuildPingTx(network)
  const submit = useSubmitAndWait(network)

  const [step, setStep] = useState<
    'idle' | 'building' | 'signing' | 'submitting' | 'confirmed' | 'failed'
  >('idle')
  const [txHash, setTxHash] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // re-entrancy guard for rapid double-clicks during submit
  const inFlight = useRef(false)
  const onMainnet = network === 'mainnet'

  async function handleClick() {
    if (!address || inFlight.current) return
    inFlight.current = true
    setErrorMsg(null)
    setTxHash(null)
    try {
      setStep('building')
      const xdr = await buildPing.mutateAsync(address)

      setStep('signing')
      const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, {
        networkPassphrase: networkPassphrase(network),
        address,
      })

      setStep('submitting')
      const { hash, status } = await submit.mutateAsync(signedTxXdr)
      setTxHash(hash)
      setStep(status === 'SUCCESS' ? 'confirmed' : 'failed')
      if (status !== 'SUCCESS') setErrorMsg(`Tx final status: ${status}`)
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error')
      setStep('failed')
    } finally {
      inFlight.current = false
    }
  }

  const explorerUrl = txHash
    ? `https://stellar.expert/explorer/${network === 'mainnet' ? 'public' : 'testnet'}/tx/${txHash}`
    : null

  return (
    <div
      className="rounded-3xl p-5 bg-bg-card"
      style={cardStyle}
    >
      <h3 className="text-sm font-semibold text-text mb-1">Sign a testnet transaction</h3>
      <p className="text-xs text-text-secondary mb-4">
        Pings the Factory via your wallet. Builds the XDR, asks the wallet to sign, submits to Stellar RPC and waits for inclusion. Costs only the resource fee.
      </p>

      {!address ? (
        <p className="text-xs text-text-muted">Connect a Stellar wallet to try this.</p>
      ) : onMainnet ? (
        <p className="text-xs text-coral">
          The Factory isn't on mainnet yet. Switch to testnet to send a real tx.
        </p>
      ) : (
        <div className="space-y-3">
          <button
            onClick={handleClick}
            disabled={step !== 'idle' && step !== 'confirmed' && step !== 'failed'}
            className="px-4 py-2 rounded-full bg-primary text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {step === 'idle' && `Ping Factory with ${walletName ?? 'wallet'}`}
            {step === 'building' && 'Building tx...'}
            {step === 'signing' && 'Awaiting signature...'}
            {step === 'submitting' && 'Submitting & polling...'}
            {step === 'confirmed' && 'Ping again'}
            {step === 'failed' && 'Retry'}
          </button>

          {step === 'confirmed' && txHash && explorerUrl && (
            <div className="text-xs text-text-secondary">
              <div className="text-green font-medium mb-1">Confirmed on testnet</div>
              <div className="font-mono break-all bg-bg rounded-lg px-2 py-1">{txHash}</div>
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-1 text-primary hover:underline"
              >
                View on Stellar Expert
              </a>
            </div>
          )}

          {step === 'failed' && errorMsg && (
            <div className="text-xs text-coral bg-coral/5 rounded-lg px-3 py-2">{errorMsg}</div>
          )}
        </div>
      )}
    </div>
  )
}
