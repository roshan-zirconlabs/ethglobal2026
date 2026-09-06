import { BrowserQRCodeReader } from '@zxing/browser';
import type { IScannerControls } from '@zxing/browser';
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

/** Render text as a QR image. */
export function QrDisplay({ text, size = 280 }: { text: string; size?: number }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(text, { errorCorrectionLevel: 'M', width: size, margin: 1 })
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setUrl(''));
    return () => {
      alive = false;
    };
  }, [text, size]);
  if (!url) {
    return <div className="muted">Generating QR…</div>;
  }
  return (
    <img
      src={url}
      alt="QR"
      width={size}
      height={size}
      style={{ borderRadius: 8, background: '#fff', padding: 10 }}
    />
  );
}

/** Scan a QR from the camera; calls onScan once with the decoded text. */
export function QrScanner({
  onScan,
  onError,
}: {
  onScan: (text: string) => void;
  onError?: (message: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState('Starting camera…');

  useEffect(() => {
    let controls: IScannerControls | undefined;
    let done = false;
    const reader = new BrowserQRCodeReader();
    reader
      .decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (result) => {
        if (result && !done) {
          done = true;
          controls?.stop();
          onScan(result.getText());
        }
      })
      .then((ctrl) => {
        controls = ctrl;
        setStatus('Point at the QR code.');
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Camera unavailable.';
        setStatus(msg);
        onError?.(msg);
      });
    return () => {
      done = true;
      controls?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <video
        ref={videoRef}
        style={{ width: '100%', borderRadius: 12, background: '#000', aspectRatio: '1 / 1', objectFit: 'cover' }}
        muted
        playsInline
      />
      <p className="muted" style={{ marginTop: 6 }}>{status}</p>
    </div>
  );
}
