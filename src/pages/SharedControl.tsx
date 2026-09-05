import { useState } from 'react'
import { TransactionBuilder, type Transaction } from '@stellar/stellar-sdk'

import { useWallet } from '../contexts/WalletContext'
import { useNetwork } from '../contexts/NetworkContext'
import { useCustody } from '../contexts/CustodyContext'
import { useAccountSigning } from '../integrations/stellar/use-account-signing'
import {
  isMultisig,
  requiredWeight,
  buildSetOptionsTx,
  submitClassic,
} from '../integrations/stellar/multisig'
import { submitSignedXdr, waitForTx } from '../integrations/lobster/vault-tx'
import { walletKitSigner } from '../integrations/signer/wallet-kit-signer'
import { networkPassphrase } from '../integrations/lobster/client'
import { isAccountId } from '../integrations/stellar/strkey-guards'
import { Card, CardHead, Empty } from '../components/ui'
import { InfoTip } from '../components/InfoTip'
import CoSignPanel from '../components/CoSignPanel'
import { stellarExplorer, cn } from '../utils/format'

type SetupPhase =
  | { k: 'form' }
  | { k: 'busy'; step: string }
  | { k: 'done'; hash: string }
  | { k: 'failed'; msg: string }

function short(key: string): string {
  return `${key.slice(0, 4)}...${key.slice(-4)}`
}

