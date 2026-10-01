// never hardcode a C or G address elsewhere, import it from here

export type Network = 'testnet' | 'mainnet'

// `asset` is the broker-format id: 'xlm', 'CODE-ISSUER' for a classic asset, or a
// bare SAC id on testnet, where the broker is skipped; brokerAssetToSac maps each to a SAC
export interface SwapToken {
  code: string
  asset: string
}

interface NetworkContracts {
  tokens: {
    xlmSac: string
    usdcSac: string
    // the classic issuer, not the SAC: for changeTrust and account.balances[].asset_issuer
    usdcIssuer: string
  }
  // on top of XLM and USDC, only tokens whose Soroswap pool actually fills, so the
  // selector never offers a dead pair
  extraSwapTokens: SwapToken[]
  // the Lobster classic token; issuer is empty off testnet
  lobsAsset: { code: string; issuer: string }
  allbridge: {
    bridge: string
    usdcPool: string
  }
  // Circle CCTP V2, what the USDC bridge runs on
  cctp: {
    tokenMessengerMinter: string
    messageTransmitter: string
    // a burn names its mint recipient as a contract id, so a G account can only
    // be paid through this one: it mints to itself, then transfers
    forwarder: string
    // on testnet this is Circle's test USDC, not tokens.usdcSac (Soroswap's)
    usdcSac: string
    usdcIssuer: string
  }
  soroswap: {
    factory: string
    router: string
  }
  aquarius: {
    router: string
  }
  broker: {
    // https origin; the SDK upgrades the underlying WebSocket itself.
    endpoint: string
    // the broker does not publish its router contract id, so this stays empty
    router: string
  }
  lobster: {
    factory: string
    // a wasm code hash, not an address
    wasmHash: string
    // simulation source for anonymous reads
    readSource: string
  }
  // faucet for funding fresh accounts. empty on mainnet, no faucet there.
  friendbot: string
}

const mainnet: NetworkContracts = {
  tokens: {
    xlmSac: 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA',
    usdcSac: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
    usdcIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  },
  // yXLM, PYUSD, BTC and ETH are left out: no usable Soroswap pool on mainnet
  extraSwapTokens: [
    { code: 'EURC', asset: 'EURC-GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2' },
    { code: 'AQUA', asset: 'AQUA-GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA' },
    { code: 'SHX', asset: 'SHX-GDSTRSHXHGJ7ZIVRBXEYE5Q74XUVCUSEKEBR7UCHEUUEK72N7I7KJ6JH' },
    { code: 'BLND', asset: 'BLND-GDJEHTBE6ZHUXSWFI642DCGLUOECLHPF3KSXHPXTSTJ7E3JF6MQ5EZYY' },
    { code: 'KALE', asset: 'KALE-GBDVX4VELCDSQ54KQJYTNHXAHFLBCA77ZY2USQBM4CSHTTV7DME7KALE' },
  ],
  lobsAsset: { code: 'LOBS', issuer: '' },
  allbridge: {
    bridge: 'CBQ6GW7QCFFE252QEVENUNG45KYHHBRO4IZIWFJOXEFANHPQUXX5NFWV',
    usdcPool: 'CAOTMWRKNMV5GWSVOMWCTCM5ZZFEQFUSWNLCZXA2KAXD4YG5A4DIPNFT',
  },
  cctp: {
    tokenMessengerMinter: 'CAE2G5Z77UP7GYPYGFOWFGW7C7J6I4YP2AFGSADRKQY62SYUFLPNFTXL',
    messageTransmitter: 'CACMENFFJPJMSDAJQLX4R7K3SFZIW2LJSE3R2UMLGSWHFHS353FVXAZV',
    forwarder: 'CBZL2IH7F6BIDAA3WBNXYKIXSATJGMSW7K5P5MJ6STX5RXN47TZJDF5T',
    usdcSac: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
    usdcIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  },
  soroswap: {
    factory: 'CA4HEQTL2WPEUYKYKCDOHCDNIV4QHNJ7EL4J4NQ6VADP7SYHVRYZ7AW2',
    router: 'CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH',
  },
  aquarius: {
    router: 'CBQDHNBFBZYE4MKPWBSJOPIYLW4SFSXAXUTSXJN76GNKYVYPCKWC6QUK',
  },
  broker: {
    endpoint: 'https://api.stellar.broker',
    router: '',
  },
  lobster: {
    // admin is the DFNS treasury. wasmHash is the Soroswap-only pool the factory
    // deploys per vault
    factory: 'CAFGQVKFCZITN7UJUOIJPMULGZRUR7RXG6DAYJ2VBGIGFWHHFGR6MCR5',
    wasmHash: 'a72a67ac4b9fa0ad561032d8d433d4da0024100cdb27f9098cb89997243b8382',
    // all-zero account: a read-only sim needs no funds
    readSource: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  },
  friendbot: '',
}

