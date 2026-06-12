// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { createWalletMock, listWalletsMock } = vi.hoisted(() => ({
  createWalletMock: vi.fn(),
  listWalletsMock: vi.fn(),
}))

vi.mock('../dfns/client', () => ({
  getDfnsClient: () => ({
    wallets: {
      createWallet: createWalletMock,
      listWallets: listWalletsMock,
    },
  }),
}))

import { createStellarWallet, listWallets } from '../dfns/wallets'

beforeEach(() => {
  createWalletMock.mockReset()
  listWalletsMock.mockReset()
})

describe('createStellarWallet', () => {
  it('forwards the name and network into the body', async () => {
    createWalletMock.mockResolvedValueOnce({
      id: 'w-1',
      address: 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU',
      name: 'lobster-testnet-1',
      network: 'StellarTestnet',
    })
    const r = await createStellarWallet('lobster-testnet-1', 'StellarTestnet')
    expect(createWalletMock).toHaveBeenCalledWith({
      body: { network: 'StellarTestnet', name: 'lobster-testnet-1' },
    })
    expect(r.id).toBe('w-1')
  })

  it('returns the summary even when optional fields are missing from the response', async () => {
    createWalletMock.mockResolvedValueOnce({ id: 'w-2' })
    const r = await createStellarWallet('x', 'Stellar')
    expect(r).toEqual({ id: 'w-2', address: '', name: '', network: '' })
  })
})

describe('listWallets', () => {
  it('returns the mapped items array', async () => {
    listWalletsMock.mockResolvedValueOnce({
      items: [
        { id: 'w-1', address: 'GA1', name: 'a', network: 'StellarTestnet' },
        { id: 'w-2', address: 'GA2', name: 'b', network: 'Stellar' },
      ],
    })
    const items = await listWallets()
    expect(items).toHaveLength(2)
    expect(items[0].id).toBe('w-1')
  })

  it('handles an empty items array', async () => {
    listWalletsMock.mockResolvedValueOnce({ items: [] })
    const items = await listWallets()
    expect(items).toEqual([])
  })

  it('handles an undefined items field', async () => {
    listWalletsMock.mockResolvedValueOnce({})
    const items = await listWallets()
    expect(items).toEqual([])
  })
})

