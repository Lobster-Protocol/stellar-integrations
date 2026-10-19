const POINTS = [
  {
    head: 'Split key (MPC)',
    body: 'The treasury is a DFNS wallet. Its signing key is split across DFNS servers with multi-party computation, so no single machine or person can sign on its own.',
  },
  {
    head: 'Approval policy',
    body: "On the testnet demo, a transfer to an address on the treasury list goes through by itself. Anything else waits for a named approver, and whoever asked for it can't approve it.",
  },
  {
    head: 'Exportable log',
    body: 'Signatures, approvals and transfers show up below as they happen. Confirmed transactions and transfers download as a hash-chained JSON file in the MiCA record format.',
  },
]

export default function DfnsCustodyIntro() {
  return (
    <div>
      <h2 className="text-lg font-semibold text-text">Institutional custody through DFNS</h2>
      <p className="text-sm text-text-secondary mt-1 max-w-2xl leading-relaxed">
        DFNS holds the treasury key and signs with it; the dashboard never holds one.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {POINTS.map((b) => (
          <div key={b.head} className="rounded-2xl bg-primary/5 px-3 py-3">
            <p className="text-xs font-medium text-text">{b.head}</p>
            <p className="text-[11px] text-text-secondary mt-1 leading-relaxed">{b.body}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
