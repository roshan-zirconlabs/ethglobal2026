import { JsonRpcProvider, formatEther } from 'ethers';
import { useCallback, useState } from 'react';

import {
  clearSign,
  clearSignTypedData,
  type ClearSignResult,
  type RiskLevel,
} from './clearsign';
import { MfkdfSigner } from './mfkdf';
import { nfcAvailable, readNfcCardId } from './nfc';
import { QrDisplay, QrScanner } from './QrUi';
import { decodeRequest, encodeAccount, encodeSignature } from './qr';
import { previewRequest, signRequestWithCard } from './signing';
import type { KeyringRequest } from './types';

const SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const RISK_COLOR: Record<RiskLevel, string> = {
  info: '#8aa0b8',
  warn: '#e0a800',
  danger: '#ff5c5c',
};

type Screen = 'setup' | 'home' | 'scan' | 'review' | 'signed' | 'pair';
type Account = { address: string; publicKey: string };

const short = (a: string) => (a.length > 14 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a);

function summarize(request: KeyringRequest): {
  result: ClearSignResult | null;
  fallback: string;
  from: string;
} {
  const preview = previewRequest(request);
  switch (preview.kind) {
    case 'tx':
      return { result: clearSign(preview.tx, new Set()), fallback: '', from: preview.from };
    case 'typedData':
      return {
        result: clearSignTypedData(preview.domain, preview.primaryType, preview.message, new Set()),
        fallback: '',
        from: preview.from,
      };
    case 'message':
      return { result: null, fallback: `Sign message: "${preview.text}"`, from: preview.from };
    default:
      return { result: null, fallback: `Approve: ${preview.method}`, from: '' };
  }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('setup');
  const [password, setPassword] = useState('');
  const [cardId, setCardId] = useState('');
  const [account, setAccount] = useState<Account | null>(null);
  const [balance, setBalance] = useState('—');
  const [request, setRequest] = useState<KeyringRequest | null>(null);
  const [signatureQr, setSignatureQr] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const fail = (err: unknown) => setError(err instanceof Error ? err.message : String(err));

  const fetchBalance = useCallback(async (address: string) => {
    try {
      const provider = new JsonRpcProvider(SEPOLIA_RPC);
      setBalance(`${Number(formatEther(await provider.getBalance(address))).toFixed(4)} ETH`);
    } catch {
      setBalance('unavailable');
    }
  }, []);

  const onTapCard = useCallback(async () => {
    setError('');
    try {
      if (!nfcAvailable()) {
        throw new Error('NFC not here — type a card id instead (any text works as your card).');
      }
      setCardId(await readNfcCardId());
    } catch (err) {
      fail(err);
    }
  }, []);

  const onUnlock = useCallback(async () => {
    setError('');
    setBusy(true);
    try {
      const identity = await new MfkdfSigner(cardId, password).getIdentity();
      const acct = { address: identity.address, publicKey: identity.publicKey };
      setAccount(acct);
      setScreen('home');
      void fetchBalance(acct.address);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }, [cardId, password, fetchBalance]);

  const onScanned = useCallback((data: string) => {
    try {
      setRequest(decodeRequest(data));
      setError('');
      setScreen('review');
    } catch (err) {
      fail(err);
    }
  }, []);

  const onSign = useCallback(async () => {
    if (!request) return;
    setBusy(true);
    setError('');
    try {
      const signer = new MfkdfSigner(cardId, password);
      const identity = await signer.getIdentity();
      const expected = summarize(request).from;
      if (expected && identity.address.toLowerCase() !== expected.toLowerCase()) {
        throw new Error('This request is for a different account (wrong password or card).');
      }
      const signature = await signRequestWithCard(request, signer);
      setSignatureQr(encodeSignature(request.id, signature));
      setScreen('signed');
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }, [request, cardId, password]);

  const summary = request ? summarize(request) : null;

  return (
    <div className="wrap">
      <h1 className="brand">NotWallet</h1>
      <p className="sub">Offline signer — your key never leaves this phone.</p>
      {error && <div className="error">{error}</div>}

      {screen === 'setup' && (
        <>
          <p className="label">Unlock your wallet</p>
          <input
            type="password"
            placeholder="Password (never stored)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="row">
            <input
              type="text"
              placeholder="Card id (tap to fill)"
              value={cardId}
              onChange={(e) => setCardId(e.target.value)}
            />
            <button className="ghost" onClick={onTapCard}>📇 Tap</button>
          </div>
          <button className="primary" onClick={onUnlock} disabled={busy}>
            {busy ? 'Deriving…' : 'Unlock wallet'}
          </button>
          <p className="hint">
            Your key is derived from these two, used to sign, then wiped. Same
            password + card always gives the same account.
          </p>
        </>
      )}

      {screen === 'home' && account && (
        <>
          <div className="card">
            <div className="card-label">ACCOUNT</div>
            <div className="address">{short(account.address)}</div>
            <div className="balance">{balance}</div>
            <div className="network">Sepolia</div>
          </div>
          <button className="primary" onClick={() => setScreen('scan')}>📷 Scan request to sign</button>
          <button className="secondary" onClick={() => setScreen('pair')}>🔗 Pair with MetaMask</button>
          <button className="link" onClick={() => account && fetchBalance(account.address)}>Refresh balance</button>
        </>
      )}

      {screen === 'scan' && (
        <>
          <p className="label">Scan the request from your computer</p>
          <QrScanner onScan={onScanned} onError={setError} />
          <button className="link" onClick={() => setScreen('home')}>Cancel</button>
        </>
      )}

      {screen === 'review' && summary && (
        <>
          <div className="card">
            <div
              className="card-label"
              style={{ color: summary.result ? RISK_COLOR[summary.result.worstLevel] : '#8aa0b8' }}
            >
              {summary.result ? `${summary.result.worstLevel.toUpperCase()} — REVIEW` : 'REVIEW'}
            </div>
            <div className="summary">{summary.result ? summary.result.summary : summary.fallback}</div>
            {summary.result?.flags.map((flag, i) => (
              <div key={i} style={{ color: RISK_COLOR[flag.level], fontSize: 13, marginTop: 4 }}>
                • {flag.message}
              </div>
            ))}
          </div>
          <button
            className={`primary${summary.result?.worstLevel === 'danger' ? ' danger' : ''}`}
            onClick={onSign}
            disabled={busy}
          >
            {busy ? 'Signing…' : 'Confirm & sign'}
          </button>
          <button className="link" onClick={() => setScreen('home')}>Reject</button>
        </>
      )}

      {screen === 'signed' && (
        <div className="center">
          <p className="label">Show this to your computer</p>
          <div className="qr-box">
            <QrDisplay text={signatureQr} size={280} />
          </div>
          <p className="hint">Your computer scans this to finish the transaction.</p>
          <button className="secondary" onClick={() => setScreen('home')}>Done</button>
        </div>
      )}

      {screen === 'pair' && account && (
        <div className="center">
          <p className="label">Scan this on your computer to add the account to MetaMask</p>
          <div className="qr-box">
            <QrDisplay text={encodeAccount(account.address, account.publicKey, 'NFC Card')} size={280} />
          </div>
          <p className="hint">{short(account.address)} — public info only, no key.</p>
          <button className="secondary" onClick={() => setScreen('home')}>Back</button>
        </div>
      )}
    </div>
  );
}
