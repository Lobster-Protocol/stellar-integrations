// Public surface of the Allbridge integration. Importers should use this
// module rather than reaching into the individual files.

export type {
  BridgeRequest,
  BridgeQuote,
  BridgeSubmissionResult,
  BridgeStatus,
  BridgeEvent,
  EvmSourceChain,
} from './types'
export { BridgeRequestSchema, stellarAccountIdRegex } from './types'

export { getAllbridgeSdk } from './client'

export {
  hasTrustline,
  buildTrustlineXdr,
  submitSignedXdr,
  STELLAR_TIMEOUT_SECONDS,
} from './trustline'

export { resolveUsdc, quoteBridge, buildBridgeTx } from './bridge'

export type { ArbDispatch, ArbLeg, ArbCycle } from './arb-reserve'
export {
  ArbDispatchSchema,
  quoteReturnLeg,
  buildReturnLegTx,
  buildOutboundLegTx,
} from './arb-reserve'
