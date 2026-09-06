/**
 * QR UI: a display (render text → QR image) and a scanner (camera → text).
 * Used by both roles — desktop shows the request / scans the signature; phone
 * scans the request / shows the signature.
 */
import { BrowserQRCodeReader } from '@zxing/browser';
import type { IScannerControls } from '@zxing/browser';
import type { FunctionComponent } from 'react';
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

/** Render `text` as a QR code image. */
export const QrDisplay: FunctionComponent<{ text: string; size?: number }> = ({
  text,
  size = 320,
}) => {
  const [dataUrl, setDataUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(text, { errorCorrectionLevel: 'M', width: size, margin: 2 })
      .then((url) => {
        if (!cancelled) {
          setDataUrl(url);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [text, size]);

  if (error) {
    return <div className="text-danger small">QR error: {error}</div>;
  }
  if (!dataUrl) {
    return <div className="text-muted small">Generating QR…</div>;
  }
  return (
    <img
      src={dataUrl}
      alt="QR code"
      width={size}
      height={size}
      style={{ imageRendering: 'pixelated', borderRadius: 8 }}
    />
  );
};

/**
 * Scan a QR from the camera. Calls `onScan` once with the decoded text, then
 * stops. Requires a secure context (HTTPS or localhost) for camera access.
 */
export const QrScanner: FunctionComponent<{
  onScan: (text: string) => void;
  onError?: (message: string) => void;
}> = ({ onScan, onError }) => {
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
        setStatus('Point the camera at the QR code.');
      })
      .catch((err) => {
        const message =
          err instanceof Error ? err.message : 'Camera unavailable.';
        setStatus(message);
        onError?.(message);
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
        style={{ width: '100%', maxWidth: 360, borderRadius: 8, background: '#000' }}
        muted
        playsInline
      />
      <p className="text-muted small mb-0 mt-1">{status}</p>
    </div>
  );
};
