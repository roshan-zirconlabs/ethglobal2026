# 🎤 NotWallet — 4-Minute Official Pitch & Video Script (ETHOnline 2026)

> **Target Video Length:** 4:00 Minutes (240 Seconds)  
> **Speaker:** Roshan Singh  
> **Project:** NotWallet — The $0 Hardware Wallet Using Any Everyday Card  
> **Live Web Presentation:** `notwallet-pwa` (Run `npm run dev`)  
> **Bounties:** World ID (Selfie Check Beta), ENS (ENSv2 Subname Architecture), Reown / WalletConnect  

---

## ⏱️ Pitch Timeline Overview

| Section | Timestamp | Focus & Visual Cues |
| :--- | :--- | :--- |
| **Act I: The Hook & Hack Story** | `0:00 – 0:45` | Founder personal loss, $2.14B crisis, private key vulnerabilities |
| **Act II: The Adoption Barrier** | `0:45 – 1:20` | Why 92% refuse Ledgers ($150 price, cables, 24 seed words on paper) |
| **Act III: The NotWallet Breakthrough** | `1:20 – 2:05` | Everyday cards + MFKDF = instant air-gapped 2FA key derivation |
| **Act IV: Live App Demo & Sponsors** | `2:05 – 3:00` | NFC tap, World ID Selfie Check, ENSv2 subnames, spending limits |
| **Act V: Panic Kill Switch & Vision** | `3:00 – 3:45` | Real-time policy blocker + One-Tap Emergency Rescue Sweep |
| **Finale: Call to Action** | `3:45 – 4:00` | Open source, tested, QR code download, wrap-up |

---

## 📜 Full Word-for-Word Script with Stage Directions

### Act I: The $2.14B Nightmare (`0:00 – 0:45`)
**[Screen: Slide 1 — The $2.14B Metric, Founder Story, Red Warning Badges]**

> *"Hi judges, I’m Roshan. A few months ago, I woke up, sat down at my desk, opened my laptop, and watched my entire crypto savings disappear in less than three seconds.*  
>  
> *A silent infostealer malware had compromised my browser, grabbed my session keys, and swept every single token out of my hot wallet.*  
>  
> *That loss was devastating, but it forced me to face an uncomfortable reality that affects everyone in this room: **as long as your private keys exist on an internet-connected disk or memory, you are one malicious download away from losing everything.**  
>  
> *Even today in 2026, over **$2.14 Billion** has been drained in Web3 exploits—and **over 68%** of that loss comes directly from stolen private keys and compromised seed phrases."*

---

### Act II: Why 92% of Users Refuse Hardware Wallets (`0:45 – 1:20`)
**[Screen: Slide 2 — Hardware Wallet Friction Cards: $150 Price, Battery Icon, Paper Trap]**

> *"The crypto security industry always gives users the exact same advice: 'Just buy a $150 Ledger or Trezor, or coordinate a 3-of-5 Safe multi-sig.'*  
>  
> *Yet, **less than 8% of active crypto participants actually own a hardware wallet.** Why?*  
>  
> *Because it’s completely impractical for ordinary people. Nobody wants to pay a $150 tax before they even buy their first $10 of Ethereum. Hardware wallets need charging, specialized USB cables, and you’re still forced to safeguard 24 seed words written on a flimsy piece of paper in your drawer.*  
>  
> *The barrier to entry is absurdly high—and that’s why 92% of users remain exposed on hot wallets."*

---

### Act III: The NotWallet Breakthrough (`1:20 – 2:05`)
**[Screen: Slide 3 — Physical Card Diagram: Card NFC UID + Passphrase = Deterministic Key]**

