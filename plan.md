# NotWallet — Build Plan, Status & Handoff

> **What this is:** the working status + roadmap for NotWallet, a MetaMask
> Account Management Snap that gives MetaMask an account whose signing key lives
> on an **offline card / device — never on the host**, and shows an **AI
> clear-signing screen** ("what am I signing?") before every approval.
>
> **This doc is written so another AI tool (or a fresh chat) can continue the
> work.** Read §1–§3 for the mental model, §4 for what's done, §5 for what's
> left, §6 for how the Tangem-style multi-card future works, §7 to run/test it,
> §8 for gotchas, §9 for the changelog. §10 is a paste-ready brief for another AI.
>
> Companion doc: **[idea.md](idea.md)** (the "why", prior-art map, sponsor fit).

---

## 1. The one-sentence thesis

A hardware wallet delivered *inside the MetaMask you already use*: you add a new
account type backed by an offline card; **MetaMask/the PC never holds the private
key**; and before you approve anything, a plain-English screen tells you exactly
what the card is about to sign (ending "blind signing").

**The problem it solves (real, lived):** a hot-wallet key sitting on a
compromised PC was drained. If the key isn't on the machine and every signature
needs a physical tap, that attack fails.

## 2. The non-negotiable invariant (READ THIS FIRST)

> **The private key must NEVER exist on MetaMask, the extension, or the host
> machine.** It lives on the card (or phone secure element), or is derived
> transiently from multiple factors and immediately wiped. Anything that stores
> or reconstructs a raw private key inside the snap/host breaks the entire point.

Everything below is in service of this invariant. This is exactly the Tangem
guarantee (key generated on and never leaving the secure element), applied
through a MetaMask Snap and, later, through multi-factor derivation.

## 3. Architecture (current)

```
┌─────────────────┐   1. eth_signTransaction / personal_sign
│   Any dapp       │ ───────────────────────────────────────►┌──────────────────┐
│ (or MetaMask)    │                                          │  MetaMask (Flask) │
└─────────────────┘                                           └────────┬─────────┘
                                                                       │ routes to our account
                                                                       ▼
                                          ┌───────────────────────────────────────────┐
                                          │  NotWallet Snap  (packages/snap)            │
                                          │  • stores ONLY address + publicKey + label  │
                                          │  • NO private key, NEVER signs              │
                                          │  • parks request, redirects to companion    │
                                          └───────────────┬─────────────────────────────┘
                                                          │ 2. redirect (async keyring flow)
                                                          ▼
                                          ┌───────────────────────────────────────────┐
                                          │  Companion dapp (packages/site, :8000)      │
                                          │  • previewRequest() → clear-sign screen     │
                                          │  • clearSign(): plain English + risk flags  │
                                          │  • CardSigner.signDigest()  ← the card taps │
                                          │  • approveRequest(id, { signature })        │
                                          └───────────────┬─────────────────────────────┘
                                                          │ 3. relay signature back
                                                          ▼
                                                   MetaMask broadcasts / returns to dapp
```

- **Snap** = a dumb, keyless relay. It parks signing requests and emits whatever
  signature the companion hands back. It cannot sign.
- **Companion dapp** = the trusted surface that decodes the request, shows the
  clear-signing screen, gets the card to sign, and relays the result.
- **Card** = today a `SimulatedCard` (software key in the browser, DEV ONLY);
  later a real HaLo NFC chip (WebNFC) or the phone's secure enclave. Same
  `CardSigner` interface either way.

## 4. What's DONE ✅ (all committed to `main`)

