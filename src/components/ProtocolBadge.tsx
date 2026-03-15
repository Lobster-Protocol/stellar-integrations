import { type Protocol, getProtocolColor, getProtocolLabel } from '../data/mock'

const ProtocolBadge = ({ protocol }: { protocol: Protocol }) => {
  const color = getProtocolColor(protocol)
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium"
      style={{ background: color + '15', color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {getProtocolLabel(protocol)}
    </span>
  )
}

export default ProtocolBadge
