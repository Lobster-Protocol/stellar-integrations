// Stellar contract IDs, indexed by network. Never hardcode a C-address
// or G-address elsewhere - import from here.

export type Network = 'testnet' | 'mainnet'

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
    readSource: '',
  },
  friendbot: '',
}

const testnet: NetworkContracts = {
  // Soroswap / Aquarius / Allbridge are mainnet-only protocols. We leave
  // these empty on testnet so the UI gates them rather than calling a
  // non-existent contract.
  tokens: { xlmSac: '', usdcSac: '', usdcIssuer: '' },
  allbridge: { bridge: '', usdcPool: '' },
  soroswap: { factory: '', router: '' },
  aquarius: { router: '' },
  broker: { endpoint: 'https://api.stellar.broker', router: '' },
  lobster: {
    factory: 'CACIPDGSEGB3C5FHINR3S5V6F7BMVH5IWVQ2U3BUHHTP4BVSRRPE2LXO',
    wasmHash: '837d3d9f265304e8eea935fe78342eb50e2291a4035048e0bef39431e300dc34',
    readSource: 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU',
  },
  friendbot: 'https://friendbot.stellar.org',
}

export const CONTRACTS: Record<Network, NetworkContracts> = { mainnet, testnet }

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

// Public RPC endpoints we fall back to when the user did not set their own
// VITE_*_RPC. Allbridge's SDK needs one per EVM chain plus Stellar.
export const EVM_RPC_FALLBACK: Record<EvmChain, string> = {
  ETH: 'https://rpc.ankr.com/eth',
  ARB: 'https://rpc.ankr.com/arbitrum',
  BSC: 'https://rpc.ankr.com/bsc',
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