| Area | File(s) | Status |
|---|---|---|
| **Keyless card-backed snap** | `packages/snap/src/keyring.ts` | ✅ Rewrote MetaMask's Simple Keyring so it stores **no private key** (only `address`/`publicKey`/`cardLabel`), is **always async**, and `approveRequest(id, {signature})` **relays** the card's signature. `mm-snap build` passes. |
| **Snap wiring/rename** | `packages/snap/src/index.ts` | ✅ `SimpleKeyring` → `CardKeyring`. |
| **Snap branding** | `packages/snap/snap.manifest.json` | ✅ Renamed to "NotWallet" with proper description. `http://localhost:8000` in `allowedOrigins`. |
| **Redirect origin fix** | `packages/snap/src/keyring.ts` | ✅ `#getCompanionUrl()` hardcoded `localhost:8000` fallback in dev — redirect always lands on the companion dapp. |
| **Card signer (simulated)** | `packages/site/src/card.ts` | ✅ `CardSigner` interface + `SimulatedCard` (ethers, browser-safe). |
| **Card signer (real NFC)** | `packages/site/src/card-halo.ts` | ✅ `HaloCard implements CardSigner` using `@arx-research/libhalo` (WebNFC). Dynamic import; activate with `?card=halo`. Key **never** leaves the chip. |
| **Request signing** | `packages/site/src/signing.ts` | ✅ `previewRequest()` + `signRequestWithCard()` for `eth_signTransaction`, `personal_sign`, `eth_sign`, **`eth_signTypedData_v3/v4`** (EIP-712), with recovered-signer safety checks. |
| **Clear-signing engine** | `packages/site/src/clearsign.ts` | ✅ **Tx rules:** infinite approval, `setApprovalForAll`, new-counterparty, ETH transfer summary. **Typed-data rules:** ERC-2612 Permit, Permit2, Seaport orders, generic approval keywords. Offline, auditable. |
| **Companion dapp wiring** | `packages/site/src/App.tsx` | ✅ `createAccount` taps card; **premium dark clear-sign panel** (glassmorphism, Inter/JetBrains Mono, risk-color coding, animations); `approveWithCard`; `?demo=1` with **4 scenario picker** (infinite approval, ETH transfer, ERC-2612 Permit, personal sign); `?card=halo` for real NFC. |
| **Clear-sign UI** | `packages/site/src/clearsign-ui.css` | ✅ Phone-style dark glassmorphism review screen with slide-in animation, pulsing approve button, risk flags, tx/typed-data detail rows. |
| **Crypto correctness** | (round-trip test, not committed) | ✅ `personal_sign` and EIP-1559 tx both recover to the card address. |
| **Runs in real Flask** | — | ✅ Snap installs; **card-backed account creation works in Flask** (verified: returns an account with `publicKey` and **no private key**). |

**Proven end-to-end (LIVE on Sepolia):** MFKDF is the default signer — the key is
derived from an NFC card id + password (Argon2id), never stored. In real MetaMask
Flask: create a card account (no key in the snap) → `personal_sign` ✅ → a real
**EIP-1559 transaction signed and broadcast on Sepolia** ✅ → wrong password/card
is rejected before signing ✅. The full thesis works.

## 5. What's LEFT ⏳ (in priority order)

1. ~~**Live signing round-trip in Flask**~~ ✅ DONE — `personal_sign` + a real
   Sepolia EIP-1559 tx both work with MFKDF; wrong-credential guard verified.
   - Remaining sub-item: `eth_signTypedData_v4` live check (Permit/typed-data
     panel + signature) — code path exists, not yet exercised live.
2. ~~**Fix the redirect origin**~~ ✅ Done. `#getCompanionUrl()` now falls back to
   `localhost:8000` in dev. Reinstall after dev build.
3. ~~**Typed-data signing**~~ ✅ Done. `eth_signTypedData_v3/v4` in `signing.ts` +
   `clearSignTypedData()` in `clearsign.ts` (Permit, Permit2, Seaport detection).
4. ~~**Real card via WebNFC**~~ ✅ Code done. `HaloCard` in `card-halo.ts` using
   `@arx-research/libhalo`. Activate with `?card=halo`. **Needs a real chip to test.**
5. **Phone secure-enclave signer** — alternative `CardSigner` using the phone's
   secure element (see §6 for the secp256k1 caveat).
6. **Multi-card / MFKDF** (the Tangem-style concern) — see §6.
7. ~~**Polished phone-style clear-sign UI**~~ ✅ Done. Premium dark glassmorphism
   panel with 4 demo scenarios. `?demo=1` for the demo video.
