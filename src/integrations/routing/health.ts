import { CONTRACTS, type Network } from '../../config/contracts'

export interface RoutingHealth {
  brokerQuoteEnabled: boolean
  fallbackEnabled: boolean
  brokerEndpoint: string
}

export function getRoutingHealth(network: Network): RoutingHealth {
  const c = CONTRACTS[network]
  return {
    // a quote is a public GET that needs no key. stellar broker only runs on mainnet
    brokerQuoteEnabled: network === 'mainnet' && !!c.broker.endpoint,
    fallbackEnabled: !!c.soroswap.router,
    brokerEndpoint: c.broker.endpoint,
  }
}
