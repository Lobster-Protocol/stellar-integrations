import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

import { NetworkProvider, useNetwork } from '../NetworkContext'

function Shows() {
  return <span>{useNetwork().network}</span>
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('NetworkProvider', () => {
  it('opens the network a link names and stores it', () => {
    window.history.replaceState(null, '', '/positions?network=mainnet')
    render(<NetworkProvider><Shows /></NetworkProvider>)
    expect(screen.getByText('mainnet')).toBeInTheDocument()
    expect(localStorage.getItem('lob_network')).toBe('mainnet')
  })

  it('ignores an unknown network param', () => {
    localStorage.setItem('lob_network', 'mainnet')
    window.history.replaceState(null, '', '/?network=futurenet')
    render(<NetworkProvider><Shows /></NetworkProvider>)
    expect(screen.getByText('mainnet')).toBeInTheDocument()
  })

  it('starts on testnet with no link and nothing stored', () => {
    render(<NetworkProvider><Shows /></NetworkProvider>)
    expect(screen.getByText('testnet')).toBeInTheDocument()
  })
})
