import { useState } from 'react'

import { useWallet } from '../contexts/WalletContext'
import { useNetwork } from '../contexts/NetworkContext'
import { useAccountSigning } from '../integrations/stellar/use-account-signing'
import { isMultisig, requiredWeight, buildSetOptionsTx, submitClassic } from '../integrations/stellar/multisig'
import { Card, CardHead } from '../components/ui'
import CoSignPanel from '../components/CoSignPanel'
import { stellarExplorer } from '../utils/format'

// Native Stellar multisig ("shared control") is no longer something you set up
// here: the multisig we support is DFNS custody. This section only appears when
// an account already carries a quorum, and its one job is to turn it back off,
// dropping the extra signers and the threshold so a swap or a vault move stops
// needing a co-signature. Turning it off is itself a governance change on the
// account, so it needs the current quorum, gathered through the co-sign panel.

function short(key: string): string {
  return `${key.slice(0, 4)}...${key.slice(-4)}`
}

export default function SharedControl() {
  const { address } = useWallet()
  const { network } = useNetwork()
  const signing = useAccountSigning(network, address)
  const [revertXdr, setRevertXdr] = useState<string | null>(null)
  const [doneHash, setDoneHash] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [building, setBuilding] = useState(false)

  const data = signing.data
  // single-sig accounts have nothing to see: there is no on-ramp to a native
  // quorum any more, only this off-ramp for accounts that already have one.
  if (!address || signing.isLoading || !data || !isMultisig(data)) return null

  async function turnOff() {
    if (!address || !data) return
    setErr(null)
    setBuilding(true)
    try {
      // weight 0 removes a signer; bring the master key back to weight 1 and every
      // threshold to 1, so one signature authorises again.
      const drop = data.signers.filter((s) => s.key !== address).map((s) => ({ key: s.key, weight: 0 }))
      const xdr = await buildSetOptionsTx(network, address, {
        addSigners: drop,
        masterWeight: 1,
        threshold: 1,
      })
      setRevertXdr(xdr)
    } catch (e) {
      setErr(e instanceof Error ? e.message.split('\n')[0].slice(0, 180) : 'could not build the change')
    } finally {
      setBuilding(false)
    }
  }

  if (doneHash) {
    return (
      <Card>
        <CardHead
          title="Shared control turned off"
          note="This account is back to a single signature. Deposits, swaps and withdrawals no longer need a co-signer."
        />
        <a
          href={stellarExplorer(network, 'tx', doneHash)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary hover:underline font-mono break-all"
        >
          {doneHash}
        </a>
      </Card>
    )
  }

  return (
    <Card>
      <CardHead
        title="Shared control is on"
        note={`This account needs ${requiredWeight(data, 'med')} signatures for every move. If you did not mean to set up a native quorum, turn it back off here: multisig belongs in DFNS custody, not on your own key.`}
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

      {!revertXdr ? (
        <>
          <button
            onClick={turnOff}
            disabled={building}
            className="mt-3 w-full px-4 py-2.5 rounded-full bg-primary text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {building ? 'Building the change...' : 'Turn off shared control'}
          </button>
          <p className="text-[11px] text-text-muted mt-2">
            Turning it off changes the account's signers, which needs the same quorum: sign with this
            wallet, then with the other signer (or paste their signed copy). Once it lands, the account
            is single-sig again and the co-sign step disappears from swaps and deposits.
          </p>
          {err && <p className="text-xs text-coral break-words mt-2">{err}</p>}
        </>
      ) : (
        <div className="mt-3">
          <CoSignPanel
            network={network}
            signing={data}
            baseXdr={revertXdr}
            connected={address}
            submit={(xdr) => submitClassic(network, xdr)}
            onSubmitted={(h) => setDoneHash(h)}
          />
        </div>
      )}
    </Card>
  )
}