> *"I realized the solution wasn't building another $150 proprietary gadget. The solution was sitting in my pocket right now.*  
>  
> *Meet **NotWallet**. NotWallet turns ANY contactless card you already own—your daily metro pass, your Visa debit card, your gym card, or an arcade token—into a bank-grade, air-gapped hardware wallet with **$0 extra hardware cost**.*  
>  
> *Here is how the cryptography works: We utilize **MFKDF**—Multi-Factor Key Derivation Function. When you tap your card against the phone, NotWallet reads the physical ISO 14443 NFC UID as an uncloneable hardware salt. It blends that salt with your secret memory passphrase, and deterministically computes your Ethereum private key in **38 milliseconds**!*  
>  
> *The private key exists ONLY in volatile memory during the signature, and is instantly wiped. If a hacker compromises your phone? There are zero keys stored on disk. If an attacker steals your physical card? It’s completely useless plastic without your secret passphrase."*

---

### Act IV: Live App Demo & Sponsor Superpowers (`2:05 – 3:00`)
**[Screen: Transition to Phone Screen Recording or Live Interactive Test Bench]**

> *"Let’s see it in action.*  
>  
> *Watch as I tap my everyday metro card to the back of the phone. In 40 milliseconds, my key is derived and my wallet opens!*  
>  
> *We supercharged NotWallet with this hackathon’s premier technologies:*  
>  
> 1. **World ID Selfie Check (Beta):** *When someone attempts a high-risk action—like raising spending limits or triggering an emergency sweep—NotWallet calls the World ID bridge. The camera opens with an oval face guide for a live biometric selfie check. It guarantees human presence without requiring an Orb!*  
> 2. **ENSv2 Subname Layer:** *Every NotWallet account is human-readable on Sepolia, like `roshan.notwallet.eth`. Even better, our smart contracts let you spawn bounded sub-accounts—like `agent-1.roshan.notwallet.eth`—giving autonomous AI agents strictly capped daily budgets.*  
> 3. **Reown / WalletConnect:** *Built-in AppKit allows one-tap QR pairing with any decentralized app on web or mobile."*

---

### Act V: Real-Time Policy Blocker & The Emergency Kill Switch (`3:00 – 3:45`)
**[Screen: Slide 4 & 5 — Spending Limit Trigger & Emergency Sweep Animation]**

> *"Now, what happens if an attacker physically steals your unlocked phone while you sleep?*  
>  
> *With standard wallets, your balance is wiped. With NotWallet, our **Dual-Layer Policy Engine** stops them in their tracks!*  
>  
> *We enforce a strict per-transaction ceiling (0.05 ETH) and a rolling 24-hour daily cap. If an attacker attempts to drain $5,000, the transaction is rejected instantly by the clear-signing policy, and a push notification immediately alerts you!*  
>  
> *And if you suspect compromise? Tap the **Emergency Rescue Kill Switch**. In one tap, NotWallet automatically bundles all remaining tokens, computes gas, and sweeps 100% of your portfolio directly to your pre-configured cold storage address on-chain before the attacker can react."*

---

### Finale: Ready Today & Call to Action (`3:45 – 4:00`)
**[Screen: Slide 6 — Download APK QR Code, GitHub Repository, Confetti]**

> *"NotWallet is not a mock concept. It is a production-ready Android application built with React Native, QuickCrypto, and native NFC reader mode, validated with 25 passing automated test suites.*  
>  
> *We turned everyday plastic waste into military-grade self-custody that anyone can use for zero dollars.*  
>  
> *Scan the QR code on screen to install the APK, check our code on GitHub, and protect your crypto forever. Thank you!"*

---

## 🎬 Recording & Presentation Tips

1. **Audio Tone:** Confident, energetic, and empathetic during Act I (the personal hack story). Shift to upbeat and authoritative during Act III (the breakthrough) and Act IV (the demo).
2. **Visual Framing:** Keep the web presentation open on one side and your physical phone (or Android emulator screen recording) on the other.
3. **Teleprompter Feature:** Click the **"4-Min Teleprompter"** button on the top right of the presentation page to display the live countdown timer and stage cues while recording.
