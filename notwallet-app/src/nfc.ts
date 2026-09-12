/**
 * Read an NFC card's UID via the native NFC stack. Any NFC card/tag works — we
 * only use its stable id as the "something you have" factor.
 *
 * Card reading is STRICTLY READ-ONLY — we never write to the card (it could be
 * a user's bank card, transit pass, student ID, or personal keycard).
 *
 * On Android, we enable Reader Mode (NfcAdapter.enableReaderMode) with exclusive
 * hardware access for NFC-A, NFC-B, NFC-F, NFC-V, and IsoDep. This bypasses OS
 * payment interception (Google Wallet) and reads raw card UIDs in milliseconds.
 */
import { Platform } from 'react-native';
import NfcManager, { NfcEvents, NfcTech, TagEvent } from 'react-native-nfc-manager';
import { logger } from './logger';

let started = false;

const NFC_TIMEOUT_MS = 30_000; // 30 seconds wait for card tap

/**
 * Android Reader Mode flags:
 *   FLAG_READER_NFC_A (0x1): ISO 14443-3A (Mifare, NTAG, bank cards)
 *   FLAG_READER_NFC_B (0x2): ISO 14443-3B (transit cards, Calypso)
 *   FLAG_READER_NFC_F (0x4): JIS 6319-4 (Sony FeliCa, Suica, Pasmo)
 *   FLAG_READER_NFC_V (0x8): ISO 15693 (vicinity RFID tags)
 *   FLAG_READER_SKIP_NDEF_CHECK (0x80): fast raw UID read without NDEF delays
 *   Sum = 0x1 | 0x2 | 0x4 | 0x8 | 0x80 = 0x8F (143)
 */
const ANDROID_READER_FLAGS = 0x1 | 0x2 | 0x4 | 0x8 | 0x80;

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

export async function openNfcSettings(): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      await (NfcManager as any).goToNfcSetting?.();
    }
  } catch (err) {
    logger.error('NFC_SETTINGS', 'Could not open NFC settings', err);
  }
}

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

export async function readNfcCardId(): Promise<string> {
  // Always ensure clean previous state
  await cancelNfcRead().catch(() => {});

  if (!started) {
    try {
      await NfcManager.start();
      started = true;
      logger.nfc('NFC_START', 'NfcManager started successfully');
    } catch (err) {
      logger.error('NFC_START', 'Failed to start NfcManager', err);
    }
  }

  logger.nfc('NFC_POLL', 'Listening for NFC card tap with Reader Mode enabled...');

  return new Promise<string>((resolve, reject) => {
    let resolved = false;

    const timer = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      cancelNfcRead().catch(() => {});
      reject(new Error('NFC timeout — hold card firmly to the back of the phone.'));
    }, NFC_TIMEOUT_MS);

    const onCardDetected = (cardId: string) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      cancelNfcRead().catch(() => {});
      logger.nfc('NFC_READ', `Card read success (UID: ${cardId.slice(0, 4)}***)`);
      resolve(cardId);
    };

    // Primary Reader Mode event listener
    NfcManager.setEventListener(NfcEvents.DiscoverTag, (tag: TagEvent) => {
      const id = normalizeCardId(tag?.id);
      if (id) {
        onCardDetected(id);
      }
    });

    // Start registration
    if (Platform.OS === 'android') {
      NfcManager.registerTagEvent({
        isReaderModeEnabled: true,
        readerModeFlags: ANDROID_READER_FLAGS,
        readerModeDelay: 20,
      })
        .then(() => {
          logger.nfc('NFC_READER', 'Android Reader Mode active');
        })
        .catch((err) => {
          logger.warn('NFC_READER', 'registerTagEvent failed, falling back to tech request', err);
          // Fallback to requestTechnology if registerTagEvent fails
          fallbackTechRequest().then((id) => {
            if (id) onCardDetected(id);
          }).catch(() => {});
        });
    } else {
      // iOS CoreNFC path
      fallbackTechRequest().then((id) => {
        if (id) onCardDetected(id);
      }).catch((err) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          reject(err);
        }
      });
    }
  });
}

async function fallbackTechRequest(): Promise<string> {
  try {
    await NfcManager.requestTechnology([
      NfcTech.IsoDep,
      NfcTech.NfcA,
      NfcTech.Ndef,
    ]);
    const tag = await NfcManager.getTag();
    const id = normalizeCardId(tag?.id);
    if (!id) throw new Error('Card has no readable id.');
    return id;
  } finally {
    NfcManager.cancelTechnologyRequest().catch(() => {});
  }
}

/**
 * Cancel an in-progress NFC read and release hardware resources.
 */
export async function cancelNfcRead(): Promise<void> {
  try {
    NfcManager.setEventListener(NfcEvents.DiscoverTag, null);
    await NfcManager.unregisterTagEvent().catch(() => {});
    await NfcManager.cancelTechnologyRequest().catch(() => {});
  } catch {
    // Safe to ignore on cleanup
  }
}
