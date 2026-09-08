# NotWallet — Build Plan v2 (Standalone WalletConnect Wallet)

> A free, seedless, self-custody phone wallet that shows you **exactly what you're
> signing** — key derived from a password + any NFC card, never stored.

**This doc is the source of truth. It is written so another AI tool (or a fresh
chat) can build from it without re-deriving context.** Read §0–§2 for the model,
§3 for the crypto, §5 for the module contracts, §6 for sponsors, §8 for the UI.

---

## 0. What changed from v1 (and why)

v1 was a MetaMask **Account-Management Snap** + a desktop companion + a phone
signer, linked by hand-rolled QR-both-ways. We are **pivoting to a standalone
WalletConnect wallet**. Reasons:

- The snap needed the phone app anyway, so it saved the user nothing.
- Custom account snaps **can't be listed** in MetaMask (allowlist closed) → no path to real users.
- **WalletConnect is the standard relay**: a dapp shows a QR, the phone scans it *once*, and every request/response flows over the encrypted relay. This **removes the desktop-camera problem** and works with **every** dapp.
- Everything we built (MFKDF signer, `signing.ts`, `clearsign.ts`, persistence) **carries over unchanged**.

**The snap stays in the repo (`notwallet/`) as an optional "also works in MetaMask
(Flask)" bonus for the submission — not the product.**

---

## 1. Non-negotiable invariants (never violate)

1. **The private key never persists and never leaves the phone.** It is derived
   at sign time from the user's factors, used, and dropped. Nothing at rest is a key.
2. **What you see is what you sign.** The Review screen is computed from the exact
   bytes that will be signed — deterministic, offline, no LLM in the approval path.
3. **No custodian, no seed phrase, no server holds funds or keys.** Any backend is
   for *public* data only (indexing, relay, proof verification).
