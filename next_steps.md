# NotWallet — Next Steps (execution checklist)

Actionable build order for `notwallet-app/` (the standalone WalletConnect wallet).
Pairs with **[new_plan.md](new_plan.md)** (the spec). Do steps top-to-bottom; each has
an **acceptance** you can verify before moving on. Written so any AI tool can pick up
mid-list.

Legend: 👤 = a human must do it (accounts/keys/device). 🤖 = code, any AI can do it.

---

## 0. Foundations (do before features)

- [ ] 👤 **Prove the dev build on the phone first (de-risk native).**
  ```bash
  cd notwallet-app
  npm i -g eas-cli && eas login && eas init
  eas build --profile development --platform android   # ~10–20 min, cloud
  ```
  Install the APK on the spare Android phone → `npx expo start --dev-client`.
  **Accept:** the current app boots, creates a wallet, persists across restart,
  NFC tap reads a UID, camera opens.
- [ ] 👤 **Create a Reown (WalletConnect) project** at cloud.reown.com → copy the
  **projectId**. Put it in `notwallet-app/.env` as `EXPO_PUBLIC_WC_PROJECT_ID`.
- [ ] 🤖 Add `theme.ts` (tokens from new_plan §8.1) and refactor existing screens to it.
  **Accept:** no hard-coded colors remain; app matches the dark design system.

## 1. WalletConnect backbone (Tier-1 core)

- [ ] 🤖 Install: `npx expo install @reown/walletkit @walletconnect/core @walletconnect/react-native-compat`
  (and its polyfills). Import `@walletconnect/react-native-compat` **first** in `index.ts`.
  ⚠️ Adds native deps → **one new `eas build`** after this.
- [ ] 🤖 `walletconnect.ts`: init WalletKit with the projectId; implement `pair(uri)`,
  `onSessionProposal` (approve with our account on `eip155:11155111`), `onSessionRequest`
  (hand the request to a UI callback), `respond`.
- [ ] 🤖 `App.tsx`: **Connect** screen (scan WC QR → `pair`), session-approval sheet
  (dapp name + verified domain), and route `session_request` → **Review** screen.
- [ ] 🤖 `signing.ts`: add `signAndBroadcast` for `eth_sendTransaction`.
- **Accept:** connect to a real dapp (e.g. Reown's sample or a testnet Uniswap), do
  `personal_sign` and a Sepolia `eth_sendTransaction` end-to-end, see it on the explorer.

## 2. Clear-signing + ENS identity (the differentiator, Tier-1)

- [ ] 🤖 `ens.ts`: ENSv2 Universal Resolver on Sepolia — `resolveName`, `lookupAddress`,
  `forwardMatches`. Fail-open (no ENS ⇒ still render hex + rules).
- [ ] 🤖 `clearsign.ts`: enrich summaries with ENS (`to vitalik.eth ✅`) and add the
  impersonation flag when forward-resolution mismatches.
- [ ] 🤖 Build the **Review & Sign (HERO)** screen per new_plan §8.3(4): RiskBadge,
  big plain-English line, AddressChips, expandable Details, DANGER edge tint, CardTapConfirm.
- **Accept:** a known Sepolia ENS name shows verified; an impersonation test shows 🚨;
  the drainer (unlimited approval) shows DANGER before the tap.

## 3. Policies (advisory, Tier-1)

- [ ] 🤖 `policies.ts`: pure `evaluate(decodedTx, settings) → {action, reason}`.
  Infinite approval → offer capped amount; per-tx cap → warn; `setApprovalForAll` → warn.
- [ ] 🤖 Wire into Review as choices ([Approve capped] [Reject] [Override]); Settings screen to edit limits.
- **Accept:** infinite approval is blocked-with-choice; over-cap transfer warns. (Documented as app-layer.)

## 4. World Selfie Check (sponsor, Tier-1)

- [ ] 🤖 Install `@worldcoin/idkit-react-native` + `react-native-quick-crypto`
  (native → **one more `eas build`**). Add compat/polyfills.
- [ ] 👤 Create a World **Developer Portal** app; get the app/action ids; use the **Sandbox App** to test.
- [ ] 🤖 `worldid.ts`: `verifyHuman()` runs Selfie Check; verify the proof off-client
  (small endpoint or World verify API).
- [ ] 🤖 Gate high-risk ops only (override, recovery, first large transfer) with the Selfie interstitial.
- [ ] ✍️ Write the required **World feedback doc**.
- **Accept:** an override triggers Selfie Check in the sandbox and proceeds only on success.

## 5. The Graph — Approvals + alerts (sponsor, Tier-2)

- [ ] 👤 Create a **Subgraph Studio** subgraph; deploy a subgraph indexing ERC-20/721
  `Approval`/`ApprovalForAll`/`Transfer` on Sepolia; get the query URL + API key.
- [ ] 🤖 `approvals.ts`: query live allowances for the address; `revoke = approve(spender,0)` via the signer.
- [ ] 🤖 **Approvals dashboard** screen (list + one-tap revoke, ⚠️ unlimited/unknown).
- [ ] 🤖 Use the same live data to flag **unauthorized activity** on app-open.
- **Accept:** dashboard shows live approvals from The Graph (not mocked); revoke works;
  a new unknown approval is highlighted. Do *meaningful* reasoning, not just printing.

## 6. Recovery vault (Tier-2)

- [ ] 🤖 `recovery.ts`: set immutable recovery address (store + optional ENS text record);
  **sweep** = batch send balances + `approve(spender,0)` for known approvals.
- [ ] 🤖 Recovery screen: set/confirm + guarded **Emergency sweep** (double-confirm + Selfie Check).
- **Accept:** sweep moves funds to the recovery address on Sepolia. Document the race caveat.

## 7. Ship & submit

- [ ] 🤖 ENS L3 (recovery as text record); ENS L1 registrar only if time.
- [ ] ✍️ Per-sponsor writeups: ENS (central usage), World (feedback doc), Graph (subgraph + reasoning);
  Uniswap-style FEEDBACK.md not needed (Uniswap dropped).
- [ ] 👤 **Demo video (2–4 min)** — the before→after; connect → clear-sign catches a drainer → sign.
- [ ] 👤 Submit on ETHGlobal with public repo + video + live/APK.

---

## Standing rules for any implementer
- Keep the **invariants** (new_plan §1). Never store a key/password; never claim AI; policies are advisory.
- Every new **native module** = a new `eas build`; batch them (WalletConnect, then World) to minimize rebuilds.
- Pull all styling from `theme.ts`. Design every loading/error/empty state.
- Unit-test pure logic (`mfkdf`, `clearsign`, `policies`, `signing`) before wiring UI.
- The **snap** (`notwallet/`) stays only as an optional "also works in MetaMask (Flask)" bonus — not the critical path.
