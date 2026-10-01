# Bridging USDC

USDC moves between Stellar and an EVM chain, both ways, through Circle's
Cross-Chain Transfer Protocol (CCTP V2). Circle has run it on Stellar since May
2026, on testnet and mainnet, so the whole path can be tried with test USDC
before any real money moves.

Two wallets take part, one per chain. The EVM wallet holds the USDC on Base,
Arbitrum or Ethereum; the Stellar wallet holds it on Stellar. `/bridges` shows
both side by side, each connected on its own, with its network, its USDC and
what it has to pay fees with.

## Into Stellar

1. The Stellar account that will receive opens a USDC trustline. Without one the
   last step fails, so the dashboard checks it before anything else.
2. On the source chain, the wallet approves Circle's `TokenMessengerV2` for the
   exact amount, never an open-ended allowance.
3. The same wallet calls `depositForBurnWithHook`. The USDC is burned and the
   burn hash is the EVM-side proof.
4. Circle's attestation service signs the burn. We ask for it by burn hash at
   `/v2/messages/{sourceDomain}`, straight from the browser.
5. On Stellar, one call to `mint_and_forward` on Circle's `CctpForwarder` mints
   the USDC and pays the account.

Step 5 carries no authorization entry. Whoever pays its fee can submit it, and
the account being paid never signs. The dashboard has the connected wallet do
it, which costs a few hundredths of an XLM and moves none of its funds.

### Why the forwarder

A CCTP message names who receives the mint as 32 raw bytes, and Circle's
Stellar contract reads those bytes as a contract id. There's no way to say "this
is a G account". So the burn names the forwarder as the mint recipient, and puts
the real destination in the hook data:

```
bytes 0-23   zero, meaning we finish the transfer ourselves
bytes 24-27  hook version, 0
bytes 28-31  length of the address
bytes 32+    the G or M address, as text
```

The forwarder mints to itself and pays that address in the same call. It also
pays muxed M addresses, which is handy for a sub-account.

### Fast or standard

A fast transfer asks Circle to sign before the source chain finalises. It costs
a few basis points, read live from `/v2/burn/USDC/fees/{src}/27`, and arrives in
about a minute. A standard transfer is free and waits for finality, usually 15
to 30 minutes, the long end on an L2 whose batch has to finalise on Ethereum
first. The burn declares a `maxFee` with some headroom; Circle charges what it
actually takes, not the ceiling.

## Out of Stellar

1. The Stellar wallet approves Circle's `TokenMessengerMinter` on the USDC token
   for the exact amount. The contract pulls the USDC with `transfer_from`, so the
   burn fails without it. The approval lapses on its own after about a thousand
   ledgers, and a declined burn leaves it to be reused rather than asked for again.
2. The same wallet calls `deposit_for_burn`. The mint recipient is the EVM
   address, left-padded to 32 bytes, and no destination caller is named, so any
   wallet may mint it on the other side.
3. Circle signs within seconds: Stellar settles in about five, and Circle offers
   no fast tier from it because standard is already fast. Circle files a Stellar
   burn under its bare hash, `/v2/messages/27?transactionHash=...`; the `0x` form
   finds nothing.
4. The USDC is minted on the EVM chain in one of two ways, picked in the form.

**Circle mints it.** The burn goes through `deposit_for_burn_with_hook` with
Circle's forwarding request in the hook (`cctp-forward`, then zeros) and a
`max_fee` from `/v2/burn/USDC/fees/27/{dst}?forward=true`. Circle keeps all of
it: what goes over the real cost buys priority on the destination chain and is
not refunded. The form shows that fee before anything is signed, around 0.05 to
0.10 USDC to Base or Arbitrum and about 2 USDC to Ethereum, and nothing has to be
signed on the EVM side.

**The EVM wallet receives it.** No fee to Circle. Once Circle has signed, the
connected EVM wallet calls `receiveMessage(message, attestation)` on Circle's
`MessageTransmitterV2` and pays the gas. This is also the way out if Circle's
own mint fails or stalls: the transfer page offers it after a few minutes.

Stellar's USDC has 7 decimals and CCTP carries 6, so the form refuses a 7th
decimal rather than leaving Circle's converter to drop it.

With DFNS custody on, nothing leaves the treasury from here: the relay never signs
a burn out of it. A connected browser wallet sends instead.

## Chains

Base, Arbitrum and Ethereum, and their Sepolia testnets. Circle's contracts sit
at the same address on every EVM chain of a network, and every id we use was
read back from the chains themselves. They live in `src/config/contracts.ts`
under `cctp` and `CCTP_SOURCE_CHAINS`. Stellar is CCTP domain 27.

