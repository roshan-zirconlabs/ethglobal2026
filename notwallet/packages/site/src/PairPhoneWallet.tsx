/**
 * Desktop side of pairing: scan the phone's account QR (address + public key)
 * and register it in MetaMask via the snap. The phone sends only public info —
 * never a key.
 */
import type { FunctionComponent } from 'react';
import { useState } from 'react';

import { QrScanner } from './Qr';
import { decodeAccount } from './qr-transport';

export const PairPhoneWallet: FunctionComponent<{
  onAccount: (address: string, publicKey: string, label: string) => Promise<void>;
  disabled?: boolean;
}> = ({ onAccount, disabled }) => {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [added, setAdded] = useState('');

  const handleScan = async (text: string) => {
    try {
      const account = decodeAccount(text);
      setScanning(false);
      setError('');
      await onAccount(account.address, account.publicKey, account.label);
      setAdded(account.address);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section className="col" data-testid="PairPhoneWallet">
      <div className="card">
        <header className="card-header">
          <h2 className="h4 mb-0">🔗 Pair a phone wallet</h2>
        </header>
        <div className="card-body">
          {added ? (
            <p className="text-success mb-2">
              Added <code className="small">{added}</code>. It's now in MetaMask.
            </p>
          ) : scanning ? (
            <QrScanner onScan={handleScan} onError={setError} />
          ) : (
            <p className="text-muted small mb-2">
              Create an account on the NotWallet phone app, then scan its pairing
              QR here to add it to MetaMask.
            </p>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={disabled}
            onClick={() => {
              setAdded('');
              setScanning((value) => !value);
            }}
          >
            {scanning ? 'Cancel' : added ? 'Pair another' : "Scan phone's pairing QR"}
          </button>
          {error && <div className="text-danger small mt-2">{error}</div>}
        </div>
      </div>
    </section>
  );
};
