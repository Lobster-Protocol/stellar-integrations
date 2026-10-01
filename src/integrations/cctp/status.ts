import { useEffect, useState } from 'react'

import type { IrisAttestation } from './iris'
import { directionOf, type TrackedTransfer } from './transfers'

// where a transfer stands, from what Circle says about its burn
export type TransferStatus =
  | { kind: 'waiting-circle'; delayReason: string | null }
  // on the way in: one signature on Stellar delivers it
  | { kind: 'ready-deliver' }
  // on the way out with forwarding: Circle mints on the EVM chain by itself
  | { kind: 'circle-minting' }
  // on the way out without forwarding, or when Circle's mint failed: the EVM wallet receives it
  | { kind: 'ready-receive'; circleFailed: boolean }
  | { kind: 'delivered' }

export function statusOf(t: TrackedTransfer, att: IrisAttestation | undefined): TransferStatus {
  if (t.stage === 'delivered') return { kind: 'delivered' }
  if (!att || att.state !== 'complete') {
    return { kind: 'waiting-circle', delayReason: att?.state === 'pending' ? att.delayReason : null }
  }
  if (directionOf(t) === 'to-stellar') return { kind: 'ready-deliver' }
  if (!t.forwarded) return { kind: 'ready-receive', circleFailed: false }
  if (circleMinted(att.forwardState)) return { kind: 'delivered' }
  if (att.forwardState === 'FAILED') return { kind: 'ready-receive', circleFailed: true }
  return { kind: 'circle-minting' }
}

// Circle walks a mint it does for you through PENDING, SENT, CONFIRMED and, much later,
// COMPLETE; from CONFIRMED its transaction is mined
export function circleMinted(forwardState: string | null | undefined): boolean {
  return forwardState === 'CONFIRMED' || forwardState === 'COMPLETE'
}

export type Tone = 'wait' | 'act' | 'done' | 'warn'

// the short line a list shows for a transfer, and whose move it is
export function statusLine(t: TrackedTransfer, s: TransferStatus): { text: string; tone: Tone } {
  switch (s.kind) {
    case 'waiting-circle':
      return s.delayReason
        ? { text: 'Circle is holding it', tone: 'warn' }
        : { text: 'Waiting for Circle to sign', tone: 'wait' }
    case 'ready-deliver':
      return { text: 'Signed by Circle: your Stellar wallet delivers it', tone: 'act' }
    case 'circle-minting':
      return { text: `Circle is minting it on ${t.chainName}`, tone: 'wait' }
    case 'ready-receive':
      return {
        text: s.circleFailed
          ? `Circle could not mint it: your EVM wallet receives it on ${t.chainName}`
          : `Signed by Circle: your EVM wallet receives it on ${t.chainName}`,
        tone: 'act',
      }
    case 'delivered':
      return { text: 'Arrived', tone: 'done' }
  }
}

// how long each kind of transfer usually takes, for the "expected" line
export function expectedDuration(t: TrackedTransfer): string {
  if (directionOf(t) === 'from-stellar') {
    return t.forwarded
      ? 'usually about a minute: Stellar settles in seconds, then Circle signs and mints'
      : 'Circle usually signs within a minute: Stellar settles in seconds'
  }
  return t.finality === 'fast'
    ? 'a fast transfer usually takes under a minute'
    : `a standard transfer waits for ${t.chainName} to finalise, usually 15 to 30 minutes`
}

// a clock that moves, for elapsed times
export function useNow(active = true, everyMs = 1_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(id)
  }, [active, everyMs])
  return now
}

export function elapsed(fromMs: number, toMs: number): string {
  const s = Math.max(0, Math.round((toMs - fromMs) / 1000))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, '0')} s`
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`
}

export function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
