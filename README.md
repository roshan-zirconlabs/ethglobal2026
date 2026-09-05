# NotWallet — a hardware wallet inside MetaMask, with clear signing

A **MetaMask Account Management Snap** that adds a new account type backed by an
**offline NFC card**. The signing key is generated on the card and **never
touches the PC** — so malware on the host has nothing to steal, and nothing can
be signed without a physical tap. A **companion dapp** shows an **AI plain-English
"what am I signing" screen** before you tap — closing the blind-signing gap that
even Keycard/Tangem leave open. Full rationale, prior-art map, and plan: **[idea.md](idea.md)**.

## Why
Funds in a hot wallet were drained after a PC was compromised (key/keystore on
disk). This keeps the key on a card's secure element, and de-blinds the approval.

## Architecture
```
MetaMask (extension)  ──▶  NotWallet Snap  ──parks request, redirects──▶  Companion dapp (phone)
   (unmodified)             (no private key,                                 - decode tx
                             relays signatures)                              - AI clear-signing
                                   ▲                                         - tap card (WebNFC)
                                   └────────── approveRequest(signature) ────┘
```
The Snap (`notwallet/packages/snap`) is a fork of MetaMask's Simple Keyring Snap
(MIT-0 / Apache-2.0), rewritten so it holds **no key** and only relays the card's
signature. The companion dapp (`notwallet/packages/site`) does the card tap +
clear signing.

## Status
- ✅ **Snap core rewritten & building** (`packages/snap/src/keyring.ts`) — keyless,
  card-backed accounts; always-async signing; `approveRequest` relays the card's
  signature. `mm-snap build` passes.
- ✅ `packages/site/src/clearsign.ts` — clear-signing rules engine (the differentiator).
- ⏳ Companion dapp: card signer (WebNFC/HaLo + a simulated card for dev) + the
  clear-signing screen + wiring `createAccount`/`approveRequest`. **Next.**

## Run (dev)
```bash
cd notwallet
node .yarn/releases/yarn-3.6.3.cjs install   # or: yarn install (yarn 3.6.3 vendored)
yarn workspace @metamask/snap-simple-keyring-snap build
yarn start                                   # serves snap + companion dapp
```
Then install **MetaMask Flask** and add the local Snap. (Custom-account Snaps can't
be listed in production yet — Flask is the demo/self-install path; see idea.md §7.)

## Credit
Forked from [MetaMask/snap-simple-keyring](https://github.com/MetaMask/snap-simple-keyring) (MIT-0 / Apache-2.0).
# ethglobal2026
