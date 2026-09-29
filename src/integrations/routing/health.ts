import { CONTRACTS, type Network } from '../../config/contracts'

export interface RoutingHealth {
  brokerEnabled: boolean
  brokerQuoteEnabled: boolean
  fallbackEnabled: boolean
  brokerEndpoint: string
}

export function getRoutingHealth(network: Network): RoutingHealth {
  const c = CONTRACTS[network]
  // a dashboard-set env var can carry a stray newline, so whitespace alone is no key
  const partnerKey = import.meta.env.VITE_STELLAR_BROKER_PARTNER_KEY?.trim()
  // stellar broker only runs on mainnet
  const brokerOnNetwork = network === 'mainnet' && !!c.broker.endpoint
  return {
    // trading rides the keyed socket, while a quote is a public GET that needs no key
    brokerEnabled: !!partnerKey && brokerOnNetwork,
    brokerQuoteEnabled: brokerOnNetwork,
    fallbackEnabled: !!c.soroswap.router,
    brokerEndpoint: c.broker.endpoint,
  }
}
