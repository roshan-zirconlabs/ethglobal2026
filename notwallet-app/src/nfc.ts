/**
 * Read an NFC card's UID via the native NFC stack. Any NFC card/tag works — we
 * only use its stable id as the "something you have" factor. If NFC is
 * unavailable, the UI falls back to typing a card id.
 */
import NfcManager, { NfcTech } from 'react-native-nfc-manager';

let started = false;

export async function isNfcSupported(): Promise<boolean> {
  try {
    return await NfcManager.isSupported();
  } catch {
    return false;
  }
}

export async function readNfcCardId(): Promise<string> {
  if (!started) {
    await NfcManager.start();
    started = true;
  }
  try {
    await NfcManager.requestTechnology([NfcTech.NfcA, NfcTech.Ndef]);
    const tag = await NfcManager.getTag();
    const id = (tag?.id ?? '').toString();
    if (!id) {
      throw new Error('Card has no readable id.');
    }
    return id;
  } finally {
    NfcManager.cancelTechnologyRequest().catch(() => undefined);
  }
}
