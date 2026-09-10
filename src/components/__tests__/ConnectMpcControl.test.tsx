import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'

import ConnectMpcControl from '../ConnectMpcControl'

const { mockWallet, mockCustody, mockActiveProfile, mockProfiles, mockWallets } = vi.hoisted(() => ({
  mockWallet: vi.fn(),
  mockCustody: vi.fn(),
  mockActiveProfile: vi.fn(),
  mockProfiles: vi.fn(),
  mockWallets: vi.fn(),
}))

vi.mock('../../contexts/WalletContext', () => ({ useWallet: () => mockWallet() }))
vi.mock('../../contexts/CustodyContext', () => ({ useCustody: () => mockCustody() }))
vi.mock('../../contexts/NetworkContext', () => ({ useNetwork: () => ({ network: 'testnet' }) }))
vi.mock('../../integrations/dfns/use-profiles', () => ({ useActiveProfile: () => mockActiveProfile(), useProfiles: () => mockProfiles() }))
vi.mock('../../integrations/dfns/hooks', () => ({ useDfnsWallets: () => mockWallets() }))
vi.mock('../../integrations/dfns/profiles', () => ({ setSelectedWallet: vi.fn(), removeClientProfile: vi.fn(), setActiveProfile: vi.fn(), clearActiveProfile: vi.fn() }))
vi.mock('../ConnectRelayForm', () => ({ default: () => <div data-testid="relay-form" /> }))

const setMode = vi.fn()
const connectWalletConnect = vi.fn()

beforeEach(() => {
  setMode.mockReset()
  connectWalletConnect.mockReset()
  mockCustody.mockReturnValue({ mode: 'wallet-kit', dfnsAddress: null, setMode })
  mockActiveProfile.mockReturnValue(null)
  mockProfiles.mockReturnValue([])
  mockWallets.mockReturnValue({ data: undefined, isSuccess: false, isLoading: false, isError: false })
  mockWallet.mockReturnValue({ connectWalletConnect, walletConnectEnabled: true })
})

afterEach(cleanup)

function openPanel() {
  fireEvent.click(screen.getByRole('button', { name: 'Connect your DFNS MPC wallet' }))
}

describe('ConnectMpcControl', () => {
  it('opens the MPC panel from the + MPC trigger', () => {
    render(<ConnectMpcControl />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    openPanel()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Connect your DFNS MPC wallet')).toBeInTheDocument()
  })

  it('leads with WalletConnect and switches to the wallet-kit signer once it connects', async () => {
    connectWalletConnect.mockResolvedValue('GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2')
    render(<ConnectMpcControl />)
    openPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Connect with WalletConnect' }))
    expect(connectWalletConnect).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(setMode).toHaveBeenCalledWith('wallet-kit'))
  })

  it('does not switch mode when the WalletConnect modal is dismissed', async () => {
    connectWalletConnect.mockResolvedValue(null)
    render(<ConnectMpcControl />)
    openPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Connect with WalletConnect' }))
    await waitFor(() => expect(connectWalletConnect).toHaveBeenCalled())
    expect(setMode).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('falls back to the relay, expanded, when WalletConnect is off', () => {
    mockWallet.mockReturnValue({ connectWalletConnect, walletConnectEnabled: false })
    render(<ConnectMpcControl />)
    openPanel()
    expect(screen.queryByRole('button', { name: 'Connect with WalletConnect' })).not.toBeInTheDocument()
    expect(screen.getByText(/not enabled/i)).toBeInTheDocument()
    expect(screen.getByTestId('relay-form')).toBeInTheDocument()
  })
})
