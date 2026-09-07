// Lead for the custody page: what the DFNS integration is and how it works, so a reader knows
// what the panels below are showing before they connect anything. It describes the custody model.
// The panels themselves report what is actually wired on this session.
export default function DfnsCustodyIntro() {
  return (
    <div>
      <h2 className="text-lg font-semibold text-text">Institutional custody through DFNS</h2>
      <p className="text-sm text-text-secondary mt-1 max-w-2xl leading-relaxed">
        The treasury is a DFNS wallet. Its signing key is split across DFNS servers with
        multi-party computation, so no single machine or person ever holds the whole key. Before a
        signature is released it runs through DFNS's policy engine: a small transfer can sign on its
        own, a larger one is held until a second person approves, and whoever started it cannot
        approve their own. Every signature, approval and transfer arrives here over a DFNS webhook,
        and the whole record exports as a hash-chained, MiCA-style audit file.
      </p>
    </div>
  )
}
