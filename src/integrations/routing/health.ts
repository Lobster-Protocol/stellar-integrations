import { CONTRACTS, type Network } from '../../config/contracts'

export interface RoutingHealth {
  brokerEnabled: boolean
  fallbackEnabled: boolean
  brokerEndpoint: string
}

export function getRoutingHealth(network: Network): RoutingHealth {
  const c = CONTRACTS[network]
  const partnerKey = import.meta.env.VITE_STELLAR_BROKER_PARTNER_KEY
  return {
    brokerEnabled: !!partnerKey && !!c.broker.endpoint,
    fallbackEnabled: !!c.soroswap.router,
    brokerEndpoint: c.broker.endpoint,
  }
}
