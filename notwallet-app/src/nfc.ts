/**
 * NFC card reader
 *
 * Reads the NFC tag/card UID using Android Reader Mode.
 *
 * READ-ONLY:
 * We never write to NFC cards/tags (they can be debit/credit/transit cards).
 *
 * Android:
 * - Uses react-native-nfc-manager Reader Mode (NfcAdapter.enableReaderMode)
 * - Exclusive hardware access for NFC-A, NFC-B, NFC-F and NFC-V
 * - Skips NDEF inspection (FLAG_READER_SKIP_NDEF_CHECK) so detection is instant
 * - Bypasses Google Wallet / Samsung Pay preemption
 *
 * iOS:
 * - Uses CoreNFC requestTechnology()
 */

import { Platform } from 'react-native';
import NfcManager, {
  NfcEvents,
  NfcTech,
  TagEvent,
} from 'react-native-nfc-manager';

import { logger } from './logger';

let started = false;

const NFC_TIMEOUT_MS = 30_000;

/**
 * Android Reader Mode flags:
 *   FLAG_READER_NFC_A = 0x01
 *   FLAG_READER_NFC_B = 0x02
 *   FLAG_READER_NFC_F = 0x04
 *   FLAG_READER_NFC_V = 0x08
 *   FLAG_READER_SKIP_NDEF_CHECK = 0x80
 *
 * Total = 0x01 | 0x02 | 0x04 | 0x08 | 0x80 = 0x8F (143)
 */
const ANDROID_READER_FLAGS = 0x01 | 0x02 | 0x04 | 0x08 | 0x80;

/**
 * Check whether the device has NFC hardware.
 */
export async function isNfcSupported(): Promise<boolean> {
  try {
    const supported = await NfcManager.isSupported();
    logger.nfc('NFC_CHECK', `NFC supported: ${supported}`);
    return !!supported;
  } catch (err) {
    logger.error('NFC_CHECK', 'Error checking NFC support', err);
    return false;
  }
}

/**
 * Check whether NFC is currently enabled in settings.
 */
export async function isNfcEnabled(): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      const enabled = await (NfcManager as any).isEnabled?.();
      logger.nfc('NFC_CHECK', `Android NFC enabled: ${enabled}`);
      return enabled !== false;
    }
    return await isNfcSupported();
  } catch (err) {
    logger.error('NFC_CHECK', 'Error checking if NFC is enabled', err);
    return true;
  }
}

/**
 * Open the Android NFC settings page.
 */
export async function openNfcSettings(): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      await (NfcManager as any).goToNfcSetting?.();
    }
  } catch (err) {
    logger.error('NFC_SETTINGS', 'Could not open NFC settings', err);
  }
}

/**
 * Convert an NFC ID into a consistent lowercase hex string.
 */
function normalizeCardId(rawId: unknown): string {
  if (!rawId) return '';
  if (typeof rawId === 'string') {
    return rawId.trim().toLowerCase();
  }
  if (Array.isArray(rawId)) {
    return rawId
      .map((byte: number) => byte.toString(16).padStart(2, '0'))
      .join('')
      .toLowerCase();
  }
  return String(rawId).trim().toLowerCase();
}

/**
 * Start the NFC manager if it isn't already started.
 */
async function ensureNfcStarted(): Promise<void> {
  if (started) return;

  try {
    await NfcManager.start();
    started = true;
    logger.nfc('NFC_START', 'NfcManager started successfully');
  } catch (err) {
    logger.error('NFC_START', 'Failed to start NfcManager', err);
    throw err;
  }
}

/**
 * Read an NFC card/tag UID.
 *
 * Android: Uses Reader Mode with all protocol flags.
 * iOS: Uses requestTechnology().
 */
export async function readNfcCardId(): Promise<string> {
  // Clear any existing active session first
  await cancelNfcRead().catch(() => {});

  await ensureNfcStarted();

  logger.nfc('NFC_POLL', 'Waiting for NFC card/tag...');

  if (Platform.OS === 'android') {
    return readNfcCardAndroid();
  }

  return readNfcCardIOS();
}

/**
 * Android Reader Mode implementation.
 */
async function readNfcCardAndroid(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let finished = false;

    const finish = (cleanup: () => void) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeoutId);
      cleanup();
    };

    const timeoutId = setTimeout(() => {
      finish(() => {
        logger.warn('NFC_TIMEOUT', 'No NFC card detected within timeout');
        cancelNfcRead().catch(() => {});
        reject(
          new Error(
            'NFC timeout — hold the card firmly against the upper-back of the phone.',
          ),
        );
      });
    }, NFC_TIMEOUT_MS);

    const handleTag = (tag: TagEvent) => {
      logger.nfc('NFC_TAG_DETECTED', `NFC tag detected: ${JSON.stringify(tag)}`);

      const id = normalizeCardId(tag?.id);
      if (!id) {
        logger.warn('NFC_READ', 'NFC tag detected but it has no readable ID');
        return;
      }

      finish(() => {
        logger.nfc('NFC_READ', `Card read success (UID: ${id.slice(0, 4)}***)`);
        cancelNfcRead().catch(() => {});
        resolve(id);
      });
    };

    // 1. Attach the DiscoverTag event listener
    NfcManager.setEventListener(NfcEvents.DiscoverTag, handleTag);

    // 2. Register Android Reader Mode with all protocol flags
    NfcManager.registerTagEvent({
      isReaderModeEnabled: true,
      readerModeFlags: ANDROID_READER_FLAGS,
      readerModeDelay: 10,
    })
      .then(() => {
        logger.nfc(
          'NFC_READER',
          `Android Reader Mode active (flags: 0x${ANDROID_READER_FLAGS.toString(16)})`,
        );
      })
      .catch((err) => {
        finish(() => {
          logger.error('NFC_READER', 'Failed to enable Android Reader Mode', err);
          cancelNfcRead().catch(() => {});
          reject(err);
        });
      });
  });
}

/**
 * iOS implementation via CoreNFC.
 */
async function readNfcCardIOS(): Promise<string> {
  try {
    await NfcManager.requestTechnology([
      NfcTech.IsoDep,
      NfcTech.NfcA,
      NfcTech.Ndef,
    ]);

    const tag = await NfcManager.getTag();
    logger.nfc('NFC_TAG_DETECTED', `iOS NFC tag detected: ${JSON.stringify(tag)}`);

    const id = normalizeCardId(tag?.id);
    if (!id) {
      throw new Error('Card was detected but has no readable ID.');
    }

    logger.nfc('NFC_READ', `Card read success (UID: ${id.slice(0, 4)}***)`);
    return id;
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

/**
 * Cancel an active NFC operation.
 */
export async function cancelNfcRead(): Promise<void> {
  try {
    NfcManager.setEventListener(NfcEvents.DiscoverTag, null);
    if (Platform.OS === 'android') {
      await NfcManager.unregisterTagEvent().catch(() => {});
    }
    await NfcManager.cancelTechnologyRequest().catch(() => {});
  } catch {
    // Cleanup should never throw
  }
}
