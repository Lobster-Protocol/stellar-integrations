// best-execution router health probe. cheap synchronous read of the broker
// partner key + endpoint config; returns whether the broker leg is enabled
// on the active network. ui uses it to grey out the broker badge and to
// fall straight through to the soroswap fallback when partnerKey is missing.

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
