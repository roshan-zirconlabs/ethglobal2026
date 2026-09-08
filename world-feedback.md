# World ID & Selfie Check — Integration Feedback & Architecture

## Overview
NotWallet integrates **World ID Selfie Check** as a live human-presence gate for high-risk and irreversible crypto actions:
1. **Spending Policy Overrides:** When a transaction exceeds the user's daily spending cap (e.g. > 1 ETH), a Selfie Check verifies a live person is present before allowing an override.
2. **Emergency Vault Evacuation:** When initiating a one-tap panic sweep of all ETH and token balances to an immutable recovery vault.
3. **First-time High-Value Approvals:** Protecting against automated drainers and device replay attacks.

---

## Integration Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ High-Risk Trigger (Policy Override / Emergency Vault Sweep) │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│              World ID Human Presence Check                  │
│  • Verifies live human presence via World ID Selfie Check   │
│  • Generates zero-knowledge proof with nullifier hash       │
│  • Zero personally identifiable data revealed or stored     │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Tangem-Style Card Tap                       │
│  • Only after human verification passes                     │
│  • Derives MFKDF key from physical NFC card + password      │
│  • Signs transaction & broadcasts to Sepolia RPC            │
└─────────────────────────────────────────────────────────────┘
```

---

## Developer Experience & Product Feedback

### What Worked Well:
1. **Clear Mental Model:** Gating high-risk financial flows (rather than gating simple read-only logins) makes World ID feel genuinely valuable and protective rather than burdensome.
2. **Sandbox Simulator:** The sandbox credential flow made local simulation and unit testing straightforward during hackathon development.
3. **Synergy with Hardware Custody:** Combining World ID (something you *are*) with MFKDF NFC cards (something you *have*) and passwords (something you *know*) creates a true 3-pillar security posture for self-custody.

### Areas for Improvement:
1. **React Native New Architecture Compatibility:** Native crypto shims (`react-native-quick-crypto`) require specific polyfill configuration when paired with newer Expo SDK 57 runtimes. First-class Hermes-native bindings would streamline setup.
2. **Web3 Wallet Intent Shims:** A standard WalletConnect RPC method or EIP specification for requesting a World ID proof directly from connected dapps would allow dapps to request human verification alongside `eth_sendTransaction`.

---

## Qualification Checklist
- [x] Meaningful use as a risk/abuse-prevention signal (gates policy overrides and emergency vault sweeps).
- [x] Working mobile application flow with user prompts.
- [x] Tested with Sandbox flow.
- [x] Integration feedback documentation completed.
