/**
 * DesktopPhoneBridge — the desktop half of the air-gapped QR flow.
 *
 * Shows the pending request as a QR for the phone to scan, then scans the
 * phone's signature QR back and hands it to `onSignature` (which relays it to
 * the snap). The signing key is never on this machine.
 */
import type { KeyringRequest } from '@metamask/keyring-api';
import type { Json } from '@metamask/utils';
import type { FunctionComponent } from 'react';
import { useMemo, useState } from 'react';

import { QrDisplay, QrScanner } from './Qr';
import { decodeSignature, encodeRequest } from './qr-transport';

export const DesktopPhoneBridge: FunctionComponent<{
  request: KeyringRequest;
  onSignature: (id: string, signature: Json) => void;
  onCancel: () => void;
}> = ({ request, onSignature, onCancel }) => {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');

  const requestQr = useMemo(() => {
    try {
      return encodeRequest(request);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return '';
    }
  }, [request]);

  const handleScan = (text: string) => {
    try {
      const { id, signature } = decodeSignature(text);
      onSignature(id, signature);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const phoneUrl = `${window.location.origin}${window.location.pathname}?role=phone`;

  return (
    <div className="card mb-3" data-testid="DesktopPhoneBridge">
      <div className="card-header d-flex justify-content-between align-items-center">
        <strong>📱 Sign on your phone (air-gapped)</strong>
        <button type="button" className="btn-close" aria-label="Cancel" onClick={onCancel} />
      </div>
      <div className="card-body">
        <div className="row g-3">
          <div className="col-12 col-md-6">
            <p className="mb-1">
              <strong>1.</strong> On your phone open{' '}
              <code className="small">{phoneUrl}</code> and scan this:
            </p>
            {requestQr && <QrDisplay text={requestQr} size={240} />}
          </div>
          <div className="col-12 col-md-6">
            <p className="mb-1">
              <strong>2.</strong> After you approve on the phone, scan the phone's
              signature code:
            </p>
            {scanning ? (
              <QrScanner onScan={handleScan} onError={setError} />
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setScanning(true)}
              >
                Scan signature from phone
              </button>
            )}
          </div>
        </div>
        {error && <div className="text-danger small mt-2">{error}</div>}
      </div>
    </div>
  );
};
