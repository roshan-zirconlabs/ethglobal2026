/**
 * Read an NFC card's id via WebNFC (Android Chrome, secure context). Any NFC
 * card/tag works — we only use its serial number as the "have" factor. Where
 * WebNFC is unavailable (desktop, iOS), the UI lets you type a card id instead.
 */
export function nfcAvailable(): boolean {
  return typeof (globalThis as unknown as { NDEFReader?: unknown }).NDEFReader !==
    'undefined';
}

export async function readNfcCardId(): Promise<string> {
  const Ndef = (globalThis as unknown as { NDEFReader?: new () => any })
    .NDEFReader;
  if (!Ndef) {
    throw new Error(
      'NFC not available here — use Android Chrome, or type a card id.',
    );
  }
  const reader = new Ndef();
  await reader.scan();
  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('No card detected — tap again.')),
      20000,
    );
    reader.onreadingerror = () => {
      clearTimeout(timeout);
      reject(new Error('Could not read the card. Try again.'));
    };
    reader.onreading = (event: { serialNumber?: string }) => {
      clearTimeout(timeout);
      const serial = String(event?.serialNumber ?? '').trim();
      if (serial) {
        resolve(serial);
      } else {
        reject(new Error('Card has no readable id.'));
      }
    };
  });
}