const testnet: NetworkContracts = {
  // Aquarius and Allbridge are mainnet-only, so their ids stay empty here
  tokens: {
    xlmSac: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
    usdcSac: 'CB3TLW74NBIOT3BUWOZ3TUM6RFDF6A4GVIRUQRQZABG5KPOUL4JJOV2F',
    usdcIssuer: '',
  },
  // AQUA and the rest have no Soroswap pool on testnet
  extraSwapTokens: [
    { code: 'EURC', asset: 'CBQDUWBOHS7P4TZIJ3KUPUZQOWMKJC6CQPPFEONSV3BH4X27YVEXWNOT' },
    { code: 'XTAR', asset: 'CCZGLAUBDKJSQK72QOZHVU7CUWKW45OZWYWCLL27AEK74U2OIBK6LXF2' },
    { code: 'XRP', asset: 'CDDIA6HYANLPMDKBVQRIIXY3NA6S3TMHZFJUNPMBEJGZ5JSHN3E2TAUI' },
  ],
  lobsAsset: { code: 'LOBS', issuer: 'GBYIQEC7OMW2BV4PFL4R6GCBN32ALIEAEYDV7MIWPRGJGEP5M7UMWVCB' },
  allbridge: { bridge: '', usdcPool: '' },
  cctp: {
    tokenMessengerMinter: 'CDNG7HXAPBWICI2E3AUBP3YZWZELJLYSB6F5CC7WLDTLTHVM74SLRTHP',
    messageTransmitter: 'CBJ6MTCKKZG73PMDZCJMSFRD7DQEMI4FKDH7CGDSV4W6FHCRBCQAVVJY',
    forwarder: 'CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ',
    usdcSac: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
    usdcIssuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  },
  soroswap: {
    factory: 'CDP3HMUH6SMS3S7NPGNDJLULCOXXEPSHY4JKUKMBNQMATHDHWXRRJTBY',
    router: 'CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD',
  },
  aquarius: { router: '' },
  broker: { endpoint: 'https://api.stellar.broker', router: '' },
  lobster: {
    factory: 'CACIPDGSEGB3C5FHINR3S5V6F7BMVH5IWVQ2U3BUHHTP4BVSRRPE2LXO',
    wasmHash: '83333138aa55f439af3168736ad8a1aeab0cae0c0492ba305f38c2dffdd17563',
    readSource: 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU',
  },
  friendbot: 'https://friendbot.stellar.org',
}

export const CONTRACTS: Record<Network, NetworkContracts> = { mainnet, testnet }

// the probe can override this with MONITOR_FRONTEND_URL
export const FRONTEND_URL = 'https://stellar-instit.lobster-protocol.com'

// USDC is classic on mainnet and a soroban token on testnet, the split
// brokerAssetToSac maps back
export function swapTokensFor(network: Network): SwapToken[] {
  const t = CONTRACTS[network].tokens
  const usdc: SwapToken = {
    code: 'USDC',
    asset: t.usdcIssuer ? `USDC-${t.usdcIssuer}` : t.usdcSac,
  }
  return [{ code: 'XLM', asset: 'xlm' }, usdc, ...CONTRACTS[network].extraSwapTokens]
}

// chains the Allbridge SDK is built with, mainnet only
export type EvmChain = 'ETH' | 'ARB' | 'BSC'

// used when no *_RPC env override is set; Allbridge's SDK needs one per EVM chain
export const EVM_RPC_FALLBACK: Record<EvmChain, string> = {
  ETH: 'https://ethereum-rpc.publicnode.com',
  ARB: 'https://arbitrum-one-rpc.publicnode.com',
  BSC: 'https://bsc-rpc.publicnode.com',
}

// the SDK version we ship has allbridgecoreapi.net baked in, which doesn't
// resolve, so this is passed at construction
export const ALLBRIDGE_CORE_API = 'https://api.core.allbridge.io'

// Circle's number for Stellar
export const STELLAR_CCTP_DOMAIN = 27

// fast pays a few bps and lands in about a minute. standard is free but waits
// for finality, usually 15 to 30 min. Circle keys its fee table by these.
export const CCTP_FINALITY = { fast: 1000, standard: 2000 } as const
export type CctpFinality = keyof typeof CCTP_FINALITY

// Circle's attestation service. Nothing lands on Stellar until it has signed the burn.
export const IRIS_BASE: Record<Network, string> = {
  testnet: 'https://iris-api-sandbox.circle.com',
  mainnet: 'https://iris-api.circle.com',
}

// an EVM chain the bridge carries USDC from, and back to. `domain` is Circle's
// number for the chain, `chainId` the EVM one wagmi switches to
export interface CctpSourceChain {
  key: string
  name: string
  domain: number
  chainId: number
  usdc: `0x${string}`
  tokenMessenger: `0x${string}`
  messageTransmitter: `0x${string}`
  rpcFallback: string
  // tried when rpcFallback fails; publicnode turns away receipts more than a few
  // hours old on Base and Arbitrum mainnet, and a burn finished later is one
  rpcArchive: string
  explorerTx: (hash: string) => string
}

// Circle deploys V2 at the same address on every chain of a network
const CCTP_TM_MAINNET = '0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d' as const
const CCTP_MT_MAINNET = '0x81D40F21F12A8F0E3252Bccb954D722d4c464B64' as const
const CCTP_TM_TESTNET = '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA' as const
const CCTP_MT_TESTNET = '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275' as const