BNB Chain is not on the list. Circle runs CCTP there as domain 17, but Stellar's
TokenMessengerMinter has no remote messenger for domain 17, on mainnet or testnet
(`get_remote_token_messenger(17)` comes back empty), so a burn on BNB Chain could
never be minted on Stellar. Avalanche, OP and Polygon are wired to Stellar the
same way the three chains above are.

On testnet, the USDC that CCTP mints is Circle's test asset, issuer
`GBBD47IF...LFLA5`. It is not the test USDC the Soroswap pools use, so it has its
own entry in the config.

## Knowing where a transfer stands

Between the burn and the arrival the money is in neither account, and nothing on
either chain will remind anyone. The dashboard keeps a note of each burn in the
browser, both directions, and lists the unfinished ones on `/bridges` with where
each stands: waiting for Circle, Circle holding it and why, ready for your
signature, Circle minting it, arrived. Each step carries its time, and the
transfer window shows how long it has run against how long that kind usually
takes, with a link to every transaction on its explorer.

While a transfer is out, the dashboard keeps looking on every page and says so
once when Circle has signed or when the USDC has landed. It also notices a
transfer finished somewhere else, by another tab, by the relay or by Circle's
own mint, by reading the spent nonce on the destination chain. Finished
transfers stay listed with both of their transactions.

The note holds hashes and addresses, never a key, and losing it loses nothing:
the burn is on chain and Circle will still sign it. A fast transfer's message
into Stellar expires after roughly a day of Stellar ledgers; past that it needs
a fresh signature from Circle before it can be delivered.

A burn sent from somewhere else, another device or straight from a custody
platform, left no note in this browser. Its hash is enough: paste it under
"Finish a transfer started elsewhere" on `/bridges`, with the chain it was burned
on. For an EVM burn the dashboard reads the amount and the Stellar recipient from
its `DepositForBurn` log, which also covers a burn made through a smart account.
For a Stellar burn it reads Circle's signed message, which names the EVM chain,
the wallet it pays and whether Circle mints it. Anything that is not a CCTP burn
the bridge can finish is refused before it is tracked.

## Into a DFNS treasury

With DFNS custody on, the dashboard bridges into the treasury, not into the
browser wallet. The treasury signs once, for its USDC trustline, through the
relay and under the same approval policy as its other signatures. It never signs
the delivery: any connected Stellar wallet pays that fee and the USDC still lands
in the treasury. The relay's signing guard does not let the treasury call
`mint_and_forward` itself, so with no browser wallet connected the transfer waits
on `/bridges` until one is, or until the relay below delivers it.

## From a server

The same service that runs the DFNS routes exposes the bridge for anyone who
wants plain HTTP:

| Route | What it does |
| --- | --- |
| `GET /cctp/chains?network=` | the EVM chains and their contracts, the Stellar forwarder a burn into Stellar names, and the contracts a burn out of Stellar goes through |
| `GET /cctp/fees?network=&domain=` | Circle's fast and standard fees toward Stellar |
| `GET /cctp/fees?network=&domain=27&destination=` | what Circle charges to mint a Stellar burn on that chain |
| `GET /cctp/message?network=&domain=&txHash=` | where a burn stands and who it pays, either way; out of Stellar also Circle's own mint and what an EVM wallet submits to mint it |
| `POST /cctp/deliver` | runs the last step into Stellar and pays the fee from our account |

The delivery route is behind the operator token and shut unless a relay key is
configured. It never takes the message from the caller. It asks Circle by burn
hash, checks that the transfer pays the account the caller named through the
forwarder of the network the caller named, and only then submits. It's meant for
an account that doesn't sign from a browser, a custody treasury for example. Out
of Stellar there is nothing to deliver for anyone: Circle mints, or the
recipient's own wallet does.

## Limits

CCTP carries USDC and nothing else. For another asset, or a chain Circle doesn't
reach, `/bridges` links out to Allbridge, StellarX, Aquarius and Stellar anchors
instead of pretending.

## Where it lives

`src/integrations/cctp/` holds the hook encoding, the message decoder, the EVM
burn and mint, the Stellar burn, the attestation client, the Stellar delivery,
the status of a transfer and the local record of transfers. The window is
`src/components/BridgeModal.tsx`, with the way out in `BridgeFromStellar.tsx`;
the page is `src/pages/Bridges.tsx`, with the two wallets in
`BridgeWallets.tsx`; `BridgeWatcher.tsx` follows transfers in the background, and
the server side is `server/cctp/`.
