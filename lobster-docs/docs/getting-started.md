---
slug: /
---

# Getting started

The dashboard reads live Stellar state and lets a wallet sign a real
transaction. This page goes from nothing to a confirmed testnet tx in a few
minutes.

## What you need

A Stellar wallet extension in the browser. Freighter is the easiest to start
with; xBull, Albedo and LOBSTR work too. On testnet you don't need real funds,
the friendbot covers the account reserve.

## Connect a wallet

Open the dashboard and use Connect in the top bar, then pick your wallet and
approve. Your address shows up once it's connected. The toggle next to it
switches between Testnet and Mainnet. Leave it on Testnet here, the Lobster
contracts aren't on mainnet yet.

## Read a position

Open `/positions`. The Factory card reads three values straight from the Soroban
contract over RPC: the admin, the deployed WASM hash, and the pool count. It's a
simulated read, so no signature and no fee. Any LP positions tied to your
address list underneath.

## Sign a testnet transaction

The Ping Factory panel at the bottom of `/positions` runs the whole round trip.
It builds a `get_admin` call as a real transaction, hands the XDR to your wallet,
submits the signed result to Soroban RPC, then polls until a ledger includes it.
You pay the resource fee and nothing else. On success it shows the tx hash with a
link to stellar.expert.

That build, sign, submit, confirm loop is what a strategy uses underneath. The
integration pages cover what sits on top of it: Allbridge brings capital in over
the bridge, Stellar Broker routes the swaps, and DFNS handles signing when a desk
needs MPC custody rather than the browser wallet you just used.
