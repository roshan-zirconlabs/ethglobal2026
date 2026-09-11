# NotWallet

**A free, seedless, self-custody phone wallet that shows you exactly what you're signing.**
Your signing key is derived on demand from a password + any NFC card — never stored,
no seed phrase, recoverable on any device. Built for ETHOnline with **ENSv2** and
**World ID** integrated as load-bearing features, not decoration.

> I lost crypto when my PC was hacked — the key was on disk. A hardware wallet would
> have saved me, but $55 felt absurd for a beginner. NotWallet is hardware-grade
> security that costs nothing: your phone, a password, and any NFC card.

---

## What it does

- **Standalone WalletConnect wallet.** Scan any dapp's WalletConnect QR, connect,
  and sign — works with every dapp, no browser extension.
- **Seedless MFKDF signer.** `privateKey = scrypt(password, salt(cardUID))`. Two
  factors (something you know + something you have), derived at sign time, used,
  then dropped. Same password + card = same key on any phone. No seed, no lock-in.
- **Clear-signing.** The Review screen is computed from the exact bytes you'll
  sign — plain-English summary, risk flags (infinite approval, `setApprovalForAll`),
  and **ENS anti-impersonation** (resolves the counterparty, forward-verifies, flags
  `🚨 name does not match`).
- **ENSv2 account model.** Your wallet identity is a real ENS name
  (`you.notwallet.eth`) that resolves on-chain. Named, budgeted **sub-wallets**
  (`bnb.you.notwallet.eth`) — each its own EOA — can be handed to bots/agents and
  can only ever spend what you fund them with. Arbitrary nesting
  (`bot1.uni.you.notwallet.eth`).
- **World ID Selfie Check** gates the two irreversible actions: overriding a
  spending limit and the emergency recovery sweep.
- **App-layer policies** (advisory): per-tx / daily caps, approval blocking —
  editable in Settings.
- **Recovery**: a guardian pointer stored on ENS; emergency sweep to it.
- **Sub-wallet funding, editing, tx history, account switcher.**

## Security model (invariants)

1. The private key **never persists and never leaves the phone.** Nothing at rest
   is a key.
2. **What you see is what you sign** — the Review screen is deterministic and
   offline; no LLM in the approval path.
3. **No custodian, no seed phrase, no server holds funds or keys.** Any backend is
   for public data / proof verification only.
4. **Honest framing.** App-layer policies are advisory (an EOA can't enforce
   on-chain). ENS names / organizes / delegates — it does not move funds.

---

## Sponsors

### ENS (ENSv2) — the account model
NotWallet is built **on ENSv2's hierarchical registry**, live on the Sepolia
ENSv2 beta (the hackathon deployment). We deployed our own `NotWalletRegistry`
(implements `IRegistry` + is its own resolver) under a parent name we own:

| Thing | Value |
|---|---|
| Parent name | `notwallet.eth` (owned by the deployer) |
| `NotWalletRegistry` | `0x6ab7F8D372c3a12bF3267B49754bFF661329FB87` (Sepolia) |
| MockUSDC (faucet) | `0xcbfd80f74375c54e545af34788ff465f96f66f05` |

- **Identity:** `claim(label)` mints `label.notwallet.eth` to you; it resolves via
  ENSv2's UniversalResolver (verified on-chain).
- **Sub-wallets:** each is a distinct MFKDF-derived EOA; "Register on ENS" deploys
  child registries down the path and `claimFor`s the name → the sub-wallet's
  address. Nesting works to arbitrary depth.
- **Recovery guardian** stored as a record your name owns.
- Honest boundary: ENS names, delegates and revokes; it never moves funds.

### World ID — Selfie Check
Gates only the **high-risk, irreversible** actions (spending-limit override,
emergency sweep), both toggleable in Settings. Real integration via
`@worldcoin/idkit-react-native` (`src/worldid.real.ts`): create a Session, open
the World App, poll for the proof, verify against World's cloud endpoint. Falls
back to a labelled sandbox gate until the native build lands (see below).

---

## Tech stack

React Native + Expo (SDK 57, dev-client) · ethers v6 · Reown WalletKit
(WalletConnect) · `react-native-nfc-manager` · `react-native-svg` · Foundry
(contracts) · ENSv2 (Sepolia beta) · World ID IDKit.

## Getting started

```bash
cd notwallet-app
npm install
cp .env.example .env      # fill in the values below
npx expo start --dev-client
```

`.env` (all `EXPO_PUBLIC_*` are bundled into the app; `PRIVATE_KEY` is dev/ops only
and never bundled):

| Key | What |
|---|---|
| `EXPO_PUBLIC_WC_PROJECT_ID` | Reown project id (cloud.reown.com) |
| `EXPO_PUBLIC_WORLD_APP_ID` | World Developer Portal app id |
| `EXPO_PUBLIC_ENS_REGISTRAR` / `EXPO_PUBLIC_ENS_PARENT_REGISTRY` | `NotWalletRegistry` address |
| `PRIVATE_KEY` | deployer/funder key (ops scripts only) |

A **development EAS build** is required for the native modules (NFC, WalletConnect,
World ID crypto): `npx eas-cli build --profile development --platform android`,
install the APK, then `npx expo start --dev-client`.

## Contracts (`notwallet-app/contracts/`)

Foundry project. `NotWalletRegistry.sol` — permissionless `claim` / `claimFor`,
own resolver, child-registry nesting. Build with `forge build`; the app also
inlines its bytecode (`src/registryArtifact.ts`) to deploy child registries at
runtime.

## Ops scripts (`notwallet-app/scripts/`, run with `ts-node`)

| Script | Purpose |
|---|---|
| `ensv2-status.ts` | Health-check the ENS setup |
| `register-parent.ts` | Register `notwallet.eth` (one-time) |
| `setup-registrar.ts` | Deploy + attach `NotWalletRegistry` |
| `fund.ts <addr> [eth]` | Sponsor Sepolia gas to any wallet |
| `verify-claimfor.ts` / `prove-nested.ts` | Prove nested subnames resolve on-chain |

## Activating the real World ID Selfie Check

The integration is written and wired; the native crypto module needs one build:

1. deps are installed (`@worldcoin/idkit-react-native`, `react-native-quick-crypto`,
   `react-native-nitro-modules`); the guarded `install()` in `index.ts` activates
   automatically in a native build.
2. Optionally set `EXPO_PUBLIC_WORLD_VERIFY_URL` (defaults to World's cloud endpoint
   `developer.worldcoin.org/api/v2/verify/<app_id>` — no server needed).
3. `npx eas-cli build --profile development --platform android`, reinstall, test
   with the World ID **Sandbox App**.

Until then, World ID gates fall back to a sandbox human-presence prompt (labelled,
`verified: false`) so the app runs on any build.

---

MFKDF: `scrypt` N=2¹⁵ r=8 p=1 dkLen=32 · Chain: Sepolia (11155111).
The MetaMask snap (`notwallet/`) is an optional "also works in Flask" bonus, not the
product.
