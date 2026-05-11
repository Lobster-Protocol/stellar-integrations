// Browser polyfills required before any third-party module loads.
// MUST be the first import in `main.tsx` — otherwise the Stellar SDK
// (and anything else that reaches for global `Buffer` at module init)
// runs against an undefined global and crashes.

import { Buffer } from 'buffer'

declare global {
  interface Window {
    Buffer: typeof Buffer
  }
}

if (typeof window !== 'undefined' && !window.Buffer) {
  window.Buffer = Buffer
}
