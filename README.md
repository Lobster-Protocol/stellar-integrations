# Lobster Stellar dashboard

[![CI](https://github.com/Lobster-Protocol/stellar-integrations/actions/workflows/ci.yml/badge.svg)](https://github.com/Lobster-Protocol/stellar-integrations/actions/workflows/ci.yml)

React frontend that talks to our Soroban contracts on Stellar. Wires up
the wallets, the bridge, the swap routing and the DFNS custody backend
around the analytics engine.

Live: https://stellar-instit.lobster-protocol.com

## Contracts

The Soroban contracts come from [Lobster-Protocol/Stellar](https://github.com/Lobster-Protocol/Stellar)
(our 2025 Build Award), whose source rebuilds the mainnet wasm byte for byte.

### Mainnet

| what | link |
| --- | --- |
| Factory, admin handed to the DFNS treasury | [`CAFGQVKF...MCR5`](https://stellar.expert/explorer/public/contract/CAFGQVKFCZITN7UJUOIJPMULGZRUR7RXG6DAYJ2VBGIGFWHHFGR6MCR5) |
| first vault, XLM/USDC, working in the Soroswap pool | [`CBEWCQWM...WGQ4`](https://stellar.expert/explorer/public/contract/CBEWCQWMKYRBHN2H6GIEYQS4UACN3DHC3KUXHX5F3AOZAKCG5VI7WGQ4) |

The dashboard reads both with no wallet:
[the factory and its vaults](https://stellar-instit.lobster-protocol.com/audit?network=mainnet), and
[the vault's position](https://stellar-instit.lobster-protocol.com/positions?network=mainnet&view=GA3FDPNGWE7T2ANXNB5LNPRLZMC2LBYJFO2VVKW7DRUZTGNIKZDKOXCS),
opened read-only on its owner.

### Testnet

Aquarius has no testnet deployment, so its router only has a `mainnet` entry in
`src/config/contracts.ts`. Soroswap and Circle's CCTP contracts run on both
networks, and so does the USDC bridge.

| what | link |
| --- | --- |
| Factory | [`CACIPDGS...2LXO`](https://stellar.expert/explorer/testnet/contract/CACIPDGSEGB3C5FHINR3S5V6F7BMVH5IWVQ2U3BUHHTP4BVSRRPE2LXO) |
| deploy | [`f30b3152`](https://stellar.expert/explorer/testnet/tx/f30b315298668c4cc4d9e38856014b0cfcafe6d8179118637684afd0e51e78b1) |
| create_pool | [`a200fdd2`](https://stellar.expert/explorer/testnet/tx/a200fdd22fb95283ca5f13733fdb3cad8aff1a2bcc1993ad31413c35afab39da) |
| signed via Freighter (Ping from the dashboard) | [`28f03cbb`](https://stellar.expert/explorer/testnet/tx/28f03cbbbb4d8d5b109ef9f944cda71039f4bee7f43db36df23098de24947b10) |
| signed via xBull (Ping from the dashboard) | [`0593e786`](https://stellar.expert/explorer/testnet/tx/0593e786078f1f71a476c2705fcf1fbf122ce2e479e7ebff144503560ebe3af2) |

Read the state back yourself:

```bash
stellar contract invoke --id CACIPDGSEGB3C5FHINR3S5V6F7BMVH5IWVQ2U3BUHHTP4BVSRRPE2LXO \
  --source <funded-testnet-key> --network testnet -- get_pool_count
# 1
```

## Transactions

Best-execution routing goes through Stellar Broker, which only runs on mainnet,
so the routing transactions are mainnet. The DFNS policy rows are on testnet, the
vault rows on mainnet, and the bridge rows on both.

| what | link |
| --- | --- |
| live swap on Soroswap testnet, XLM to USDC, the route the swap modal runs | [`23112a47`](https://stellar.expert/explorer/testnet/tx/23112a4791f2c364874395900401421ec4985bc5b47676bd1947efe7801b7533) |
| a broker route our decoder reads, one Soroswap pool and two Aquarius pools in a single ledger. **not our transaction**, it is a live broker route on mainnet we decode to show what the broker bundles | [`f5a3533f`](https://stellar.expert/explorer/public/tx/f5a3533f2b92a3159d7eedcb443806f6ef998159b39e8556c65fed73d7b4bea6) |
| fallback straight to the Soroswap router, no broker in the path | [`766cd060`](https://stellar.expert/explorer/public/tx/766cd0602dfb2f59f812397331dac4121480c84b6a1104c3462541fb786096e6) |
| Soroswap swap signed by DFNS MPC on mainnet, no broker in the path | [`056593f3`](https://stellar.expert/explorer/public/tx/056593f3a49c5c6011af6732f95b9f5f928ba0707024547a6e4d09f61f336fa5) |
| the Lobster factory deployed on mainnet, admin then handed to the DFNS treasury | [`43bd8748`](https://stellar.expert/explorer/public/tx/43bd8748235bf1728633265c5544cf1701fca1b70646c8cf79a6147ffdf91eb9), [`f27dd796`](https://stellar.expert/explorer/public/tx/f27dd796fc6eea4a831a7c80140e4b08cfe698d6fdb8579c48c552970cf96b54) |
| the vault code the factory deploys per pool, and the factory code, uploaded to mainnet | [`ed5f7257`](https://stellar.expert/explorer/public/tx/ed5f7257925eae08befbdf4ec5bdb6f55d75363f15b6b3d9a7728dddb21f96d9), [`bb6b7306`](https://stellar.expert/explorer/public/tx/bb6b73068fd12b0f0c8547b5916789f2fbfe7677373f99affaeb59d72c3b6379) |
| the first mainnet vault: created by the factory, 5 XLM and 1.09 USDC deposited, then put into the Soroswap XLM/USDC pool | [`a5dd6610`](https://stellar.expert/explorer/public/tx/a5dd6610477b103aa860df1caa2f4bd737f9ca8111fa4e07213bd00e583fd38b), [`d9936ee5`](https://stellar.expert/explorer/public/tx/d9936ee57f8719a2fff41c01eb1efe08526d775ffd85c1593bd9e47d9f96c6cb), [`e845c924`](https://stellar.expert/explorer/public/tx/e845c924538dd130f5a9a385b9bf82e9ffc893ec8a4cbd83d1a3312ba9038afc) |
| Soroban call signed by DFNS MPC, not a local key. `get_admin` on the Factory, held for an approver and released by one | [`96f4bcfe`](https://stellar.expert/explorer/testnet/tx/96f4bcfe2e72cac9a6f2ddd06946d47b55ea340664798dade7c71ff41bbb7d4a) |
| the same Soroban call, first run | [`bd5db00a`](https://stellar.expert/explorer/testnet/tx/bd5db00a38a40327cdf906f27af94afcce39e679fd81d01a93bacf3479f3ef41) |
| DFNS policy, cleared with no approver because the recipient is on the list. Sent from the dashboard button, not a script | [`dcd63f56`](https://stellar.expert/explorer/testnet/tx/dcd63f560a2c2e08da057dbc7ba294819875fb1043893dfe1e53a3847abb1f88) |
| DFNS policy, cleared only after a second approver | [`67d46c3f`](https://stellar.expert/explorer/testnet/tx/67d46c3f1d65fe654d2d0e9b9dd141a28052eb3679841fe831e899cb14ca8958) |
| DFNS policy, cleared only after a second approver, first run | [`90023887`](https://stellar.expert/explorer/testnet/tx/90023887d0980bba1a48309d1236b28e6884a944de0d65cf561dd94e457d2f74) |
| an earlier treasury payment, signed before any approval policy existed on the account | [`e379a0d3`](https://stellar.expert/explorer/testnet/tx/e379a0d33452495abefce7277fa17324be1d44b506df36203ea2ba8eaa62fc5a) |
| USDC bridged in from Base Sepolia with Circle CCTP, started from the dashboard: the burn | [`0xeb55104a`](https://sepolia.basescan.org/tx/0xeb55104ab1c068141de1677f6e96d2ca6fef09956c29be3f0ef9fb31e31b31cd) |
| the same transfer delivered on Stellar, `mint_and_forward` signed by the receiving wallet | [`d0a761b9`](https://stellar.expert/explorer/testnet/tx/d0a761b9bcf05802c832f5abb7b4b148328c0bfe172149ad04415aee8fa91b4c) |
| a standard transfer from Ethereum Sepolia, no fee, delivered whole: burn, then delivery | [`0xf92c8225`](https://sepolia.etherscan.io/tx/0xf92c8225e4508f7225cebc7b1898d9cbb886c114a1197c2d8856a005242af534), [`ac28bbce`](https://stellar.expert/explorer/testnet/tx/ac28bbcee0bed070c158207288c854c354eba4086d6a6e39a33c6a1799c1c4da) |
| mainnet, USDC from Ethereum, fast, started from the dashboard: burn, then delivery | [`0xdba8433c`](https://etherscan.io/tx/0xdba8433c55b5e0a920d243c983f7e3958e1bf2805c4eb53fa6b175be78873edc), [`93449e9b`](https://stellar.expert/explorer/public/tx/93449e9bb91c5d374daffd1bdfb14d814d1ddee59dd55e06cc182f16ded786f5) |
| mainnet, USDC burned on Base and delivered into the DFNS treasury from the dashboard's finish-by-hash form: burn, then delivery | [`0xae5683b0`](https://basescan.org/tx/0xae5683b030dae869d9f0110e4d5ea7abb1d6860ceef6dbeeaf66de8ce8e4b4cc), [`c1c40432`](https://stellar.expert/explorer/public/tx/c1c404321298c6be0692ad699be092a324af0c401dab8783de07f5eb3fc37482) |
| mainnet, USDC out of Stellar from the bridge test account: the burn on Stellar, then the mint Circle sent on Arbitrum | [`a1c5776a`](https://stellar.expert/explorer/public/tx/a1c5776a6eb373dc54409f1de75c4ba0484b779db43ced4d3bfc85270801e774), [`0x534ab68e`](https://arbiscan.io/tx/0x534ab68eee614244af2497a0978fe01edcd9c1209d6f4ae0128be2a42091e9ae) |

Every hash above except `f5a3533f` is sourced from a wallet we control: the DFNS
treasury `GCWEI7HV...2OPB` on testnet, `GCE75LSG...6DQP` on mainnet, the deployer
`GA2PK7ZW...4MBU` on testnet and `GA3FDPNG...OXCS` on mainnet, the demo wallet
`GCVFDROZ...RVQA` behind the Soroswap swap, the browser test wallet
`GC6QPGCO...JKDY` behind the Freighter and xBull rows, or the bridge test wallets
`0xDCD5...1a37` and `GCC5G4...HA74`.
`f5a3533f` is somebody else's broker route, kept because it is what our decoder
reads. The row says so instead of counting it as our own execution.

### How the two approval paths differ

The testnet treasury runs one rule: a payment to an address on its list clears on
its own, a payment anywhere else waits for a named approver. The approval group
names the approver and excludes whoever asked, so the dashboard cannot release
its own request. `dcd63f56` went to the treasury itself and settled with no
approval recorded against it, straight off the dashboard button.
`67d46c3f` went through a second person.

DFNS reads a policy against a transfer request, where it builds the payment and
knows the asset and the recipient. It cannot read one against a raw signing
request: ask it to evaluate an amount and it answers "only supported on a
transfer request", ask it for a recipient and it answers "recipient address not
specified". Either way the rule fails closed and holds the signature. Amount
rules have a second problem on testnet, where DFNS has no market price for
testXLM and says so. That is why the rule here is written on the recipient
rather than on a dollar figure.

## Stack

React 19, Vite 6, Tailwind v4, TypeScript strict.
`@stellar/stellar-sdk` v14 for Horizon + Soroban RPC.
`@creit-tech/stellar-wallets-kit` v2 via JSR (Freighter, xBull, Albedo,
LOBSTR + WalletConnect).
SDKs in the tree: `@allbridge/bridge-core-sdk`, `@stellar-broker/client`,
`@dfns/sdk`. Soroswap is called through its on-chain router via
`@stellar/stellar-sdk`, no dedicated SDK.
`@tanstack/react-query` for caching, `zod` for runtime checks.
Playwright + Vitest.

## Run it

```bash
nvm use                  # Node 24 from .nvmrc
npm install
npm run dev              # http://localhost:5173
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check then bundle |
| `npm run preview` | Serve the bundle locally |
| `npm run server` | Hono DFNS service: signing, webhook, MiCA export |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc -b` |
| `npm run test:unit` | Vitest |
| `npm run test:e2e` | Playwright against a local preview build (set `PLAYWRIGHT_BASE_URL` for a deploy) |
| `npm run probe:rpc` | Sanity-check Stellar RPC reachability |

## Layout

```
src/
  components/   UI: Sidebar, TopBar, BridgeModal, charts
  config/       contracts.ts (addresses by network)
  contexts/     Wallet, Network, Custody, Toast
  integrations/ allbridge, broker, cctp, dfns, evm, horizon, lobster, pricing, routing, signer, stellar, ttl
  pages/        Overview, Performance, Activity, Allocation, Bridges, Positions, Audit
server/         Hono service: DFNS signing, webhook, MiCA export, policies
tests/          Playwright suites
scripts/        CLI helpers
```

## House rules

- No address hardcoded outside `src/config/contracts.ts`.
- No secrets committed. `.env*` is gitignored, `.env.example` shows the keys.

## Security

Found something? Email security@lobster-protocol.com rather than
opening a public issue.