4. **Honest framing.** App-layer policies are advisory (EOA can't enforce on-chain).
   Say so. Never claim "AI." Never claim on-chain caps we don't have.

---

## 2. Architecture

```
┌──────────────────────┐   WalletConnect QR (shown by the dapp)
│  Any dapp (desktop/   │ ─────────────────────────────────────────►  scan once
│  mobile browser)      │                                             ┌───────────────┐
│  Uniswap, OpenSea, …  │ ◄─── session established over WC relay ───► │  NotWallet    │
└──────────────────────┘   session_request (sign) / response         │  (phone app)  │
                                                                      └──────┬────────┘
                                                                             │
  On each request the phone: decode → CLEAR-SIGN (plain English + ENS + risk) │
  → user confirms → derive key (password + card) → sign → wipe → return over WC
```

- **No snap. No companion dapp. No custom relay.** WalletConnect (Reown WalletKit)
  is the transport.
- **One app.** It is the wallet: holds the account (public identity persisted),
  shows balances, connects to dapps, clear-signs, and signs with MFKDF.

---

## 3. MFKDF spec (DECIDED: 2-factor for v1)

```
privateKey = scrypt(password, salt = sha256("notwallet|v1|" + counter + "|" + cardId))
             N = 2^15, r = 8, p = 1, dkLen = 32   →  sign  →  drop from memory
```

- **Factor 1 — password** ("know"): never stored. The real cryptographic secret.
  **Enforce a strength check** (length + entropy) at setup; scrypt raises brute-force cost.
- **Factor 2 — NFC card id** ("have"): read-only UID of *any* NFC card (native
  `IsoDep`/`NfcA`). Raises the bar (an attacker needs physical proximity to clone it),
  but is clonable/semi-public — so the password must be strong. Typed fallback allowed.
- **Recoverable anywhere:** same password + same card ⇒ same key on any phone. **No
  seed phrase, and no phone lock-in.** This is the whole reason we chose 2-factor.

**Opt-in 3rd factor (advanced, later):** a device-bound secret in the OS keystore
(`expo-secure-store`) for phone-binding — BUT only if we also ship an **encrypted
backup** of that secret (encrypted with the password, exported as a QR/file), or
losing the phone loses the funds. Do NOT ship device-binding without backup.
Default v1 is **2-factor, no device lock-in.**

Determinism + validity: if a scrypt output is ≥ curve order (astronomically rare),
bump `counter` and re-derive (see `mfkdf.ts`).

---

## 4. Core flows

**Create / unlock wallet:** password + card → derive → show address; persist the
**public identity only** (`address`, `publicKey`, `label`, optional ENS name). App
launches **locked**; unlock re-derives to sign.

**Connect to a dapp:** dapp shows a WalletConnect QR → user taps "Connect" →
camera scans → WalletKit pairs → approve the session (show dapp name + verified
domain from WC metadata).

**Sign a request:** WalletKit emits `session_request` →
`previewRequest()` + `clearSign()` (+ ENS resolution) render the **Review** screen →
user confirms → (high-risk? Selfie Check) → derive key → sign →
- `personal_sign` / `eth_sign` / `eth_signTypedData_v4` → return the signature.
- `eth_sendTransaction` → sign **and broadcast** via RPC → return the tx hash.
→ respond over WC → wipe key.

---

## 5. Module map (contracts for implementers)

Location: `notwallet-app/src/`. Each module lists **responsibility / inputs /
outputs / acceptance**. Keep pure logic framework-agnostic and unit-testable.

| File | Status | Responsibility & acceptance |
|---|---|---|
| `mfkdf.ts` | KEEP | `MfkdfSigner(cardId, password)` → `getIdentity()`, `signDigest(digest)`. scrypt params above. **Accept:** deterministic; both factors required; sig recovers to address (unit-tested). |
| `signing.ts` | MODIFY | Add `signAndBroadcast(tx, signer, rpc)` for `eth_sendTransaction` (sign → send → return hash). Keep `previewRequest`, `signRequestWithCard` for the rest. **Accept:** a live Sepolia tx broadcasts and returns a hash. |
| `clearsign.ts` | MODIFY | Add ENS-aware summaries + impersonation flag (see `ens.ts`). Keep rules (infinite approval, setApprovalForAll, Permit/Permit2, new-counterparty). Deterministic, offline for the rules; ENS is an async enrichment layer that must fail-open (no ENS ⇒ still show hex + rules). |
| `nfc.ts` | MODIFY | Native NFC via `react-native-nfc-manager` (`IsoDep`, `NfcA`), 15s timeout, always `cancelTechnologyRequest` in finally. Return UID string. Typed fallback in UI. |
| `walletconnect.ts` | NEW | Init Reown WalletKit (`@reown/walletkit` + `@walletconnect/core` + `@walletconnect/react-native-compat`). Handle `pair(uri)`, `session_proposal` (approve with our account + chains), `session_request` (route to the signer via a callback the UI supplies), `respondSessionRequest`. **Accept:** connect to https://react-app.walletconnect.com or a real dapp; sign a message end-to-end. |
| `ens.ts` | NEW | ENSv2 on Sepolia: `resolveName(name)`, `lookupAddress(addr)` (reverse), `forwardMatches(name, addr)` (anti-impersonation), `registerSubname(label, addr, records)`, `setTextRecord`. Use the ENSv2 Universal Resolver contract directly (ethers may not resolve ENSv2 out of the box). **Accept:** a known Sepolia name resolves; a registered subname resolves back. |
| `storage.ts` | KEEP/MODIFY | `expo-secure-store` for the **public** account identity + settings (recovery address, policies, ENS name). Never store password/key. Add multi-account/multi-card later. |
| `policies.ts` | NEW (2nd tier) | Pure functions: given a decoded tx + settings, return `{ action: 'allow'|'warn'|'block', reason }`. Infinite-approval → offer capped amount; per-tx cap → warn; `setApprovalForAll` → warn. **Advisory only** — enforced in-app, documented as such. |
| `approvals.ts` | NEW (2nd tier) | Query the **NotWallet subgraph** (The Graph) for the address's live ERC-20/721 allowances; `revoke(spender, token)` = `approve(spender, 0)` signed via the signer. |
| `recovery.ts` | NEW (2nd tier) | Set an immutable recovery address (stored + optional ENS text record); "sweep" = batch-send all balances to it + `approve(spender,0)` for known approvals. **Document the race caveat** (an attacker with the key competes). |
| `worldid.ts` | NEW (sponsor) | `@worldcoin/idkit-react-native` Session + `react-native-quick-crypto` polyfill. `verifyHuman()` → runs Selfie Check, returns a proof; verify proof server-side (small endpoint) or via World's verify API. Gate high-risk ops only. |
| `theme.ts` | NEW | Design tokens (see §8) — the single source for colors/space/type/motion. |
| `App.tsx` | REWRITE | Screen router + state. Screens per §8. |
| `index.ts` | MODIFY | `react-native-get-random-values` first; then WC compat import. |
| `app.json` | KEEP | Permissions/plugins already set; add `react-native-quick-crypto` when World lands (one more dev build). |
| `qr.ts` | DELETE | Replaced by WalletConnect. |

Delete/retire in `notwallet/packages/site`: the companion dapp's phone-bridge/pairing/QR paths (the snap stays as the optional bonus, but is no longer on the critical path).

---

## 6. Sponsor integrations (exact requirements → what we build)

### 6.1 ENS — "Best Use of ENSv2" ($4,500). CENTRAL. Build order L2 → L3 → L1.
- **L2 (do first, highest value/lowest risk): identity-aware clear-signing.** In the
  Review screen, resolve the counterparty via the **ENSv2 Universal Resolver on
  Sepolia**; verify forward resolution matches (anti-impersonation); show
  `Send 0.5 ETH to vitalik.eth ✅ (0xd8dA…6045)`, and flag
  `🚨 "uniswap.eth" does NOT resolve to this address`. *Central: it improves the core product.*
- **L3: recovery address as an ENSv2 text record** on the wallet's subname (public,
  auditable).
