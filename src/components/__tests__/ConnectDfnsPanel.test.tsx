import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import ConnectDfnsPanel from '../ConnectDfnsPanel'

// the test env sets VITE_LOBSTER_API_URL, so the demo profile is present. these
// cover the non-network parts: the switcher and the connect form gating.

beforeEach(() => {
  localStorage.clear()
})

describe('ConnectDfnsPanel', () => {
  it('lists the demo profile as a testnet sandbox, not active by default', () => {
    render(<ConnectDfnsPanel />)
    expect(screen.getByText('Testnet sandbox')).toBeInTheDocument()
    // the demo is opt-in now: its "you are on the demo" note only shows once picked,
    // never by default, so a client is never silently on our org.
    expect(screen.queryByText(/shared sandbox, not your custody/)).not.toBeInTheDocument()
  })

  it('shows the demo note only after the operator explicitly picks the demo', () => {
    render(<ConnectDfnsPanel />)
    fireEvent.click(screen.getByRole('button', { name: /Lobster demo/ }))
    expect(screen.getByText(/shared sandbox, not your custody/)).toBeInTheDocument()
  })

  it('opens the connect form with the trust warning and a save that waits on a check', () => {
    render(<ConnectDfnsPanel />)
    fireEvent.click(screen.getByRole('button', { name: /Connect a DFNS relay/ }))
    expect(screen.getByText(/Enter only a relay you run/)).toBeInTheDocument()
    expect(screen.getByText(/no key to paste here/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Save profile$/ })).toBeDisabled()
  })
})
