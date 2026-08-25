// Plain-language copy for the protocol terms the dashboard has to put on screen.
// Kept in one place so a term reads the same wherever it shows up, and so the
// wording can be reviewed without opening every component.

export type GlossaryKey =
  | 'trustline'
  | 'mpc'
  | 'custody'
  | 'policy'
  | 'approval'
  | 'ttl'
  | 'storageRent'
  | 'vault'
  | 'slippage'
  | 'stroop'
  | 'liveData'
  | 'factory'
  | 'contractId'
  | 'operation'
  | 'admin'
  | 'lpShares'

export const GLOSSARY: Record<GlossaryKey, string> = {
  trustline:
    "A one-time approval that lets your Stellar account hold a token. Until it's on, that token can't reach your account.",
  mpc: 'The signing key is split across several servers that have to cooperate to approve a payment. No single machine ever holds the whole key.',
  custody: 'Who controls the keys that can move the money.',
  policy: 'A rule checked before anything gets signed. For example: a person has to approve first.',
  approval: "A person signing off on a transaction before it's allowed through.",
  ttl: 'Soroban contracts pay rent for their on-chain storage. When the lease gets low it has to be topped up, or the data is archived and the contract stops working until it is restored.',
  storageRent:
    "XLM a contract prepays to keep its data alive on-chain. It's a network cost, not a fee paid to us.",
  vault: 'A smart contract that holds a liquidity position for you and keeps track of your share of it.',
  slippage:
    'The worst price you will accept. If the market moves past it before the swap settles, the swap is cancelled instead of filling at a bad price.',
  stroop: 'The smallest slice of XLM: one ten-millionth, 0.0000001 XLM.',
  liveData: 'Read straight from the Stellar network as you look at it, not a saved copy.',
  factory: 'The Lobster contract that creates vaults and keeps the list of them.',
  contractId: "A smart contract's on-chain address, the C... string it lives at.",
  operation: 'A single step inside a transaction: one payment, one swap, one trustline change. One transaction can bundle several.',
  admin: 'The account allowed to manage this contract, for example to change its settings.',
  lpShares: 'Your slice of a liquidity pool. Redeem them to take back your share of the two tokens in it.',
}
