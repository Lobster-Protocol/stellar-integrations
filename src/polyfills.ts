// imported first in main.tsx: the Stellar SDK reads the global Buffer at module init

import { Buffer } from 'buffer'

if (typeof window !== 'undefined' && !window.Buffer) {
  window.Buffer = Buffer
}
