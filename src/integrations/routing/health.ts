import { CONTRACTS, type Network } from '../../config/contracts'

export interface RoutingHealth {
  brokerEnabled: boolean
  brokerQuoteEnabled: boolean
  fallbackEnabled: boolean
  brokerEndpoint: string
}

export function getRoutingHealth(network: Network): RoutingHealth {
  const c = CONTRACTS[network]
  // a dashboard-set env var can carry a stray newline or spaces; trim so a
  // blank or whitespace value reads as no key rather than a live one.
  const partnerKey = import.meta.env.VITE_STELLAR_BROKER_PARTNER_KEY?.trim()
  return {
    // the trade rides the keyed trading socket; a quote is just a public GET.
    // so trading needs the key, quoting only needs the endpoint to be set.
    brokerEnabled: !!partnerKey && !!c.broker.endpoint,
    brokerQuoteEnabled: !!c.broker.endpoint,
    fallbackEnabled: !!c.soroswap.router,
    brokerEndpoint: c.broker.endpoint,
  }
}