// Base first, it has the cheapest gas
const cctpMainnetChains: CctpSourceChain[] = [
  {
    key: 'BASE',
    name: 'Base',
    domain: 6,
    chainId: 8453,
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    tokenMessenger: CCTP_TM_MAINNET,
    messageTransmitter: CCTP_MT_MAINNET,
    rpcFallback: 'https://base-rpc.publicnode.com',
    rpcArchive: 'https://mainnet.base.org',
    explorerTx: (h) => `https://basescan.org/tx/${h}`,
  },
  {
    key: 'ARB',
    name: 'Arbitrum',
    domain: 3,
    chainId: 42161,
    usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    tokenMessenger: CCTP_TM_MAINNET,
    messageTransmitter: CCTP_MT_MAINNET,
    rpcFallback: 'https://arbitrum-one-rpc.publicnode.com',
    rpcArchive: 'https://arb1.arbitrum.io/rpc',
    explorerTx: (h) => `https://arbiscan.io/tx/${h}`,
  },
  {
    key: 'ETH',
    name: 'Ethereum',
    domain: 0,
    chainId: 1,
    usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    tokenMessenger: CCTP_TM_MAINNET,
    messageTransmitter: CCTP_MT_MAINNET,
    rpcFallback: 'https://ethereum-rpc.publicnode.com',
    rpcArchive: 'https://eth.drpc.org',
    explorerTx: (h) => `https://etherscan.io/tx/${h}`,
  },
]

// Sepolia testnets, where Circle's faucet hands out test USDC
const cctpTestnetChains: CctpSourceChain[] = [
  {
    key: 'BASE',
    name: 'Base Sepolia',
    domain: 6,
    chainId: 84532,
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    tokenMessenger: CCTP_TM_TESTNET,
    messageTransmitter: CCTP_MT_TESTNET,
    rpcFallback: 'https://base-sepolia-rpc.publicnode.com',
    rpcArchive: 'https://sepolia.base.org',
    explorerTx: (h) => `https://sepolia.basescan.org/tx/${h}`,
  },
  {
    key: 'ARB',
    name: 'Arbitrum Sepolia',
    domain: 3,
    chainId: 421614,
    usdc: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
    tokenMessenger: CCTP_TM_TESTNET,
    messageTransmitter: CCTP_MT_TESTNET,
    rpcFallback: 'https://arbitrum-sepolia-rpc.publicnode.com',
    rpcArchive: 'https://sepolia-rollup.arbitrum.io/rpc',
    explorerTx: (h) => `https://sepolia.arbiscan.io/tx/${h}`,
  },
  {
    key: 'ETH',
    name: 'Ethereum Sepolia',
    domain: 0,
    chainId: 11155111,
    usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    tokenMessenger: CCTP_TM_TESTNET,
    messageTransmitter: CCTP_MT_TESTNET,
    rpcFallback: 'https://ethereum-sepolia-rpc.publicnode.com',
    rpcArchive: 'https://1rpc.io/sepolia',
    explorerTx: (h) => `https://sepolia.etherscan.io/tx/${h}`,
  },
]

export const CCTP_SOURCE_CHAINS: Record<Network, CctpSourceChain[]> = {
  testnet: cctpTestnetChains,
  mainnet: cctpMainnetChains,
}

export function cctpChainsFor(network: Network): CctpSourceChain[] {
  return CCTP_SOURCE_CHAINS[network]
}

// throws rather than fall back: a fallback would burn on the wrong chain
export function cctpChain(network: Network, key: string): CctpSourceChain {
  const found = CCTP_SOURCE_CHAINS[network].find((c) => c.key === key)
  if (!found) throw new Error(`no CCTP source chain '${key}' on ${network}`)
  return found
}

// 6 on the EVM side and in Circle's messages, 7 on Stellar. On the way in the
// contract converts; on the way out the amount typed is scaled to Stellar's units
export const CCTP_EVM_USDC_DECIMALS = 6
export const CCTP_STELLAR_USDC_DECIMALS = 7

// where /bridges sends an asset or a chain that CCTP doesn't carry
export const BRIDGE_FALLBACK_LINKS = {
  allbridgeCore: 'https://core.allbridge.io',
  allbridgeClassic: 'https://app.allbridge.io',
  stellarx: 'https://www.stellarx.com',
  aquarius: 'https://aqua.network',
  circleFaucet: 'https://faucet.circle.com',
  stellarAnchors: 'https://anchors.stellar.org',
} as const

// inclusion bid, before soroban resource fees. Stellar charges the lowest bid that
// got in, so a high ceiling costs nothing on a quiet ledger; the SDK's 100 stroops
// timed swaps out on mainnet
export const INCLUSION_FEE_STROOPS = '1000000'

export const STELLAR_RPC_FALLBACK: Record<Network, { soroban: string; horizon: string }> = {
  testnet: {
    soroban: 'https://soroban-testnet.stellar.org',
    horizon: 'https://horizon-testnet.stellar.org',
  },
  mainnet: {
    soroban: 'https://mainnet.sorobanrpc.com',
    horizon: 'https://horizon.stellar.org',
  },
}
