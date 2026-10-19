import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import VaultFlowChart from '../VaultFlowChart'
import { vaultFlowSeries, type VaultMove } from '../../integrations/lobster/vault-flows'

const VAULT = 'CVAULT1'
const at = (iso: string) => Date.parse(iso)
const units = (n: number) => BigInt(n) * 10_000_000n

// 1200 LOBS put in and left there, 500 XLM put in and later taken back out.
// more traffic on LOBS puts it first.
const moves: VaultMove[] = [
  { ts: at('2026-07-04T09:00:00Z'), vault: VAULT, code: 'XLM', amount: units(500) },
  { ts: at('2026-07-04T09:00:00Z'), vault: VAULT, code: 'LOBS', amount: units(1200) },
  { ts: at('2026-08-27T14:00:00Z'), vault: VAULT, code: 'XLM', amount: units(-500) },
]

const series = vaultFlowSeries(moves, VAULT)!

describe('VaultFlowChart', () => {
  it('names both tokens and their running total', () => {
    render(<VaultFlowChart series={series} complete />)
    expect(screen.getByText('XLM')).toBeInTheDocument()
    expect(screen.getByText('LOBS')).toBeInTheDocument()
    expect(screen.getByText('+1,200.00')).toBeInTheDocument()
    // all the XLM came back out
    expect(screen.getByText('0.00')).toBeInTheDocument()
  })

  it('gives each chart a label a screen reader can read', () => {
    render(<VaultFlowChart series={series} complete />)
    expect(
      screen.getByLabelText(/XLM moved into this vault over time, less what was taken back/),
    ).toBeInTheDocument()
  })

  it('shows the numbers behind each chart', () => {
    render(<VaultFlowChart series={series} complete />)
    for (const toggle of screen.getAllByRole('button', { name: 'Show numbers' })) {
      fireEvent.click(toggle)
    }
    expect(screen.getByText('Net XLM')).toBeInTheDocument()
    expect(screen.getByText('Net LOBS')).toBeInTheDocument()
    expect(screen.getByText('500.00')).toBeInTheDocument()
  })

  it('separates what went in from what came back', () => {
    render(<VaultFlowChart series={series} complete />)
    expect(screen.getByText(/in 500\.00, back 500\.00/)).toBeInTheDocument()
    expect(screen.getByText(/in 1,200\.00, back 0\.00/)).toBeInTheDocument()
  })

  it('says the line is not a return', () => {
    render(<VaultFlowChart series={series} complete />)
    expect(screen.getByText(/This is not a return/)).toBeInTheDocument()
  })

  it('flags a partial history', () => {
    const { rerender } = render(<VaultFlowChart series={series} complete />)
    expect(screen.queryByText(/starts partway through/)).not.toBeInTheDocument()
    rerender(<VaultFlowChart series={series} complete={false} />)
    expect(screen.getByText(/starts partway through/)).toBeInTheDocument()
  })
})
