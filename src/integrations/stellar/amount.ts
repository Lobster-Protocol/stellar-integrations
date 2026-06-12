// stellar amounts are exact 7-decimal strings. parse them to stroops with
// integer math, never Number(): a float multiply loses precision past 2^53
// stroops and could round a value just under a spend cap.
export function decimalToStroops(amount: string): bigint {
  const [whole, frac = ''] = amount.split('.')
  return BigInt((whole || '0') + frac.padEnd(7, '0').slice(0, 7))
}