- **L1 (if time): a NotWallet subname registrar** — issue `you.notwallet.eth` at
  setup, one-per-address, with **Enhanced Access Control** roles (owner vs registrar).
  ENSv2 write support is preview — hardest piece; a simpler subname issuance may suffice.
- **Qualify:** ENSv2 on Sepolia, central (not cosmetic), functional (no hard-coded
  values), open source + demo video.

### 6.2 World — "Selfie Check" ($3,500). Gate high-risk ops.
- Trigger Selfie Check ONLY on: recovery activation, policy override, first-time
  large transfer. "Prove a live human is present before this irreversible action."
- **Qualify:** meaningful Selfie Check use as a *risk/abuse-prevention* signal;
  working app; test via World ID **Sandbox App**; include the required **feedback doc**.
- Tech: `@worldcoin/idkit-react-native` + `react-native-quick-crypto`; verify proof
  off the client. Docs: docs.world.org/world-id/credentials/11.

### 6.3 The Graph — AI/Data Use-Case, from-scratch ($5,000). Powers approvals + alerts.
- Author a **subgraph** (Subgraph Studio) indexing ERC-20/721 `Approval` /
  `ApprovalForAll` / `Transfer` for the user's address; the app queries it **live**
  for the **Approvals dashboard** and to **detect unauthorized activity**.
