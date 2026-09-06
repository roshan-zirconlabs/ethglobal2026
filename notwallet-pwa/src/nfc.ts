/**
 * Read an NFC card's id via WebNFC (Android Chrome, secure context).
 *
 * HONEST LIMIT: WebNFC only reads NDEF tags (blank NFC stickers/tags, some
 * transit cards). Bank/credit and most access cards are EMV/MIFARE and do NOT
 * respond to a browser NDEF scan — the browser simply cannot read them. When
 * that happens we surface a clear message and the user types a card id instead
 * (any secret string works as the "have" factor). Native NFC (the RN app) can
 * read more card types; the browser cannot.
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
      'This browser has no WebNFC (need Android Chrome). Type a card id below instead.',
    );
  }

  const reader = new Ndef();
  const controller = new AbortController();

  try {
    await reader.scan({ signal: controller.signal });
  } catch {
    throw new Error(
      'Could not start NFC — turn NFC on and allow the permission, or type a card id.',
    );
  }

  return new Promise<string>((resolve, reject) => {
    const finish = (fn: () => void) => {
      clearTimeout(timeout);
      controller.abort();
      fn();
    };
    const timeout = setTimeout(
      () =>
        finish(() =>
          reject(
            new Error(
              "No card read. Bank/access cards can't be read in a browser — " +
                'use a blank NFC tag, or just type a card id below.',
            ),
          ),
        ),
      15000,
    );

    reader.addEventListener(
      'reading',
      (event: { serialNumber?: string }) => {
        const serial = String(event?.serialNumber ?? '').trim();
        finish(() =>
          serial
            ? resolve(serial)
            : reject(
                new Error(
                  'That card has no readable id in the browser — type a card id instead.',
                ),
              ),
        );
      },
      { once: true },
    );

    reader.addEventListener(
      'readingerror',
      () =>
        finish(() =>
          reject(
            new Error(
              "Couldn't read that card in the browser — type a card id instead.",
            ),
          ),
        ),
      { once: true },
    );
  });
}
