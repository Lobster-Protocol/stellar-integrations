// Lead for the custody page: what the DFNS integration is and how it works, so a reader knows
// what the panels below are showing before they connect anything. It describes the custody model.
// The panels themselves report what is actually wired on this session.
// Split into three beats because the single paragraph it replaced was seven lines of prose that
// nobody read to the end, and the three ideas in it are independent.
const BEATS = [
  {
    head: 'No one holds the whole key',
    body: 'The treasury is a DFNS wallet. Its signing key is split across DFNS servers with multi-party computation, so no single machine or person can sign on its own.',
  },
  {
    head: 'A rule runs before every signature',
    body: 'A small transfer can go through by itself. A larger one waits for a named approver, and whoever asked for it is not allowed to approve it.',
  },
  {
    head: 'The trail is exportable',
    body: 'Signatures, approvals and transfers land below as they happen. The whole record downloads as a hash-chained file in the MiCA record shape.',
  },
]

export default function DfnsCustodyIntro() {
  return (
    <div>
      <h2 className="text-lg font-semibold text-text">Institutional custody through DFNS</h2>
      <p className="text-sm text-text-secondary mt-1 max-w-2xl leading-relaxed">
        Custody that an institution can sign off on, without the dashboard ever holding a key.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {BEATS.map((b) => (
          <div key={b.head} className="rounded-2xl bg-primary/5 px-3 py-3">
            <p className="text-xs font-medium text-text">{b.head}</p>
            <p className="text-[11px] text-text-secondary mt-1 leading-relaxed">{b.body}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
