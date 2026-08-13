// stellar amounts are exact 7-decimal strings. parse them to stroops with
// integer math, never Number(): a float multiply loses precision past 2^53
// stroops and could round a value just under a spend cap. reject anything that
// is not a plain non-negative decimal first. a negative or 0x value would slip
// under (or subtract from) a spend cap, and these caps are the last line of
// defense, so they must not parse a hostile field as given.
export function decimalToStroops(amount: string): bigint {
  // cap the fraction at 7 digits in the pattern itself: a longer fraction
  // gets rejected, never silently truncated down (rounding down is the
  // dangerous direction past a spend cap).
  if (!/^\d+(\.\d{1,7})?$/.test(amount)) {
    throw new Error(`not a valid stellar amount: ${amount}`)
  }
  const [whole, frac = ''] = amount.split('.')
  return BigInt(whole + frac.padEnd(7, '0'))
}

// inverse of decimalToStroops: render an i128 stroop count as an exact
// 7-decimal string. integer math only - a large soroban token balance would
// lose precision through Number(). used to show token balances Horizon can't
// see (a soroban-only asset like testnet USDC).
export function stroopsToDecimal(stroops: bigint): string {
  const neg = stroops < 0n
  const abs = neg ? -stroops : stroops
  const whole = abs / 10_000_000n
  const frac = (abs % 10_000_000n).toString().padStart(7, '0')
  return `${neg ? '-' : ''}${whole}.${frac}`
}
