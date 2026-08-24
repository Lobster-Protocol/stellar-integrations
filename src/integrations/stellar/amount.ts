// parse an exact 7-decimal amount to stroops with integer math: Number() loses
// precision past 2^53 near a spend cap, and these caps are the last line of
// defense. reject anything that is not a plain non-negative decimal.
export function decimalToStroops(amount: string): bigint {
  // reject an over-precise fraction rather than truncate it; rounding down could
  // slip a value under a spend cap.
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
