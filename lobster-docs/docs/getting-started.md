---
slug: /
---

# Getting started

The dashboard reads live Stellar state and lets a wallet sign a real
transaction. This page goes from nothing to a confirmed testnet tx.

## What you need

A Stellar wallet extension in the browser. Freighter is the easiest to start
with; xBull and Albedo work too. LOBSTR connects as well, but it wouldn't sign on
testnet when we tried, so use one of the others for the steps below. On testnet
you don't need real funds, the friendbot covers the account reserve.

## Connect a wallet

Open the dashboard and use Connect in the top bar, then pick your wallet and
approve. Your address shows up once it's connected. The toggle next to it
switches between Testnet and Mainnet. Leave it on Testnet here, the Lobster
contracts aren't on mainnet yet.

## Read the Factory

Open `/audit`. The Factory card shows the contract id, the admin and how many
pools it has created, the last two read straight from the Soroban contract over
RPC. It's a simulated read, so no signature and no fee. Your own LP positions are
on `/positions`.

## Sign a testnet transaction

The panel at the bottom of `/audit` runs the whole round trip. Its button
reads "Call the Factory with" and then the name of the wallet you connected. It
builds a `get_admin` call as a real transaction, hands the XDR to your wallet,
submits the signed result to Soroban RPC, then polls until a ledger includes it.
You pay the resource fee and nothing else. On success it shows the tx hash with
a link to stellar.expert.

The same panel has a "DFNS relay (advanced)" tab. Pick the Lobster testnet demo
in the DFNS custody panel first, and the treasury signs through DFNS MPC instead
of your wallet: "Sign now with DFNS MPC, no approver needed" clears on its own,
while "Call the Factory (DFNS MPC)" is held by the approval policy and released
by the demo relay.

That build, sign, submit, confirm loop is what a strategy uses underneath. What
sits on top of it is split across the integration pages. The
[bridge page](integrations/bridge.md) covers how USDC gets in from an EVM chain, and Stellar Broker is what prices the swap
across venues. The Wallets Kit page covers the connection you just made. DFNS is
the other signing path, for a desk that has to keep its keys in MPC custody
instead of a browser extension.