function SharedControlCard() {
  const { address } = useWallet()
  const { network } = useNetwork()
  const { mode } = useCustody()
  const signing = useAccountSigning(network, address)
  const [coSigner, setCoSigner] = useState('')
  const [backup, setBackup] = useState('')
  const [phase, setPhase] = useState<SetupPhase>({ k: 'form' })
  const [ackControl, setAckControl] = useState(false)

  if (!address) {
    return (
      <Card>
        <CardHead title="Shared control" note="Require a quorum of signatures before this account can move any funds." />
        <Empty>Connect a wallet to see whether this account is under shared control.</Empty>
      </Card>
    )
  }

  const busy = phase.k === 'busy'
  const coValid = isAccountId(coSigner) && coSigner !== address
  const backupValid = backup === '' || (isAccountId(backup) && backup !== address && backup !== coSigner)
  const canSubmit = coValid && backupValid && ackControl && !busy

  async function turnOn() {
    if (!canSubmit) return
    // this card is for a fresh single-sig account. a signer already on the account
    // could clear the quorum on its own after enrollment, so refuse rather than
    // hand it a false "shared control is on".
    const existingExtra = (signing.data?.signers ?? []).filter((s) => s.key !== address)
    if (existingExtra.length > 0 || (signing.data?.otherSigners ?? 0) > 0) {
      setPhase({
        k: 'failed',
        msg: 'This account already has other signers. Set up shared control on a fresh single-sig account, or clear the existing signers first.',
      })
      return
    }
    const signers = [{ key: coSigner, weight: 1 }]
    if (backup && isAccountId(backup)) signers.push({ key: backup, weight: 1 })
    try {
      setPhase({ k: 'busy', step: 'Building the change...' })
      const xdr = await buildSetOptionsTx(network, address!, {
        addSigners: signers,
        masterWeight: 1,
        threshold: 2,
      })
      setPhase({ k: 'busy', step: 'Awaiting your signature...' })
      const { signedTxXdr } = await walletKitSigner.signTransaction(xdr, {
        networkPassphrase: networkPassphrase(network),
        address: address!,
      })
      if (!signedTxXdr) throw new Error('the wallet did not return a signed transaction')
      setPhase({ k: 'busy', step: 'Submitting...' })
      const hash = await submitClassic(network, signedTxXdr)
      // do not claim "on" on faith: read the account back and only call it done
      // if it is actually a quorum now.
      const refreshed = await signing.refetch()
      if (refreshed.data && isMultisig(refreshed.data) && (refreshed.data.otherSigners ?? 0) === 0) {
        setPhase({ k: 'done', hash })
      } else {
        setPhase({
          k: 'failed',
          msg: `The change was submitted (${hash.slice(0, 8)}...) but the account is not under a quorum. Check its signers before relying on it.`,
        })
      }
    } catch (e) {
      setPhase({ k: 'failed', msg: e instanceof Error ? e.message.split('\n')[0].slice(0, 180) : 'setup failed' })
    }
  }

  if (signing.isLoading) {
    return (
      <Card>
        <CardHead title="Shared control" />
        <Empty>Reading this account...</Empty>
      </Card>
    )
  }

  const data = signing.data
  const already = data ? isMultisig(data) : false

  if (already && data) {
    return (
      <Card>
        <CardHead
          title="Shared control is on"
          note={`Every deposit, withdrawal and swap from this account needs ${requiredWeight(data, 'med')} signatures now.`}
        />
        <div className="rounded-2xl bg-bg px-3 py-3 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-text-secondary">Signatures required</span>
            <span className="font-semibold text-text">
              {requiredWeight(data, 'med')} of {data.signers.length}
            </span>
          </div>
          <ul className="space-y-0.5">
            {data.signers.map((s) => (
              <li key={s.key} className="flex items-center justify-between text-[11px]">
                <span className="font-mono text-text">
                  {short(s.key)}
                  {s.key === address && ' (this wallet)'}
                </span>
                <span className="text-text-muted">weight {s.weight}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[11px] text-text-muted mt-3">
          To change or remove a signer, that change needs the same quorum. Keep every key safe: a
          quorum you can no longer reach locks the account.
        </p>
      </Card>
    )
  }

  return (
    <Card>
      <CardHead
        title="Turn on shared control"
        note="Add a second signer to this account so no deposit, withdrawal or swap can go through on one signature alone."
      />

      {mode === 'dfns' && (
        <p className="text-[11px] text-text-muted mb-3">
          Shared control signs with your browser wallet. The DFNS custody option is separate.
        </p>
      )}

      {phase.k === 'done' ? (
        <div className="text-center py-4">
          <div className="text-green font-medium mb-2">Shared control is on</div>
          <a
            href={stellarExplorer(network, 'tx', phase.hash)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline font-mono break-all"
          >
            {phase.hash}
          </a>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-text-secondary">
              Co-signer address <InfoTip term="signer" label="a signer" />
            </label>
            <input
              type="text"
              value={coSigner}
              onChange={(e) => setCoSigner(e.target.value.trim())}
              placeholder="G..."
              className={cn(
                'mt-1 w-full bg-bg rounded-lg px-3 py-2 text-xs font-mono outline-none focus:ring-1',
                coSigner && !coValid ? 'ring-1 ring-coral' : 'focus:ring-primary/30',
              )}
            />
            {coSigner && !coValid && (
              <p className="text-[11px] text-coral mt-1">Enter a valid Stellar account that is not this wallet.</p>
            )}
          </div>

          <div>
            <label className="text-xs text-text-secondary">Backup co-signer (optional, makes it 2 of 3)</label>
            <input
              type="text"
              value={backup}
              onChange={(e) => setBackup(e.target.value.trim())}
              placeholder="G..."
              className={cn(
                'mt-1 w-full bg-bg rounded-lg px-3 py-2 text-xs font-mono outline-none focus:ring-1',
                backup && !backupValid ? 'ring-1 ring-coral' : 'focus:ring-primary/30',
              )}
            />
          </div>

          <div className="rounded-2xl bg-amber-500/10 text-amber-600 px-3 py-2.5 text-[11px] space-y-1.5">
            <p>
              This changes your own Stellar account. Your key stays with you. Lobster never becomes a
              signer unless you add one.
            </p>
            <p>
              A 2 of 2 with no backup has no recovery: lose either key and the account is locked,
              with no way to move funds or change signers. A backup you control (a 2 of 3) means a
              lost key still leaves two that can move funds, though replacing the lost signer in
              place needs all three. Start on testnet first.
            </p>
          </div>

          <label className="flex items-start gap-2 text-[11px] text-text-secondary">
            <input
              type="checkbox"
              checked={ackControl}
              onChange={(e) => setAckControl(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              I control the keys behind these addresses and have tested that they can sign, on testnet
              first. Lobster cannot verify this for me, and a co-signer that cannot sign locks the
              account.
            </span>
          </label>

          <button
            onClick={turnOn}
            disabled={!canSubmit}
            className="w-full px-4 py-2.5 rounded-full bg-primary text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? phase.step : backup ? 'Turn on shared control (2 of 3)' : 'Turn on shared control (2 of 2)'}
          </button>

          {phase.k === 'failed' && <p className="text-xs text-coral break-words">{phase.msg}</p>}
        </div>
      )}
    </Card>
  )
}

function CoSignCard() {
  const { address } = useWallet()
  const { network } = useNetwork()
  const [raw, setRaw] = useState('')
  const [loaded, setLoaded] = useState<{ xdr: string; source: string } | null>(null)
  const [parseErr, setParseErr] = useState<string | null>(null)
  const [doneHash, setDoneHash] = useState<string | null>(null)
  const signing = useAccountSigning(network, loaded?.source ?? null)

  function load() {
    setParseErr(null)
    try {
      const tx = TransactionBuilder.fromXDR(raw.trim(), networkPassphrase(network))
      if ('innerTransaction' in tx) {
        setParseErr('This is a fee-bump transaction. Paste the transaction itself.')
        return
      }
      setLoaded({ xdr: raw.trim(), source: tx.source })
    } catch {
      setParseErr('That does not read as a transaction for this network.')
    }
  }

  async function submitCoSigned(xdr: string): Promise<string> {
    const tx = TransactionBuilder.fromXDR(xdr, networkPassphrase(network)) as Transaction
    const soroban = tx.operations.some((op) => op.type === 'invokeHostFunction')
    if (soroban) {
      const hash = await submitSignedXdr(network, xdr)
      const final = await waitForTx(network, hash)
      if (final.status !== 'SUCCESS') throw new Error(`the network reported ${final.status}`)
      return hash
    }
    return submitClassic(network, xdr)
  }

  return (
    <Card>
      <CardHead
        title="Finish a shared transaction"
        note="Someone sent you a transaction that needs your signature. Paste it here, add your part, and submit once the quorum is met."
      />

      {doneHash ? (
        <div className="text-center py-4">
          <div className="text-green font-medium mb-2">Submitted</div>
          <a
            href={stellarExplorer(network, 'tx', doneHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline font-mono break-all"
          >
            {doneHash}
          </a>
        </div>
      ) : !loaded ? (
        <div className="space-y-2">
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="Paste the transaction here"
            rows={3}
            className="w-full bg-bg rounded-lg px-3 py-2 text-xs font-mono outline-none focus:ring-1 focus:ring-primary/30 break-all"
          />
          <button
            onClick={load}
            disabled={!raw.trim()}
            className="px-4 py-2 rounded-full bg-primary text-white text-sm font-semibold disabled:opacity-40"
          >
            Load
          </button>
          {parseErr && <p className="text-xs text-coral">{parseErr}</p>}
        </div>
      ) : signing.isLoading ? (
        <Empty>Reading the account...</Empty>
      ) : signing.data ? (
        <CoSignPanel
          network={network}
          signing={signing.data}
          baseXdr={loaded.xdr}
          connected={address ?? ''}
          submit={submitCoSigned}
          onSubmitted={(h) => setDoneHash(h)}
        />
      ) : (
        <Empty>Could not read the account this transaction comes from.</Empty>
      )}
    </Card>
  )
}

export default function SharedControl() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text">Shared control</h2>
        <p className="text-xs text-text-secondary mt-1">
          Put your account under a quorum, so every move needs more than one signature. On-chain,
          your keys, no custodian.
        </p>
      </div>
      <SharedControlCard />
      <CoSignCard />
    </div>
  )
}
