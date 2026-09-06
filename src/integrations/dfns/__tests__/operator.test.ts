import { describe, it, expect, beforeEach } from 'vitest'

import { isOperator, operatorToken, operatorHeaders } from '../operator'
import { setActiveProfile, DEMO_PROFILE_ID } from '../profiles'

const KEY = 'lob_operator_token'

beforeEach(() => {
  localStorage.clear()
  // the operator token is resolved through the active profile; the demo carries the
  // pre-existing lob_operator_token key, so opt into the demo to exercise it.
  setActiveProfile(DEMO_PROFILE_ID)
})

describe('operator token', () => {
  it('reads nobody as an operator by default', () => {
    expect(isOperator()).toBe(false)
    expect(operatorToken()).toBeNull()
    expect(operatorHeaders()).toEqual({})
  })

  it('treats an empty or blank value as no token', () => {
    localStorage.setItem(KEY, '   ')
    expect(isOperator()).toBe(false)
    expect(operatorHeaders()).toEqual({})
  })

  it('sends a stored token as the operator header, trimmed', () => {
    // a value pasted from a dashboard field often carries a trailing newline
    localStorage.setItem(KEY, ' token-from-the-relay\n')
    expect(isOperator()).toBe(true)
    expect(operatorToken()).toBe('token-from-the-relay')
    expect(operatorHeaders()).toEqual({ 'x-lobster-operator-token': 'token-from-the-relay' })
  })
})
