import { describe, it, expect } from 'vitest'

import { contractErrorCode } from '../read'

describe('contractErrorCode', () => {
  it('reads the panic number out of a simulation error', () => {
    const sim = 'HostError: Error(Contract, #3)\n\nEvent log (newest first):\n   0: [Diagnostic Event] contract:CAFG...'
    expect(contractErrorCode(new Error(sim))).toBe(3)
  })

  it('takes the form without a space too', () => {
    expect(contractErrorCode(new Error('Error(Contract,#14)'))).toBe(14)
  })

  it('is null when nothing panicked', () => {
    expect(contractErrorCode(new Error('transaction already submitted'))).toBeNull()
    expect(contractErrorCode('Error(Contract, #3)')).toBeNull()
  })
})
