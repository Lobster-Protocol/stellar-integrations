// Stellar contract IDs, indexed by network. Never hardcode a C-address
// or G-address elsewhere - import from here.

export type Network = 'testnet' | 'mainnet'

// one entry the swap selector can render. `asset` is the broker-format id the
// routing layer expects: 'xlm' for native, 'CODE-ISSUER' for a classic asset,
// or a bare SAC contract id for a soroban token (testnet, where the broker is
// skipped). brokerAssetToSac maps any of these back to a SAC for Soroswap.
export interface SwapToken {
  code: string
  asset: string
}

interface NetworkContracts {
  tokens: {
    // XLM Stellar Asset Contract - pass as token arg to Soroban calls
    xlmSac: string
    // USDC Stellar Asset Contract (Soroban side). Not a trustline issuer.
    usdcSac: string
    // USDC classic-asset issuer (G-address). Use with new Asset('USDC', x)
    // for changeTrust or to match account.balances[].asset_issuer.
    usdcIssuer: string
  }
  // extra swap-selector tokens on top of XLM/USDC, in broker-format `asset`
  // ids. these are the higher-cap Stellar tokens whose Soroswap pool actually
  // fills (probed pool by pool), so the selector never offers a dead pair.
  extraSwapTokens: SwapToken[]
  // the Lobster classic token, used by the DFNS custody demo to open a trustline
  // from the MPC-held treasury. issuer is empty off testnet.
  lobsAsset: { code: string; issuer: string }
  allbridge: {
    bridge: string
    usdcPool: string
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
    // router contract id is not published. extracted from the first
    // signed quote XDR at runtime, then cached. empty until we see one.
    router: string
  }
  lobster: {
    factory: string
    // WASM hash the Factory uses to deploy per-user instances. Not an
    // address; passed as wasm_hash to Factory#deploy_for.
    wasmHash: string
    // public deployer account used as simulation source for anonymous
    // reads. empty on mainnet (we require the caller wallet there).
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
  // higher-cap Stellar tokens with a live Soroswap mainnet pool (probed from
  // XLM or USDC). EURC and AQUA fill from both; SHX and KALE fill from XLM.
  // yXLM, PYUSD, BTC and ETH are left out: no usable Soroswap pool on mainnet.
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
    // not on mainnet yet
    factory: '',
    wasmHash: '',
    // all-zero account: a read-only sim source for the mainnet price quote, which
    // needs no funds. the factory itself is not deployed on mainnet yet.
    readSource: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  },
  friendbot: '',
}

const testnet: NetworkContracts = {
  // Aquarius and Allbridge are mainnet-only, so those stay empty and the UI
  // gates them. Soroswap does run on testnet, so its router and the two swap
  // tokens (native XLM SAC + Soroswap's test USDC) are wired for a live swap.
  tokens: {
    xlmSac: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
    usdcSac: 'CB3TLW74NBIOT3BUWOZ3TUM6RFDF6A4GVIRUQRQZABG5KPOUL4JJOV2F',
    usdcIssuer: '',
  },
  // EURC, XTAR and XRP each have a liquid Soroswap pool from XLM or USDC on
  // testnet. the broker is skipped on testnet, so these are bare SAC ids that
  // go straight to the Soroswap router. AQUA and the rest have no pool here.
  extraSwapTokens: [
    { code: 'EURC', asset: 'CBQDUWBOHS7P4TZIJ3KUPUZQOWMKJC6CQPPFEONSV3BH4X27YVEXWNOT' },
    { code: 'XTAR', asset: 'CCZGLAUBDKJSQK72QOZHVU7CUWKW45OZWYWCLL27AEK74U2OIBK6LXF2' },
    { code: 'XRP', asset: 'CDDIA6HYANLPMDKBVQRIIXY3NA6S3TMHZFJUNPMBEJGZ5JSHN3E2TAUI' },
  ],
  lobsAsset: { code: 'LOBS', issuer: 'GBYIQEC7OMW2BV4PFL4R6GCBN32ALIEAEYDV7MIWPRGJGEP5M7UMWVCB' },
  allbridge: { bridge: '', usdcPool: '' },
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

// production dashboard origin. one canonical value; the probe still reads its own
// MONITOR_FRONTEND_URL override where a deploy needs a different host.
export const FRONTEND_URL = 'https://stellar-instit.lobster-protocol.com'

// the tokens offered in the swap selector for a network. XLM and USDC come
// from the canonical `tokens` block (so their ids are never duplicated), then
// the network's extra tokens. USDC is classic on mainnet, a soroban token on
// testnet, which is exactly the split brokerAssetToSac maps back.
export function swapTokensFor(network: Network): SwapToken[] {
  const t = CONTRACTS[network].tokens
  const usdc: SwapToken = {
    code: 'USDC',
    asset: t.usdcIssuer ? `USDC-${t.usdcIssuer}` : t.usdcSac,
  }
  return [{ code: 'XLM', asset: 'xlm' }, usdc, ...CONTRACTS[network].extraSwapTokens]
}

// EVM-side canonical values for the Allbridge inflow path. These don't
// vary with the Stellar network (USDC mainnet address on Ethereum is
// always the same, mainnet-only flow), so they sit outside CONTRACTS.

export type EvmChain = 'ETH' | 'ARB' | 'BSC'

export const EVM_USDC: Record<EvmChain, `0x${string}`> = {
  ETH: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  ARB: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  BSC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
}

export const EVM_EXPLORER_TX: Record<EvmChain, (hash: string) => string> = {
  ETH: (h) => `https://etherscan.io/tx/${h}`,
  ARB: (h) => `https://arbiscan.io/tx/${h}`,
  BSC: (h) => `https://bscscan.com/tx/${h}`,
}

export const EVM_CHAIN_NAME: Record<EvmChain, string> = {
  ETH: 'Ethereum',
  ARB: 'Arbitrum',
  BSC: 'BNB Chain',
}

// USDC on BNB Chain is 18-decimal while the allowance scaling on the send path
// assumes 6, so that corridor is refused. One list, so the bridge page and the
// deposit modal cannot advertise different chains.
export const EVM_BRIDGEABLE: Record<EvmChain, boolean> = {
  ETH: true,
  ARB: true,
  BSC: false,
}

// Public RPC endpoints we fall back to when the user did not set their own
// VITE_*_RPC. Allbridge's SDK needs one per EVM chain plus Stellar.
export const EVM_RPC_FALLBACK: Record<EvmChain, string> = {
  ETH: 'https://ethereum-rpc.publicnode.com',
  ARB: 'https://arbitrum-one-rpc.publicnode.com',
  BSC: 'https://bsc-rpc.publicnode.com',
}

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
