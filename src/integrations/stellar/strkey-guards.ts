import { StrKey } from '@stellar/stellar-sdk'

export class InvalidStellarIdError extends Error {
  constructor(kind: 'contract' | 'account', value: string) {
    super(`invalid stellar ${kind} id: ${value}`)
    this.name = 'InvalidStellarIdError'
  }
}

export function assertContractId(value: string | null | undefined): string {
  if (!value || !StrKey.isValidContract(value)) {
    throw new InvalidStellarIdError('contract', value ?? '')
  }
  return value
}

export function assertAccountId(value: string | null | undefined): string {
  if (!value || !StrKey.isValidEd25519PublicKey(value)) {
    throw new InvalidStellarIdError('account', value ?? '')
  }
  return value
}

export function isContractId(value: string | null | undefined): boolean {
  return !!value && StrKey.isValidContract(value)
}

export function isAccountId(value: string | null | undefined): boolean {
  return !!value && StrKey.isValidEd25519PublicKey(value)
}
