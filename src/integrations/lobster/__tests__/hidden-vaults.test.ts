import { describe, it, expect, beforeEach } from 'vitest'

import {
  hiddenVaults,
  hideVault,
  showVault,
  showAllVaults,
  partitionHidden,
} from '../hidden-vaults'

const A = 'GOWNERONE'
const B = 'GOWNERTWO'

describe('hidden vaults', () => {
  beforeEach(() => localStorage.clear())

  it('starts with nothing hidden', () => {
    expect(hiddenVaults('testnet', A)).toEqual([])
  })

  it('remembers a hidden vault and gives it back', () => {
    hideVault('testnet', A, 'CVAULT1')
    expect(hiddenVaults('testnet', A)).toEqual(['CVAULT1'])
  })

  it('does not hide the same vault twice', () => {
    hideVault('testnet', A, 'CVAULT1')
    hideVault('testnet', A, 'CVAULT1')
    expect(hiddenVaults('testnet', A)).toEqual(['CVAULT1'])
  })

  it('keeps each wallet and each network apart', () => {
    hideVault('testnet', A, 'CVAULT1')
    expect(hiddenVaults('testnet', B)).toEqual([])
    expect(hiddenVaults('mainnet', A)).toEqual([])
  })

  it('brings one back', () => {
    hideVault('testnet', A, 'CVAULT1')
    hideVault('testnet', A, 'CVAULT2')
    showVault('testnet', A, 'CVAULT1')
    expect(hiddenVaults('testnet', A)).toEqual(['CVAULT2'])
  })

  it('brings them all back', () => {
    hideVault('testnet', A, 'CVAULT1')
    hideVault('testnet', A, 'CVAULT2')
    showAllVaults('testnet', A)
    expect(hiddenVaults('testnet', A)).toEqual([])
  })

  it('survives a stored value it cannot read', () => {
    localStorage.setItem('lob_hidden_vaults_v1', 'not json')
    expect(hiddenVaults('testnet', A)).toEqual([])
    hideVault('testnet', A, 'CVAULT1')
    expect(hiddenVaults('testnet', A)).toEqual(['CVAULT1'])
  })

  it('ignores entries that are not a list of addresses', () => {
    localStorage.setItem(
      'lob_hidden_vaults_v1',
      JSON.stringify({ 'testnet:GOWNERONE': [1, 'CVAULT1', null] }),
    )
    expect(hiddenVaults('testnet', A)).toEqual(['CVAULT1'])
  })
})

describe('partitionHidden', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  const key = (i: { id: string }) => i.id

  it('keeps every item, on one side or the other', () => {
    const out = partitionHidden(items, ['b'], key)
    expect(out.visible.map(key)).toEqual(['a', 'c'])
    expect(out.hidden.map(key)).toEqual(['b'])
  })

  it('shows everything when nothing is hidden', () => {
    expect(partitionHidden(items, [], key).visible).toHaveLength(3)
  })

  it('ignores a hidden id that is no longer in the list', () => {
    const out = partitionHidden(items, ['zzz'], key)
    expect(out.visible).toHaveLength(3)
    expect(out.hidden).toHaveLength(0)
  })
})
