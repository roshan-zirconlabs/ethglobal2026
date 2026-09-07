# NotWallet — Phone-as-Hardware-Wallet for MetaMask + Clear-Signing

> **Purpose of this doc:** The working spec for what we're building at **ETHOnline 2026**. It supersedes the earlier ideation notes. It captures the origin problem, the decision trail (what we rejected and *why*), the prior-art map, the technical architecture, the sponsor fit, and the concrete 9-day build + demo plan. A fresh chat should be able to continue from here cold.

---

## 0. TL;DR — what we're building

**A MetaMask Account Management Snap that adds a new account type backed by an offline NFC card — the signing key lives on the card, never on the PC — plus a companion dapp that shows a plain-English "what am I signing" screen on the phone before you tap. It ends *blind signing*, the gap even today's hardware wallets have.**

- **Inside MetaMask, no separate wallet app.** The user installs the Snap and just adds a "Card Account." They keep using MetaMask exactly as before.
- The private key is generated on and **never leaves the card's secure element** — it's never in the Snap, the extension, or on the host. Malware on the PC has nothing to steal, and **no card tap = no signature = no transaction.** Defeats the PC-malware attack that drained me.
- The companion dapp (on the phone) shows a **clear-signing screen** — plain English + risk flags — computed from the exact bytes the card will sign, so what you see is what you sign. **This is the novel part** vs. Keycard/Tangem, which sign blind.
- **The one-line pitch:** *"A hardware wallet that lives in a tap-card and inside the MetaMask you already use — and shows you what you're actually signing."*

**Architecture decision log (we evaluated three, this is why Snap won):**
- ❌ *Separate signer app (AirGap/Keystone QR):* works with shipping MetaMask, but it's *another app to install* — the exact thing we want to avoid.
- ❌ *Fork MetaMask Mobile + native NFC:* truest "in the phone wallet," but the license forbids shipping it and nobody stores funds in an unapproved wallet fork; also the heaviest/riskiest build.
- ✅ *Account Management Snap (chosen):* runs **inside official, user-trusted MetaMask**; user adds an account, no new wallet app. Trade-offs we accept: NFC tap happens in a companion **website** on an **Android** phone (WebNFC), and demo runs in **MetaMask Flask** because custom-account Snaps can't be listed in prod yet (§7). Open-sourced so anyone can self-install.

**Not multisig:** v1 is a single card + one tap, like a Ledger. The "card + FaceID, both required" 2-of-2 is roadmap (§10), not v1.

This directly answers the attack that started this whole project (see §1) and the phishing/blind-signing half of it too.

---

## 1. Origin & motivation (why this exists)

- I lost crypto after my **PC was hacked**. Funds were in a **MetaMask hot wallet**; malware reached the key/keystore on disk and drained it. **This is the core lived problem.**
- The only thing that would have saved me: a **hardware wallet whose key is not on the compromised machine and which requires a separate physical approval to sign.**
- But the hardware-wallet ecosystem is **too expensive and fragmented** for newcomers. A $100 Ledger makes no sense to someone holding $500–800. New users deserve a safe default that's free and uses hardware they already own (their phone).
- **North star:** lower the barrier — make the safe path the default. Ideally the thing a newcomer uses *alongside/instead of* a bare MetaMask hot wallet.

## 2. My background (for calibrating suggestions)

- **Blockchain + full-stack developer.** Strong in **Solidity / EVM internals / smart-contract auditing**; comfortable at the **bytecode level** and with **Foundry** (gas/optimization work). Some **Rust**.
- I value **building from scratch** and solving a **real problem** — not shaving 150ms→140ms off something that exists.
- **My unfair advantage: a risk-aware "is this action actually safe?" brain.** Most hackers can build a wallet UI; few can build the safety/clear-signing engine inside it. That engine is the through-line of this project.

---

## 3. The decision trail (what we rejected and why)

We explored several framings before landing here. Keeping the reasoning so we don't re-litigate it.