8. **Demo video** (2–4 min, before→after) + submission for ETHOnline.
9. **Housekeeping:** address lint/depcheck; decide production distribution story
   (account snaps can't be listed yet — self-install via Flask; see idea.md §7).

## 6. How it works LATER — the Tangem-style multi-card / enclave future

Your concern (from using Tangem: you add 1–2 cards when creating a wallet, and the
keys must live on the cards, never on MetaMask). Here's how NotWallet gets there
**without ever breaking the §2 invariant.** There are three distinct models; we
support them behind the **same `CardSigner` interface**, so the snap/UI don't change.

### Model A — Single card (what's built now)
One card holds one key, signs on-tap. Exactly like a 1-card Tangem or a Ledger.
`SimulatedCard` today → `HaloCard` (real chip) later. Key never on the host. ✅

### Model B — Backup cards (Tangem's "1–2 cards", the redundancy model)
Tangem's multi-card = **the same key on 2–3 cards** for backup (lose one, use
another). To do this safely the key must be *generated on a card and copied to the
others through a secure card-to-card ceremony* (as Tangem does) — the key still
never touches the host. For NotWallet this means the `CardSigner` is "any of my N
backup cards", and account creation registers the shared public key. **Status:
roadmap.** (With HaLo chips, which self-generate a non-extractable key, true
key-cloning isn't possible — so backup there means Model D instead.)

### Model C — Multi-factor, BOTH required (2-of-2; the strongest)
"Two cards, both needed to sign." Two sub-approaches:
- **C1 — Smart-account multisig (ERC-4337):** the account is a smart contract
  whose owners are card #1 and card #2; a tx needs both signatures. Not a plain
  EOA. Robust, but heavier (needs an AA stack + a chain with the account
  deployed).
- **C2 — MFKDF (Multi-Factor Key Derivation):** the signing key is **derived**
  at sign time from independent factors — `key = KDF(card, phoneEnclaveHMAC,
  password)` — used, then wiped. The key is **stored nowhere**; no single factor
  is enough. This matches "keys derived from cards / phone enclave." Study
  **MFKDF2** (the corrected version). **Caveat honest to keep in the plan:** the
  derived key is briefly in RAM at sign time (a true on-card signer never lets the
  key touch host memory), so C2 trades a little of that purity for "use any card."

### Model D — Phone secure enclave as a (co-)signer
The phone's Secure Enclave/StrongBox holds a non-extractable key. **secp256k1
caveat:** enclaves only do **P-256**, not Ethereum's secp256k1. So either (a) the
enclave *wraps* an encrypted secp256k1 key (plain EOA, key briefly in RAM — like
C2), or (b) use a **P-256 key + ERC-4337 smart account** (key truly never leaves
hardware, but not a plain EOA). Pick per threat model.

### The recommended path to the Tangem feel
1. Ship **Model A** with a real HaLo card (single card, key on card). ← nearest.
2. Add **Model C2 (MFKDF)** as the "add a 2nd factor (phone + PIN)" upgrade — this
   is the "1–2 cards + something you know/have" creation flow Tangem-like UX, and
   it keeps keys off MetaMask by construction (derive-then-wipe).
3. Offer **Model C1 (ERC-4337 multisig)** for users who want true on-chain 2-of-2
   with no RAM exposure.

**Whatever the model: the snap keeps storing only public data, and the signing
happens on the card/enclave (or via derive-then-wipe). MetaMask never holds the
key.** That is the line we do not cross.

## 7. How to RUN & TEST it (desktop, MetaMask Flask)

**This project uses Yarn 3 (vendored). Do NOT use `npm` — it will `ERESOLVE`.**
Deps are already installed. All commands run from `notwallet/`.

```bash
# start BOTH servers (snap on :8080, companion dapp on :8000)
node .yarn/releases/yarn-3.6.3.cjs start
# (optional one-time so plain `yarn` works: corepack enable)
```

1. **Install MetaMask Flask** (https://metamask.io/flask/) — a *separate* build
   from normal MetaMask. **Disable normal MetaMask** (they conflict), or use a
   dedicated browser profile with only Flask. (Local snaps only load in Flask.)
2. Open **http://localhost:8000** in the Flask browser → **Connect** → this
   installs the local snap. (If you changed the manifest/permissions, **remove
   the snap in Flask → Settings → Snaps → Remove**, then reconnect — permissions
   are granted at install.)
3. **Create Account** → taps the simulated card → a card-backed account appears
   in MetaMask (with a public key, **no private key**).
4. **Trigger a signing request** — easiest: the **MetaMask Test Dapp**
   (https://metamask.github.io/test-dapp/) → **Connect** (select the card
   account) → scroll to **Signing Methods** → **Personal Sign**. (The signing
   buttons only appear AFTER you connect.)
5. **Approve** on **localhost:8000** using the big colored **"Review & tap your
   card to sign"** panel at the top — NOT the generic dashboard button. It shows
   the clear-signing summary, signs with the card, and relays the signature.

**See the clear-signing screen instantly (no MetaMask):** open
**http://localhost:8000/?demo=1** — renders the screen on a sample infinite-
approval drainer. Good for the demo video.

## 8. Known gotchas (so you don't rediscover them)

- **Yarn only, never npm.** `npm i` fails with ERESOLVE. Use
  `node .yarn/releases/yarn-3.6.3.cjs <cmd>`.
- **Flask required.** Normal MetaMask throws "Fetching local snaps is disabled."
  Its extension id is `nkbihfbe…`; Flask is `ljfoeinj…`.
- **Reinstall after manifest/permission changes.** `endowment:keyring
  allowedOrigins` is granted at install → remove + reconnect the snap in Flask.
- **Two different pages.** `localhost:8000` = your dapp (where you *approve*);
  `metamask.github.io/test-dapp` = a dapp that *triggers* a request. Different roles.
- **Approve via the clear-sign panel**, not the old dashboard button — the snap
  refuses any approval without a card signature ("No signature provided" = wrong
  button). *(Old button now also routed through the card.)*
- **Redirect origin:** an installed *production* snap bundle redirects to the
  github.io dapp URL. Use the dev build (`yarn start`) and reinstall so it points
  to `localhost:8000`; or just open `localhost:8000` manually.
- **Webpack has node polyfills disabled** (`crypto/stream/... : false`, no
  `Buffer`). Use **ethers** (browser-safe) in the site, not `@ethereumjs/*`.
- **`exactOptionalPropertyTypes` is on** — optional fields that may be `undefined`
  need explicit `| undefined`. Snap state must be JSON (no `undefined`).
- **Duplicate requests** in the list = you clicked Sign twice; reject extras.

## 9. Changelog (commits on `main`, newest last)

- `e57f820` feat: initialize project structure (forked MetaMask Simple Keyring
  Snap; MIT-0/Apache-2.0). Snap + companion-dapp scaffold.
- `de05aa6` docs: lock idea.md to the Account Management Snap architecture
  (decision log: Snap chosen over a separate QR app and a MetaMask-mobile fork).
- `6aba4b3` feat(site): card signer + request signing (crypto-verified). Adds
  `card.ts` (SimulatedCard) + `signing.ts`; round-trip tested.
- `c6fbee9` feat(site): wire card + clear-signing into the companion dapp.
  `createAccount` taps card; `ClearSignPanel`; `approveWithCard`; `?demo=1`.
- `a9d688f` fix(snap): allow the local companion dapp (localhost:8000) to drive
  the keyring (`endowment:keyring.allowedOrigins`).
- *(pending)* fix(site): route the dashboard "Approve Request" button through the
  card so it can't call the snap without a signature.
- *(pending)* fix(snap): harden `#getCompanionUrl()` with `localhost:8000` fallback;
  rebrand snap manifest to "NotWallet".
- *(pending)* feat(site): EIP-712 typed-data signing (`eth_signTypedData_v3/v4`)
  in `signing.ts`; `clearSignTypedData()` in `clearsign.ts` with ERC-2612 Permit,
  Permit2, Seaport detection.
- *(pending)* feat(site): `HaloCard` implementation (`card-halo.ts`) — real Arx
  HaLo NFC chip signer via `@arx-research/libhalo` WebNFC. Activate with
  `?card=halo`. Key never leaves the chip.
- *(pending)* feat(site): premium dark glassmorphism clear-sign UI
  (`clearsign-ui.css`). Rebuilt `ClearSignPanel` with 4 demo scenarios
  (infinite approval, ETH transfer, ERC-2612 Permit, personal sign),
  transaction/typed-data detail views, risk-color coding, animations.

**Summary of what the code does now:** MetaMask (Flask) gets a custom EOA account
backed by an offline card (simulated or real HaLo NFC). The snap holds only
public data and cannot sign. Any signing request — transactions, messages, AND
EIP-712 typed data — is parked and handed to the companion dapp, which
clear-signs it (plain English + risk flags for Permit/Permit2/Seaport phishing),
has the card sign the exact digest, and relays the signature back. A polished
dark-mode review screen is the demo centerpiece (`?demo=1` with 4 scenarios).
Verified through account creation in real Flask; live round-trip is the next
manual test step.

## 10. Paste-ready brief for another AI tool

> I'm building **NotWallet**: a **MetaMask Account Management Snap** (forked from
> MetaMask's Simple Keyring Snap, Yarn-3 monorepo: `packages/snap` + a webpack
> React companion dapp `packages/site` on :8000, snap served on :8080, tested in
> **MetaMask Flask**). **Invariant: the private key must never be in the snap or
> on the host.** The snap stores only `address`/`publicKey`/`cardLabel`, is
> always-async, and `approveRequest(id, {signature})` just relays a signature. A
> `CardSigner` interface (`packages/site/src/card.ts`) does the signing —
> `SimulatedCard` (ethers, dev) or `HaloCard` (`card-halo.ts`, real Arx NFC chip
> via `@arx-research/libhalo` WebNFC; activate with `?card=halo`). `signing.ts`
> builds the exact result MetaMask expects for `eth_signTransaction`,
> `personal_sign`, `eth_sign`, AND `eth_signTypedData_v3/v4` (EIP-712) from the
> card's signature; `clearsign.ts` produces a plain-English + risk-flag preview
> (detects ERC-2612 Permit, Permit2, Seaport phishing) shown before approval on
> a premium dark glassmorphism UI (`clearsign-ui.css`). **Use ethers, not
> @ethereumjs (webpack has node polyfills off).** Current step: manually test the
> live signing round-trip in Flask (`personal_sign` → `eth_signTransaction` on
> Sepolia → `eth_signTypedData_v4`). Next: phone secure enclave signer, MFKDF2
> multi-factor key derivation / ERC-4337 2-of-2 multisig, and the demo video.
> See `plan.md` §5/§6 for the full roadmap.
>
> **My question for you:** [ask your specific question here].
