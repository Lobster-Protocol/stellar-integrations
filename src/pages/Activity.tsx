import OnChainActivityCard from '../components/OnChainActivityCard'
import RoutingFeedCard from '../components/RoutingFeedCard'

export default function Activity() {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-text">Activity</h2>
      <RoutingFeedCard />
      <OnChainActivityCard limit={20} />
    </div>
  )
}
