import { StellarBrokerClient } from '@stellar-broker/client'

let client: StellarBrokerClient | null = null
let connecting: Promise<StellarBrokerClient> | null = null

export async function getBrokerClient(): Promise<StellarBrokerClient> {
  if (client && client.status !== 'disconnected') return client
  if (connecting) return connecting
  const partnerKey = import.meta.env.VITE_STELLAR_BROKER_PARTNER_KEY
  if (!partnerKey) throw new Error('VITE_STELLAR_BROKER_PARTNER_KEY missing')
  client = new StellarBrokerClient({ partnerKey })
  connecting = client.connect()
  try {
    return await connecting
  } catch (err) {
    client = null
    throw err
  } finally {
    connecting = null
  }
}

export function disposeBrokerClient(): void {
  client?.close()
  client = null
  connecting = null
}
