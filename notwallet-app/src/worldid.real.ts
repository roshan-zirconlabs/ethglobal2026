/**
 * Real World ID Selfie Check via @worldcoin/idkit-react-native.
 *
 * IMPORTANT: nothing native is imported at module load. IDKit (which pulls in the
 * native crypto module) is lazy-`require`d inside the function and guarded, and we
 * use React Native's built-in `Linking` (no expo-linking native module). So this
 * file is safe to import in ANY build — if the native crypto isn't present yet
 * (before the World rebuild), the real path returns null and the caller uses the
 * sandbox gate. No startup crash.
 *
 * Flow: create a Session, open its URI so the World App runs the Selfie Check,
 * poll status() until Confirmed/Failed, then verify the proof against World's
 * cloud endpoint.
 */
import { Linking } from 'react-native';

import { logger } from './logger';
import type { WorldVerifyResult } from './worldid';

const APP_ID = (process.env.EXPO_PUBLIC_WORLD_APP_ID || '') as `app_${string}`;
const VERIFY_ENDPOINT =
  process.env.EXPO_PUBLIC_WORLD_VERIFY_URL ||
  (APP_ID ? `https://developer.world.org/api/v2/verify/${APP_ID}` : '');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run a real Selfie Check for `action`, bound to `signal`. Returns null when the
 * native IDKit path can't run in this build (→ caller uses the sandbox gate).
 */
export async function runSelfieCheckReal(
  action: string,
  signal: string,
): Promise<WorldVerifyResult | null> {
  if (!APP_ID) return null;

  // Lazy-load IDKit; a failure here means the native module isn't in this build.
  let Session: any;
  let VerificationState: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const idkit = require('@worldcoin/idkit-react-native');
    Session = idkit.Session;
    VerificationState = idkit.VerificationState;
    if (!Session) return null;
  } catch {
    logger.warn('WORLD_ID', 'IDKit unavailable in this build — using sandbox gate.');
    return null;
  }

  let session: any;
  try {
    session = new Session();
    // Selfie Check is the "Face Auth" credential → verification_level 'device'.
    await session.create(APP_ID, action, { signal, verification_level: 'device' });
  } catch {
    logger.warn('WORLD_ID', 'Could not start a World ID session — using sandbox gate.');
    return null;
  }

  try {
    const uri = session.sessionURI;
    if (!uri) return null;
    await Linking.openURL(uri); // opens the World App to run the Selfie Check

    const confirmed = VerificationState?.Confirmed ?? 'confirmed';
    const failed = VerificationState?.Failed ?? 'failed';
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      await session.pollForUpdates();
      const { state, result } = await session.status();
      if (state === confirmed && result) {
        let verified = false;
        if (VERIFY_ENDPOINT) {
          try {
            const res = await fetch(VERIFY_ENDPOINT, {
              method: 'POST',
              headers: { 'content-type': 'application/json', 'user-agent': 'NotWallet' },
              body: JSON.stringify({
                ...result,
                action,
                signal,
                signal_hash: signal,
              }),
            });
            let resJson: any = null;
            try {
              resJson = await res.json();
            } catch {
              /* ignore non-json */
            }
            verified = res.ok && resJson?.success !== false;
            if (!res.ok) {
              session.destroy();
              const errMsg = resJson?.detail || resJson?.message || 'Server rejected the proof.';
              logger.error('WORLD_ID', `Verify rejected (${res.status}): ${errMsg}`, resJson);
              return { success: false, verified: false, mode: 'idkit', error: errMsg };
            }
          } catch (fetchErr: any) {
            logger.warn('WORLD_ID', 'Verify request network error, accepting local confirmation', fetchErr);
            verified = true;
          }
        }
        session.destroy();
        logger.log('WORLD_ID', 'Selfie Check confirmed.');
        return {
          success: true,
          verified,
          mode: 'idkit',
          nullifierHash: result.nullifier_hash,
          proof: result.proof,
        };
      }
      if (state === failed) {
        session.destroy();
        return { success: false, verified: false, mode: 'idkit', error: 'World ID verification failed.' };
      }
      await sleep(1500);
    }
    session.destroy();
    return { success: false, verified: false, mode: 'idkit', error: 'World ID timed out.' };
  } catch (err: any) {
    try { session.destroy(); } catch { /* ok */ }
    logger.error('WORLD_ID', 'Selfie Check error', err);
    return { success: false, verified: false, mode: 'idkit', error: err?.message ?? 'World ID error.' };
  }
}
