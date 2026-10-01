import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const { kitSign } = vi.hoisted(() => ({ kitSign: vi.fn() }))

vi.mock('@creit-tech/stellar-wallets-kit', () => ({
  StellarWalletsKit: {
    init: vi.fn(),
    setNetwork: vi.fn(),
    setWallet: vi.fn(),
    fetchAddress: vi.fn(),
    authModal: vi.fn(),
    disconnect: vi.fn(() => Promise.resolve()),
    getNetwork: vi.fn(() => Promise.resolve({ networkPassphrase: 'Test SDF Network ; September 2015' })),
    signTransaction: kitSign,
  },
  Networks: { PUBLIC: 'Public Global Stellar Network ; September 2015', TESTNET: 'Test SDF Network ; September 2015' },
}))
vi.mock('@creit-tech/stellar-wallets-kit/modules/freighter', () => ({ FreighterModule: class {} }))
vi.mock('@creit-tech/stellar-wallets-kit/modules/xbull', () => ({ xBullModule: class {} }))
vi.mock('@creit-tech/stellar-wallets-kit/modules/albedo', () => ({ AlbedoModule: class {}, ALBEDO_ID: 'albedo' }))
vi.mock('@creit-tech/stellar-wallets-kit/modules/lobstr', () => ({ LobstrModule: class {} }))
vi.mock('@creit-tech/stellar-wallets-kit/modules/wallet-connect', () => ({
  WalletConnectModule: class {},
  WalletConnectTargetChain: { PUBLIC: 'stellar:pubnet', TESTNET: 'stellar:testnet' },
  WALLET_CONNECT_ID: 'wallet_connect',
}))

import { WalletProvider, useWallet } from '../WalletContext'
import { NetworkProvider } from '../NetworkContext'
import { ToastProvider } from '../ToastContext'
import { walletKitSigner } from '../../integrations/signer/wallet-kit-signer'

const VIEWED = 'GA3FDPNGWE7T2ANXNB5LNPRLZMC2LBYJFO2VVKW7DRUZTGNIKZDKOXCS'
const OWN = 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU'

function Probe() {
  const { address, viewing, view, stopViewing } = useWallet()
  return (
    <>
      <span data-testid="address">{address ?? 'none'}</span>
      <span data-testid="viewing">{viewing ?? 'none'}</span>
      <button onClick={() => view(VIEWED)}>view</button>
      <button onClick={stopViewing}>leave</button>
    </>
  )
}

function mount() {
  return render(
    <ToastProvider>
      <NetworkProvider>
        <WalletProvider>
          <Probe />
        </WalletProvider>
      </NetworkProvider>
    </ToastProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  kitSign.mockReset()
})

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('read-only view', () => {
  it('reads the account a link names, over the connected wallet, and keeps the kit from signing', async () => {
    localStorage.setItem('lob_addr', OWN)
    window.history.replaceState(null, '', `/positions?view=${VIEWED}`)
    mount()
    expect(screen.getByTestId('address')).toHaveTextContent(VIEWED)
    expect(screen.getByTestId('viewing')).toHaveTextContent(VIEWED)
    await expect(
      walletKitSigner.signTransaction('RAW', { networkPassphrase: 'Test SDF Network ; September 2015', address: VIEWED }),
    ).rejects.toThrow(/read-only view/)
    expect(kitSign).not.toHaveBeenCalled()
  })

  it('goes back to the wallet when the view is left, and a reload of the same url stays out of it', () => {
    localStorage.setItem('lob_addr', OWN)
    window.history.replaceState(null, '', `/?network=mainnet&view=${VIEWED}`)
    mount()
    fireEvent.click(screen.getByText('leave'))
    expect(screen.getByTestId('address')).toHaveTextContent(OWN)
    expect(screen.getByTestId('viewing')).toHaveTextContent('none')
    expect(window.location.search).toBe('?network=mainnet')
    expect(sessionStorage.getItem('lob_view')).toBeNull()
  })

  it('opens a view from the page, without a link', () => {
    mount()
    expect(screen.getByTestId('address')).toHaveTextContent('none')
    fireEvent.click(screen.getByText('view'))
    expect(screen.getByTestId('address')).toHaveTextContent(VIEWED)
  })

  it('ignores a view param that is not an account', () => {
    window.history.replaceState(null, '', '/?view=CBEWCQWMKYRBHN2H6GIEYQS4UACN3DHC3KUXHX5F3AOZAKCG5VI7WGQ4')
    mount()
    expect(screen.getByTestId('viewing')).toHaveTextContent('none')
    expect(screen.getByTestId('address')).toHaveTextContent('none')
  })
})
