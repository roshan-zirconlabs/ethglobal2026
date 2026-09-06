# notwallet-app (React Native / Expo) — PAUSED, resume later

We paused the native app to ship a web PWA first (`../notwallet-pwa`). This
records exactly what exists here and what's needed to resume, so no work is lost.

## What's already built (in `notwallet-app/`)
- **Expo SDK 57 app** scaffolded (blank-typescript), configured for a **dev build**:
  - `app.json`: name "NotWallet", package `com.notwallet.signer`, dark UI, plugins
    for `expo-dev-client`, `expo-camera` (QR scan), `react-native-nfc-manager`
    (NFC), `expo-local-authentication` (Face ID / fingerprint).
  - `eas.json`: `development` profile (developmentClient, internal, APK).
  - `index.ts`: imports `react-native-get-random-values` first (ethers entropy).
- **Ported crypto (pure TS, ethers-only)** in `src/`:
  - `mfkdf.ts` — MfkdfSigner: key = **scrypt**(password, salt=sha256("notwallet|v1|"+cardId)),
    N=2^15, r=8, p=1, dkLen=32. Derive → sign → drop. (scrypt chosen over Argon2
    because Hermes has no WASM; scrypt ships in ethers, no native module.)
  - `signing.ts`, `clearsign.ts`, `qr.ts` (transport + `account` pairing envelope),
    `card.ts` (signer interface), `types.ts` (local KeyringRequest/Json shims).
  - `nfc.ts` — reads a card UID via `react-native-nfc-manager`.
- **App.tsx** — 3 screens wired: Setup (password + card → unlock), Home (address
  + Sepolia balance + scan/pair buttons), Scan (expo-camera) → Review (clear-sign)
  → biometric → sign → signature QR; plus a Pair screen (account QR).

## Not done here (paused before)
- Never typecheck-clean-verified or built into an APK (paused at `tsc`).
- No EAS project id (`eas init`), no build run, not installed on a device.
- Persistence (account survives restart), request history, polish.

## To RESUME the native app later
1. `cd notwallet-app && npx tsc --noEmit` and fix any type errors.
2. `npx eas login` (free Expo account) → `npx eas init` → `eas build --profile development --platform android` → install the APK on the phone.
3. `npx expo start --dev-client`, open in the dev build.
4. **KDF must match the PWA** to keep the same account addresses: the PWA uses the
   SAME scrypt params (see `../notwallet-pwa/src/mfkdf.ts`). Keep them identical,
   or accounts created on one won't match the other.
5. The QR protocol (`notwallet.qr.v1`) and envelopes (`req` / `sig` / `account`)
   are shared with the PWA and the desktop companion — keep them in sync.

## Shared contracts (do not diverge across PWA / native / desktop)
- **KDF**: scrypt, params above, salt = sha256("notwallet|v1|"+counter+"|"+cardId).
- **QR protocol**: `notwallet.qr.v1`; kinds `req` (request), `sig` (signature),
  `account` (pairing: address + publicKey).
- **Signed-tx result shape**: ethers-assembled `{...txFields, type:number, v, r, s}`
  (see `signing.ts`) — the desktop snap relays it to MetaMask unchanged.
