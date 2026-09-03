import { describe, it, expect, beforeEach } from 'vitest'

import { isOperator, operatorToken, operatorHeaders } from '../operator'

const KEY = 'lob_operator_token'

beforeEach(() => {
  localStorage.clear()
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
