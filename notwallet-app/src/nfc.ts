/**
 * Read an NFC card's UID via the native NFC stack. Any NFC card/tag works — we
 * only use its stable id as the "something you have" factor. If NFC is
 * unavailable, the UI falls back to typing a card id.
 *
 * Supports NfcA (most tags/cards), IsoDep (credit/debit/transit cards that use
 * ISO 14443-4), and Ndef. Card reading is STRICTLY READ-ONLY — we never write
 * to the card (it could be a user's bank card).
 */
import NfcManager, { NfcTech } from 'react-native-nfc-manager';
import { logger } from './logger';

let started = false;

const NFC_TIMEOUT_MS = 15_000; // 15 seconds max wait for card tap

export async function isNfcSupported(): Promise<boolean> {
  try {
    const supported = await NfcManager.isSupported();
    logger.nfc('NFC_CHECK', `NFC supported status: ${supported}`);
    return supported;
  } catch (err) {
    logger.error('NFC_CHECK', 'Error checking NFC support', err);
    return false;
  }
}

export async function readNfcCardId(): Promise<string> {
  if (!started) {
    await NfcManager.start();
    started = true;
    logger.nfc('NFC_START', 'NfcManager started successfully');
  }

  logger.nfc('NFC_POLL', 'Listening for NFC card tap (IsoDep / NfcA / Ndef)...');

  // Race between NFC read and a timeout
  return Promise.race([
    readCard(),
    timeout(NFC_TIMEOUT_MS),
  ]);
}

async function readCard(): Promise<string> {
  try {
    // Try multiple NFC technologies for broad card compatibility:
    // - NfcA: Most NFC tags and cards (ISO 14443-3A)
    // - IsoDep: Credit/debit/transit cards (ISO 14443-4)
    // - Ndef: NFC Forum Data Exchange Format tags
    await NfcManager.requestTechnology([
      NfcTech.NfcA,
      NfcTech.IsoDep,
      NfcTech.Ndef,
    ]);
    const tag = await NfcManager.getTag();
    const id = (tag?.id ?? '').toString();
    if (!id) {
      throw new Error('Card has no readable id.');
    }
    logger.nfc('NFC_READ', `Card read success (UID length: ${id.length})`);
    return id;
  } catch (err) {
    logger.error('NFC_READ', 'Failed to read card technology', err);
    throw err;
  } finally {
    NfcManager.cancelTechnologyRequest().catch(() => undefined);
  }
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`NFC timeout — no card detected within ${ms / 1000}s.`)), ms),
  );
}

/**
 * Cancel an in-progress NFC read (e.g. when user presses "Cancel").
 */
export async function cancelNfcRead(): Promise<void> {
  try {
    await NfcManager.cancelTechnologyRequest();
  } catch {
    // Already cancelled or not reading — safe to ignore.
  }
}
