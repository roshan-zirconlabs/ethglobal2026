/**
 * World ID / Selfie Check — human-presence gate for high-risk irreversible actions:
 *   1. Overriding a blocked spending policy
 *   2. Emergency recovery sweep
 *   3. (future) first-time large transfers
 *
 * ── Integration status ────────────────────────────────────────────────────────
 * The REAL Selfie Check runs through `@worldcoin/idkit-react-native`, which needs
 * the native `react-native-quick-crypto` module — i.e. a fresh dev/native build.
 * Until that build ships, this module runs a clearly-labelled SANDBOX gate: it
 * still forces an explicit, deliberate human confirmation before the action, but
 * it does NOT mint a real World ID proof. We never pretend a sandbox pass is a
 * verified proof — `verified` is false and `mode` says 'sandbox'.
 *
 * When the native build lands, `runSelfieCheck()` is the single function to swap
 * for the IDKit session; everything else (call sites, gating, settings) stays.
 */
import { Alert } from 'react-native';
import { sha256, toUtf8Bytes } from 'ethers';
import { logger } from './logger';
import { runSelfieCheckReal } from './worldid.real';

export const WORLD_APP_ID = process.env.EXPO_PUBLIC_WORLD_APP_ID || 'app_staging_notwallet_guard';
export const WORLD_ACTION_ID = process.env.EXPO_PUBLIC_WORLD_ACTION || 'policy-override-guard';

export type WorldVerifyMode = 'idkit' | 'sandbox';

export type WorldVerifyResult = {
  /** Did the human complete the gate? */
  success: boolean;
  /** True only for a real, cryptographically-verified World ID proof. */
  verified: boolean;
  /** Which path produced this result. */
  mode: WorldVerifyMode;
  nullifierHash?: string;
  proof?: string;
  error?: string;
};

/**
 * The sandbox gate: a deliberate on-device human confirmation. Returns a
 * deterministic, clearly-non-proof session hash so downstream code has a stable
 * id to log, but `verified` is false.
 */
function runSandboxGate(
  action: string,
  promptTitle: string,
  promptMessage: string,
): Promise<WorldVerifyResult> {
  return new Promise((resolve) => {
    Alert.alert(
      `🌐 ${promptTitle}`,
      `${promptMessage}\n\n(World ID Selfie Check runs here after the next native build. This is a sandbox human-presence gate.)`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => {
            logger.warn('WORLD_ID', 'Human-presence gate cancelled');
            resolve({ success: false, verified: false, mode: 'sandbox', error: 'Cancelled.' });
          },
        },
        {
          text: 'Confirm I am present',
          onPress: () => {
            const session = sha256(toUtf8Bytes(`${action}|${Date.now()}`));
            logger.log('WORLD_ID', `Sandbox gate passed (session ${session.slice(0, 12)}…)`);
            resolve({ success: true, verified: false, mode: 'sandbox', nullifierHash: session });
          },
        },
      ],
    );
  });
}

/**
 * Gate a high-risk action behind human verification. Callers only care about
 * `success`; `verified`/`mode` let the UI and logs distinguish a real World ID
 * proof from the interim sandbox gate.
 */
export async function verifyHuman(
  action: string = WORLD_ACTION_ID,
  promptTitle: string = 'Human Verification Required',
  promptMessage: string = 'Prove a live person is present before this high-risk irreversible action.',
): Promise<WorldVerifyResult> {
  logger.log('WORLD_ID', `Human verification requested for action: ${action}`);
  // Try the real Selfie Check; if the native crypto module isn't in this build
  // yet (i.e. before the World rebuild), it returns null and we use the sandbox
  // gate so the app keeps working either way.
  try {
    const real = await runSelfieCheckReal(action, promptMessage);
    if (real) return real;
  } catch {
    /* fall through to sandbox */
  }
  return runSandboxGate(action, promptTitle, promptMessage);
}
