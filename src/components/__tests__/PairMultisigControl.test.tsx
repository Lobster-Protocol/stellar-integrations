import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

import PairMultisigControl from '../PairMultisigControl'
import { OUR_STATIC_ADDRESSES } from '../../integrations/dfns/wallet-pair'

const { mockActiveProfile, mockWallets } = vi.hoisted(() => ({
  mockActiveProfile: vi.fn(),
  mockWallets: vi.fn(),
}))

vi.mock('../../integrations/dfns/use-profiles', () => ({
  useActiveProfile: () => mockActiveProfile(),
}))
vi.mock('../../integrations/dfns/hooks', () => ({
  useDfnsWallets: () => mockWallets(),
}))

// valid third-party accounts (asset issuers), never Lobster's own
const WALLET = 'GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA'
const GOOD = 'GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2'
const OURS = OUR_STATIC_ADDRESSES[0]

beforeEach(() => {
  localStorage.clear()
  // a client profile is active: not our demo, so ready is true
  mockActiveProfile.mockReturnValue({ id: 'client-x', kind: 'client' })
  mockWallets.mockReturnValue({ isSuccess: true, data: { items: [] } })
})

afterEach(cleanup)

function openForm() {
  fireEvent.click(screen.getByRole('button', { name: 'Pair a DFNS multisig wallet' }))
}

describe('PairMultisigControl', () => {
  it('opens the form from the trigger', () => {
    render(<PairMultisigControl address={WALLET} network="testnet" />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    openForm()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('refuses our own address and stores nothing', () => {
    render(<PairMultisigControl address={WALLET} network="testnet" />)
    openForm()
    fireEvent.change(screen.getByPlaceholderText('G... multisig account'), { target: { value: OURS } })
    fireEvent.click(screen.getByText('Save'))
    expect(screen.getByText(/Lobster address/)).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(localStorage.getItem('lob_wallet_pair')).toBeNull()
  })

  it('saves a valid pair and shows it as a labeled address', () => {
    render(<PairMultisigControl address={WALLET} network="testnet" />)
    openForm()
    fireEvent.change(screen.getByPlaceholderText('G... multisig account'), { target: { value: GOOD } })
    fireEvent.click(screen.getByText('Save'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('link').getAttribute('href')).toContain(GOOD)
  })

  it('fails closed while the demo wallet list is unresolved', () => {
    mockActiveProfile.mockReturnValue({ id: '__demo__', kind: 'demo' })
    mockWallets.mockReturnValue({ isSuccess: false, data: undefined })
    render(<PairMultisigControl address={WALLET} network="testnet" />)
    openForm()
    fireEvent.change(screen.getByPlaceholderText('G... multisig account'), { target: { value: GOOD } })
    fireEvent.click(screen.getByText('Save'))
    expect(screen.getByText(/Give it a second/)).toBeInTheDocument()
    expect(localStorage.getItem('lob_wallet_pair')).toBeNull()
  })
})
