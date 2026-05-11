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
  lobster: {
    factory: string
    // WASM hash the Factory uses to deploy per-user instances. Not an
    // address; passed as wasm_hash to Factory#deploy_for.
    wasmHash: string
  }
}

const mainnet: NetworkContracts = {
  tokens: {
    xlmSac: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
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
  lobster: {
    factory: '',
    wasmHash: '',
  },
}

const testnet: NetworkContracts = {
  tokens: { xlmSac: '', usdcSac: '', usdcIssuer: '' },
  allbridge: { bridge: '', usdcPool: '' },
  soroswap: { factory: '', router: '' },
  aquarius: { router: '' },
  lobster: {
    factory: 'CACIPDGSEGB3C5FHINR3S5V6F7BMVH5IWVQ2U3BUHHTP4BVSRRPE2LXO',
    wasmHash: '837d3d9f265304e8eea935fe78342eb50e2291a4035048e0bef39431e300dc34',
  },
}

export const CONTRACTS: Record<Network, NetworkContracts> = { mainnet, testnet }