- **Vendor tap-to-pay card (tap your card on a vendor's phone to pay).** *Rejected as the main product.* It's a **two-sided network** (needs both vendors and users) — the hardest thing for a solo dev to bootstrap; crypto-at-checkout has **weak demand**; and physical-card distribution is slow/expensive. Also **already built as a hackathon demo — "Ethercard"** — so it's low on novelty. (See §4.)
- **"Use any bank/arcade card you already own" as a signer.** *Impossible.* EMV bank chips are cryptographically locked by the issuer (need Visa/MC Security Domain keys); MIFARE arcade cards have no compute. No ZK trick makes a bank card *produce an Ethereum signature on demand*. A real signer must be a purpose-built secure element (phone enclave, HaLo, Keycard, Tangem).
- **AI-agent spending guardian (card = human-in-the-loop for an AI agent).** Strong idea and denser sponsor fit, but it **drifts from my actual problem** (protecting a human's own funds from key theft). Parked as a possible extension, not the core.
- **"Upgrade my EOA to a smart account (EIP-7702)" for protection.** *A trap — does NOT solve key theft.* 7702 attaches code to an EOA but **the raw private key stays the root of authority**. A stolen key still drains you and can even re-delegate. Since 7702 shipped it has made drains *worse* (sweepers; $2.3M+ confirmed stolen; one $1.54M phishing loss). 7702 is a UX/features layer, **not** a security root. **We do not build our security on 7702.**
- **MFKDF three-factor unlock (card + phone-enclave HMAC + password).** Genuinely strong self-custody idea (academic basis: MFKDF2 — study the corrected version, not the original), but **too much to demo in 9 days** and the seed briefly hits RAM at sign time. **Kept as roadmap**, not v1.

**The core truth we're designing around:** you cannot retroactively secure a key that has been on a compromised machine. Security = **the authority key lives in tamper-resistant hardware and never appears in extractable form on the host.** A *new* account whose signer is hardware — not an upgrade of the drained EOA.

---

## 4. Prior-art / competitive map (what already exists)

The building blocks all exist separately. Our gap is a specific *combination*, and the honest differentiator is **UX/integration, not crypto novelty** (which is fine — Tangem won on UX).

| Piece | Exists? | What it is | Our gap |
|---|---|---|---|
| Hardware-backed signing *as a MetaMask Snap* | ✅ **CubeSigner Snap** | Keyring-API signing, but "hardware" = **cloud HSMs (AWS Nitro)**, not the user's device | Ours is the **user's own** phone/card, in-hand, self-custody |
| NFC card → sign for MetaMask | ✅ **Keycard, Cryptnox, Tangem, TAPSIGNER** | Real shipping products; tap card to sign | "NFC card signs for MetaMask" is done — not our claim |
| Phone Secure Enclave → 4337 smart account | ✅ **Opclave** (ETHGlobal), Coinbase Smart Wallet | P-256 enclave key owns a smart account via precompile | The P-256 smart-account path is well-trodden |
| **Phone enclave as a signer *inside MetaMask*, no purchase, self-custody** | ❌ **Not found** | — | **This is our gap** |
| Vendor tap-to-pay card | ✅ **Ethercard** (ETHGlobal): receiver requests payment, sender taps card on receiver's phone; ZK "proof of key ownership" + account abstraction/paymaster | Already demoed 3 yrs ago | Why we dropped that framing |
| MFKDF (card+enclave+password) unlock | ⚠️ Academic only (MFKDF2) | No shipped product | Roadmap, not v1 |
| clear-signing / risk brain at the approval step | ⚠️ Partial (Blockaid, Wallet Guard scan txns) | Nobody fuses it *into a hardware-approval step* | Our unfair advantage |

**Verdict:** "another hardware signer for MetaMask" would look derivative. **"The free, no-purchase hardware wallet that lives in your phone, plugs into MetaMask, and explains what you're signing"** is the open, defensible angle.

---

## 5. Technical architecture

### 5.1 How it plugs into MetaMask (DECIDED: QR external signer)
- **MetaMask is source-available (proprietary license since 2020) — we do NOT fork it.** We connect as an **external QR signer**, which MetaMask supports natively on **mobile and desktop** (the same path as Keystone, AirGap Vault, NGRAVE — no Snap, no dev build, no allowlist).
- Our phone app speaks MetaMask's **animated-QR protocol** via the **Keystone SDK** (`@keystonehq/keystone-sdk` + `@keystonehq/bc-ur-registry-eth`, BC-UR encoding). Pairing = MetaMask reads the account QR once; thereafter MetaMask shows an unsigned-tx QR, the phone scans it, and returns a signature QR.
- **Signing flow:** MetaMask builds the unsigned tx → shows QR → **phone scans → clear-signing screen → FaceID → sign in the enclave → phone shows signature QR → MetaMask scans → broadcasts.** The phone is air-gapped end-to-end.
- **Demo topology:** desktop MetaMask (normal, unmodified) ↔ our phone signer app, connected only by on-screen QR + phone camera. Two devices = the real security story (browse on PC, sign on phone). Same-device (MetaMask mobile + our app, via deeplink) is possible but weaker — mention, don't lead with it.
- **Prior art we reuse vs. beat:** we reuse the QR transport (AirGap/Keystone already do it). We **beat** them on the thing they lack — clear signing (§5.3). The community even built a standalone tool just to de-blind AirGap+MetaMask QR signing, proving the demand.
- **Snap path (set aside):** an Account Management Snap (Keyring API async flow) is the alternative, but it's extension-only, allowlist-gated (demo needs MetaMask Flask), and needs a phone↔PC relay we'd build ourselves. Kept as fallback only.

### 5.2 The signer (the one real trade-off to decide)
On a phone, the enclave **cannot natively sign secp256k1** (it does P-256 only). Two honest options:
- **(A) Enclave-wrapped secp256k1 key** — keeps a **plain EOA**; enclave holds a non-exportable *wrapping* key that encrypts the secp256k1 key. Weakness: the seed briefly exists in RAM at sign time. **Faster to build; good enough to show "key not on PC."**
- **(B) P-256 enclave key + ERC-4337 smart account** (via RIP-7212 precompile on Base/OP/Arbitrum/Polygon) — key **truly never leaves hardware**, but it's a smart account, not a plain EOA.

**v1 decision:** start with **(A)** for demo speed; be explicit in the video about which one shipped. Note (B) as the stronger production path. (This is the "plain EOA vs never-in-RAM" tension — for the real threat model, never-in-RAM wins long-term.)

### 5.3 The clear-signing brain
- At approval time, translate raw calldata/tx into plain English and flag risk: new/never-paid address, infinite approvals, unverified contracts, over-limit, lookalike addresses.
- This is the anti-phishing / anti-blind-signing half of the original attack, and it's the differentiator judges will remember.

---

## 6. Sponsor fit (ETHOnline 2026)

Primary, non-forced fits:
- **Ledger ($5k)** — **best fit.** Continuity track literally rewards "add Ledger signing, Key Ring backend, or **device confirmations to existing applications**"; main track = hardware-secured secrets + **human-in-the-loop approvals**. Our phone approval + clear-signing is exactly this.
- **Privy ($5k)** — embedded self-custodial wallets / policies; "card-like spending," financial flows. Natural if we add spending limits.
- **World ($7k)** — bind the account to a **verified human** (World ID / Selfie Check) as an optional factor.
- **ENS ($5k)** — human-readable account name; cheap add-on.

Full pool for reference: The Graph $15k · Hedera $15k · Arc $10k · World $7k · 1inch $7k · ENS $5k · **Ledger $5k · Privy $5k** · Uniswap $5k · Chainlink $3k · Bazantic $3k.
**Target 2–3 clean hits (Ledger + one or two of Privy/World/ENS). Don't sprinkle shallowly — judges penalize it.**

---

## 7. Event logistics & feasibility

- **ETHOnline 2026: Sept 4–16, 2026 (async). Submission deadline Sunday, Sept 13, 12:00pm EDT.** ~9 working days.
- **Demo/dev needs no audit or allowlist:** we connect to *unmodified, shipping* MetaMask as a QR signer — nothing to get listed or approved. **Everything runs on my own laptop + phone; no dev build required.**
- Judging weights: functionality/code quality, novelty, real-world applicability, UX, open-source. **The demo video (2–4 min) is ~half the effort** — only work done during the event counts.

### Local build loop
1. **Our phone signer app** = a small web app / PWA (works over the phone browser; Android Chrome also gives us WebNFC later for the card). Key generated + sealed in the secure element; biometric (WebAuthn/FaceID) to unlock.
2. **QR transport via the Keystone SDK** (`@keystonehq/keystone-sdk`, `@keystonehq/bc-ur-registry-eth`) — encode the account/signature URs, decode MetaMask's unsigned-tx URs. Test against a normal MetaMask ("Connect hardware wallet → QR-based").
3. **clear-signing** = decode the tx, run a deterministic rules engine to produce the plain-English summary + risk flags, shown before the FaceID prompt.
4. **Reference, don't fork:** read Keystone's dev hub + `ur-registry` and AirGap Vault for how they seal keys / build the QR frames; build our own lean app so we own the UX (AirGap's UX is the thing we're improving).
5. No physical card needed for v1; the enclave is the single signer.

---

## 8. 9-day scope

**Must-have (proves the thesis):**
- Phone signer app: enclave-protected key (option A), biometric unlock, QR pairing with unmodified MetaMask via the Keystone SDK.
- Round-trip signing: MetaMask tx-QR → phone scans → signs → signature-QR → MetaMask broadcasts.
- **clear-signing screen** before approval (this is the differentiator — do NOT cut it).
- Screen-recordable **before→after** (see §9).

**Add if time:**
- The **clear-signing** screen (highest impact after the core).
- Spending limits (pulls in Privy framing).
- World ID / ENS name on the account.

**Cut (roadmap only, mention in video):**
- MFKDF three-factor, physical card / HaLo, multisig / multi-card backup, swaps/perps, option B smart account.

---

## 9. Demo video script (2–4 min, recordable on my laptop + phone)

1. **Before:** normal MetaMask hot wallet. Show the key/keystore sitting on disk — the exact thing malware drained on my PC (optionally show a script reading the keystore).
2. **After:** pair our phone signer with MetaMask by scanning one QR ("Connect hardware wallet → QR"). **The key is not on the PC — it's sealed in the phone's secure element, and the phone never touches the PC.**
3. **Sign flow:** initiate a send in desktop MetaMask → it shows a QR → phone scans it → **plain-English clear-signing screen** ("Send 0.5 ETH to 0x… — a new address you've never paid; looks safe") → FaceID → phone shows the signature QR → MetaMask scans it → broadcasts. Contrast with AirGap/Keystone, which would sign this blind.
4. **Kill shot:** simulate the malware — "attacker on this PC tries to drain the wallet" → the tx **can't be signed**: the key isn't here and the phone never approved. Thesis proven in ~20 seconds.

---

## 10. Open decisions / next actions

- [ ] Confirm signer option **A vs B** for v1 (leaning A for speed).
- [ ] Decide the 3rd sponsor (Privy vs World vs ENS) based on remaining time.
- [ ] Name check: **"NotWallet"** (ironic — "not a wallet, a key"). `notwallet.io` taken; `.app`/`.money` cheap & available — verify `notwallet.com` before committing. Cross-check USPTO/app stores.
- [ ] Scaffold: fork **Simple Keyring Snap** + companion dapp into this repo; stub the phone-signer relay; get a running Flask demo.

## 11. Why apps like this historically fail (keep honest)

Only **Tangem** reached real consumer adoption among card/tap-to-pay attempts; most died for **non-technical** reasons — people don't value security until after a loss; "free + open-source" pattern-matches to drainer scams (price is a trust signal); squeezed between "easier = MetaMask" and "safer = Ledger"; recovery is where trust-minimized wallets die; and hackathon demos rarely survive the 95% of work after the demo. **Takeaway:** the hard part is distribution/trust, not the crypto. Realistic payoff = an excellent open-source reference implementation + strong hackathon entry + portfolio piece that showcases the security skill — with a genuine shot at the **Ledger** prize.

---

## References
- ETHOnline 2026 prizes — https://ethglobal.com/events/ethonline2026/prizes
- MetaMask Keyring API — https://docs.metamask.io/snaps/reference/keyring-api/
- Custom EVM accounts (Snaps) — https://docs.metamask.io/snaps/features/custom-evm-accounts/
- Keystone × MetaMask QR integration (the protocol we speak) — https://blog.keyst.one/keystone-has-integrated-with-metamask-d3906547069d
- Keystone developer hub + Ethereum QR data protocol — https://github.com/KeystoneHQ/Keystone-developer-hub
- Keystone ur-registry (BC-UR encoding libs) — https://github.com/KeystoneHQ/ur-registry
- AirGap Vault (open-source phone air-gapped signer, reference) — https://github.com/airgap-it/airgap-vault
- Tool that de-blinds AirGap+MetaMask QR signing (proves the pain) — https://github.com/1Joy1/airgap-qr-scanner-decoder
- Simple Keyring Snap (SSK) — fallback Snap path — https://metamask.github.io/snap-simple-keyring/latest/
- Install MetaMask Flask — https://docs.metamask.io/snaps/get-started/install-flask/
- CubeSigner Snap — https://snaps.metamask.io/snap/npm/cubist-labs/cubesigner-snap/
- EIP-7702 in MetaMask — https://docs.metamask.io/smart-accounts-kit/get-started/smart-account-quickstart/eip7702/
- EIP-7702 attack surfaces (Nethermind) — https://www.nethermind.io/blog/eip-7702-attack-surfaces-what-developers-should-know
- Ethercard (prior art) — https://ethglobal.com/showcase/ethercard-zv78k
- Opclave (enclave + 4337, prior art) — https://ethglobal.com/showcase/opclave-94def
- Keycard — https://keycard.tech/
- Arx HaLo (cheap signer card, roadmap) — https://docs.arx.org/HaLo/overview