- **Qualify:** The Graph is *load-bearing* (the app's data source), consume **live**
  data (not mocked), and do **meaningful work** (risk reasoning/decisions, not just
  printing). Open source + demo video.

### Dropped (with reason)
- **Privy** — forced two-tier hot/cold contradicts "your key, your phone"; muddles the model.
- **Ledger** — 2026 prize wants the Agent Stack; not our project.

---

## 7. Feature tiers (honest scope)

**Tier 1 — MUST (proves the thesis, sharp core):**
1. Standalone **WalletConnect** connect + sign.
2. **Clear-signing + ENS identity** (the differentiator).
3. **MFKDF signer** (2-factor).
4. **App-layer policies** as warnings/choices (infinite-approval block, per-tx cap) — honestly advisory.
5. **World Selfie Check** on override.
6. **Excellent UI** (§8) — this is a wallet; trust is visual.

**Tier 2 — SHOULD (add once Tier 1 is solid):**
7. **The Graph** subgraph → **Approvals dashboard** + one-tap revoke.
8. **Recovery vault** (pre-set address + sweep; document the race).
9. **Unauthorized-activity alert** (poll on app-open + optional small push backend — NOT unreliable 30s background polling).

**Tier 3 — NICE:** multi-card, decoded tx history, ENS L1 registrar, device-binding-with-backup (3rd factor).

*Anti-scope: we win on a sharp, trustworthy, seedless wallet that de-blinds signing — not on 14 half-features. Cut before diluting.*

---

## 8. UI / UX — this must look and feel like a wallet people trust

**Design principles:** calm, confident, security-forward. Generous space, one clear
action per screen, and a **Review screen that is the emotional peak** (this is where
trust is won). Motion is subtle and purposeful. Dark-first.

### 8.1 Design tokens (`theme.ts`)
```
Color (dark):
  bg        #0B0D12     surface   #141821     surfaceAlt #1B2029
  border    #262C38     text      #EAF0F7      textDim   #8A97AD
  brand     #6C63FF     brandSoft #A7A2FF      onBrand   #FFFFFF
  ok/green  #35C08E     warn      #E7B008      danger    #FF5A65
  success bg#122A22     warn bg   #2A2611      danger bg #2A1518
Type:  Inter (UI) + a mono (addresses/amounts). Sizes 12/14/16/20/28/40; weights 400/600/700.
Radius: 12 (inputs/cards), 20 (sheets), 999 (pills). Space scale: 4/8/12/16/24/32.
Motion: 180ms ease-out enter; spring on the tap-to-sign; risk banner subtle pulse (danger only).
Elevation: soft shadows on cards/sheets; never harsh.
```

### 8.2 Component kit
- **Buttons:** Primary (brand, full-width, 52px), Secondary (outline), Ghost (text), Danger (for irreversible). Loading = inline spinner, never layout shift.
- **AddressChip:** shows ENS name + verified ✓ when resolved, else truncated hex; tap to copy; ⚠️ state for impersonation.
- **RiskBadge:** INFO / WARN / DANGER pill using ok/warn/danger + soft bg.
- **Card / Sheet:** rounded surfaces; bottom sheets for confirmations.
- **Inputs:** large (52px), clear focus ring (brand), password + card row with a "📇 Tap" affordance and a live "reading…" state.
- **CardTapConfirm:** the signature affordance — an animated card/NFC glyph; press-and-hold or tap → derive → success check with a spring.

### 8.3 Screens (layout + intent)
1. **Onboarding / Unlock** — brand mark; "Your key, your phone, no seed phrase."
   Password + card row; primary "Unlock". Strength meter on the password. First-run
   adds a recovery-address step and (optional) ENS subname claim.
2. **Home / Portfolio** — top: account pill (ENS name + 🔒/🔓, network). Big balance.
   Below: token list (icon, name, amount, fiat). Primary actions: **Connect a dapp**,
   **Approvals**, **Recovery**. Empty state guides funding on Sepolia.
3. **Connect** — full-screen camera to scan the WalletConnect QR; on pair, a sheet
   shows the dapp (name, **verified domain**, requested chains/permissions) → Approve/Reject.
4. **Review & Sign (HERO)** — the peak. Top: RiskBadge + the dapp identity. Center:
   **one plain-English sentence** in large type ("Give **UNLIMITED** USDC approval to
   `0xba5e…` ⚠️"). AddressChips resolve ENS with ✓/⚠️. Expandable "Details" (raw
   calldata, decoded fields, amounts in mono). Policy line if triggered
   ("Infinite approval — [Approve capped 10,000] [Reject] [Override]"). Bottom:
   **CardTapConfirm** ("Tap your card to sign") — password already in session, or a
   quick unlock. DANGER state tints the screen edge and requires an extra beat.
5. **Selfie Check (conditional)** — a calm interstitial before high-risk overrides:
   "Prove a real person is here" → World flow → ✅ → proceed to card tap.
6. **Approvals dashboard** — list of live allowances (token → spender AddressChip,
   amount, ⚠️ if unlimited/unknown), one-tap **Revoke**. Pull-to-refresh; "new unknown
   approval" highlighted.
7. **Recovery** — set/confirm the immutable recovery address (with ENS resolve);
   a prominent, guarded **"Emergency sweep"** (double-confirm + Selfie Check).
8. **Settings** — policies (limits, toggles), network, card management, "Forget wallet",
   and the honest security explainer.

### 8.4 Quality bar
- Every destructive/irreversible action: distinct color, confirmation, and (where
  set) a policy/selfie gate. Never a bare "Confirm."
- Loading and error states designed (skeletons for balances; friendly errors with a next step).
- Accessibility: 44px+ touch targets, sufficient contrast, dynamic type friendly.
- Consistency: everything pulls from `theme.ts`; no ad-hoc colors.

---

## 9. Build order (dependency-first)
1. **Prove the dev build** on the phone (EAS) with the current app — de-risk native pipeline first.
2. `theme.ts` + component kit + Home/Unlock shell (persistence already done).
3. **WalletConnect** connect + `personal_sign` end-to-end (the backbone).
4. `eth_sendTransaction` sign-and-broadcast; typed-data.
5. **ENS L2** identity in the Review screen (the differentiator).
6. **Policies** (advisory) in Review.
7. **World Selfie Check** on override (adds a native module → one more build).
8. **The Graph** subgraph + Approvals dashboard.
9. Recovery vault + alerts.
10. Demo video + submission (ENS + World + Graph writeups, FEEDBACK docs).

---

## 10. Shared constants / contracts (do not diverge)
- **KDF:** scrypt, N=2^15 r=8 p=1 dkLen=32, salt = `sha256("notwallet|v1|"+counter+"|"+cardId)`.
- **Chain (demo):** Sepolia (chainId 11155111). RPC: a reliable public Sepolia RPC.
- **WalletConnect:** Reown project id from cloud.reown.com; namespaces `eip155:11155111` (+ mainnet for reads).
- **Signed-tx result:** for `eth_sendTransaction` return the broadcast tx hash; for
  signatures return the 65-byte hex (personal/eth_sign) or the typed-data signature.
- **ENS:** ENSv2 Universal Resolver (Sepolia) address — fill in from ENS docs; resolver
  interface for text records.

## 11. Open decisions — RESOLVED
- MFKDF = **2-factor** (recoverable). Device-binding only with encrypted backup, later.
- Sponsors = **ENS + World + The Graph.** Drop Privy, Ledger.
- Transport = **WalletConnect** (standalone). Snap kept only as an optional bonus.
- Monitoring = **on-open + optional small push backend**, NOT unreliable 30s background polling.

## 12. The 30-second pitch
> I lost crypto when my PC was hacked — the key was on disk. A hardware wallet would
> have saved me, but a $55 device felt absurd for a beginner. **NotWallet is a
> hardware-grade wallet that costs nothing**: your phone, a password, and any NFC
> card you already carry. Two factors, both required, **nothing stored, no seed
> phrase**. It connects to any dapp with one QR scan, and before you sign it tells
> you in plain English exactly what you're approving — resolving ENS names so you
> see `uniswap.eth ✅`, not a hex address you can't verify, and blocking the
> unlimited-approval traps that drain people. Free, self-custody, and it actually
> shows you what you're signing.
