// integer math: Number() loses precision past 2^53, and spend caps are checked
// against the result.
export function decimalToStroops(amount: string): bigint {
  // reject an over-precise fraction rather than truncate it; rounding down could
  // slip a value under a spend cap.
  if (!/^\d+(\.\d{1,7})?$/.test(amount)) {
    throw new Error(`not a valid stellar amount: ${amount}`)
  }
  const [whole, frac = ''] = amount.split('.')
  return BigInt(whole + frac.padEnd(7, '0'))
}

// integer math here too: a large soroban token balance would lose precision
// through Number().
export function stroopsToDecimal(stroops: bigint): string {
  const neg = stroops < 0n
  const abs = neg ? -stroops : stroops
  const whole = abs / 10_000_000n
  const frac = (abs % 10_000_000n).toString().padStart(7, '0')
  return `${neg ? '-' : ''}${whole}.${frac}`
}
