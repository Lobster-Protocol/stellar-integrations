import OnChainActivityCard from '../components/OnChainActivityCard'
import RoutingFeedCard from '../components/RoutingFeedCard'

// Two real feeds: the broker routing decisions this session logged, and the
// connected wallet's recent on-chain operations from Horizon. Nothing seeded.
export default function Activity() {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-text">Activity</h2>
      <RoutingFeedCard />
      <OnChainActivityCard limit={20} />
    </div>
  )
}
