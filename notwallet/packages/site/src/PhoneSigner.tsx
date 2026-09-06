/**
 * PhoneSigner — the standalone phone-side signer (open with ?role=phone).
 *
 * This runs on your phone and NEVER talks to the PC over the network. It:
 *   1. scans the request QR shown by the desktop,
 *   2. shows the clear-signing screen (what you're about to sign),
 *   3. takes your password + NFC card, derives the key (MFKDF), signs, wipes,
 *   4. shows the signature as a QR for the desktop to scan back.
 *
 * Because the key is derived and used here, on the phone, it never touches the
 * (possibly compromised) computer — only a finished signature crosses back.
 */
import type { KeyringRequest } from '@metamask/keyring-api';
import type { Json } from '@metamask/utils';
import type { FunctionComponent } from 'react';
import { useCallback, useMemo, useState } from 'react';

import { MfkdfCard, readNfcCardId } from './card-mfkdf';
import {
  clearSign,
  clearSignTypedData,
  type ClearSignResult,
} from './clearsign';
import { QrDisplay, QrScanner } from './Qr';
import { decodeRequest, encodeSignature } from './qr-transport';
import { previewRequest, signRequestWithCard } from './signing';

type Step = 'scan' | 'review' | 'done';

function summarize(request: KeyringRequest): {
  result: ClearSignResult | null;
  fallback: string;
  from: string;
} {
  const preview = previewRequest(request);
  switch (preview.kind) {
    case 'tx':
      return {
        result: clearSign(preview.tx, new Set()),
        fallback: '',
        from: preview.from,
      };
    case 'typedData':
      return {
        result: clearSignTypedData(
          preview.domain,
          preview.primaryType,
          preview.message,
          new Set(),
        ),
        fallback: '',
        from: preview.from,
      };
    case 'message':
      return { result: null, fallback: `Sign message: "${preview.text}"`, from: preview.from };
    default:
      return { result: null, fallback: `Approve: ${preview.method}`, from: '' };
  }
}

const RISK_COLOR = { info: '#8aa', warn: '#e0a800', danger: '#ff5c5c' } as const;

export const PhoneSigner: FunctionComponent = () => {
  const [step, setStep] = useState<Step>('scan');
  const [request, setRequest] = useState<KeyringRequest | null>(null);
  const [password, setPassword] = useState('');
  const [cardId, setCardId] = useState('');
  const [isReadingCard, setIsReadingCard] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState('');
  const [signatureQr, setSignatureQr] = useState('');

  const summary = useMemo(() => (request ? summarize(request) : null), [request]);

  const onScan = useCallback((text: string) => {
    try {
      setRequest(decodeRequest(text));
      setError('');
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const onReadCard = useCallback(async () => {
    setIsReadingCard(true);
    try {
      setCardId(await readNfcCardId());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsReadingCard(false);
    }
  }, []);

  const onSign = useCallback(async () => {
    if (!request) {
      return;
    }
    setIsSigning(true);
    setError('');
    try {
      const signer = new MfkdfCard({ cardId, password, label: 'NFC Card' });
      // Guard: the derived key must match the account the request is for.
      const identity = await signer.getIdentity();
      const expected = summary?.from ?? '';
      if (expected && identity.address.toLowerCase() !== expected.toLowerCase()) {
        throw new Error(
          `Wrong password or card. Derived ${identity.address}, but this ` +
            `request is for ${expected}. Nothing was signed.`,
        );
      }
      const signature: Json = await signRequestWithCard(request, signer);
      setSignatureQr(encodeSignature(request.id, signature));
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSigning(false);
    }
  }, [cardId, password, request, summary]);

  const reset = useCallback(() => {
    setRequest(null);
    setPassword('');
    setSignatureQr('');
    setError('');
    setStep('scan');
  }, []);

  return (
    <div style={wrap}>
      <h1 style={{ fontSize: 22, margin: '0 0 4px' }}>NotWallet</h1>
      <p style={{ color: '#9aa', margin: '0 0 18px', fontSize: 13 }}>
        Offline signer — your key never leaves this phone.
      </p>

      {error && <div style={errorBox}>{error}</div>}

      {step === 'scan' && (
        <>
          <p style={label}>Scan the request from your computer</p>
          <QrScanner onScan={onScan} onError={setError} />
        </>
      )}

      {step === 'review' && summary && (
        <>
          <div style={card}>
            <div
              style={{
                ...verdict,
                color: summary.result
                  ? RISK_COLOR[summary.result.worstLevel]
                  : '#8aa',
              }}
            >
              {summary.result
                ? `${summary.result.worstLevel.toUpperCase()} — review`
                : 'Review'}
            </div>
            <p style={{ fontSize: 17, fontWeight: 600, margin: '6px 0 10px' }}>
              {summary.result ? summary.result.summary : summary.fallback}
            </p>
            {summary.result?.flags.map((flag, index) => (
              <div key={index} style={{ color: RISK_COLOR[flag.level], fontSize: 13 }}>
                • {flag.message}
              </div>
            ))}
          </div>

          <input
            type="password"
            placeholder="Password (never stored)"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            style={input}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder="Card ID (tap to fill)"
              value={cardId}
              onChange={(event) => setCardId(event.target.value)}
              style={{ ...input, flex: 1 }}
            />
            <button type="button" onClick={onReadCard} disabled={isReadingCard} style={btnGhost}>
              {isReadingCard ? 'Tap now…' : '📇 Tap'}
            </button>
          </div>

          <button
            type="button"
            onClick={onSign}
            disabled={isSigning}
            style={{
              ...btn,
              background: summary.result?.worstLevel === 'danger' ? '#c0392b' : '#4f46e5',
            }}
          >
            {isSigning ? 'Signing on card…' : 'Sign & show code'}
          </button>
          <button type="button" onClick={reset} style={btnText}>
            Cancel
          </button>
        </>
      )}

      {step === 'done' && (
        <div style={{ textAlign: 'center' }}>
          <p style={label}>Show this to your computer</p>
          <QrDisplay text={signatureQr} size={300} />
          <p style={{ color: '#9aa', fontSize: 13, marginTop: 10 }}>
            Your computer scans this to finish the transaction.
          </p>
          <button type="button" onClick={reset} style={btnText}>
            Sign another
          </button>
        </div>
      )}
    </div>
  );
};

const wrap = {
  maxWidth: 420,
  margin: '0 auto',
  padding: '24px 18px',
  minHeight: '100vh',
  background: '#0c0e14',
  color: '#e8eaf0',
  fontFamily: 'system-ui, sans-serif',
} as const;
const label = { fontSize: 13, color: '#9aa', marginBottom: 8 } as const;
const card = {
  background: '#161922',
  borderRadius: 12,
  padding: 14,
  margin: '0 0 14px',
} as const;
const verdict = { fontWeight: 700, fontSize: 12, letterSpacing: '0.05em' } as const;
const input = {
  width: '100%',
  padding: 12,
  margin: '6px 0',
  borderRadius: 10,
  border: '1px solid #2a2f3a',
  background: '#11141b',
  color: '#e8eaf0',
  fontSize: 16,
  boxSizing: 'border-box',
} as const;
const btn = {
  width: '100%',
  padding: 14,
  marginTop: 10,
  border: 0,
  borderRadius: 12,
  color: '#fff',
  fontSize: 16,
  fontWeight: 600,
} as const;
const btnGhost = {
  padding: '0 14px',
  borderRadius: 10,
  border: '1px solid #4f46e5',
  background: 'transparent',
  color: '#a9b0ff',
  fontSize: 14,
} as const;
const btnText = {
  width: '100%',
  padding: 10,
  marginTop: 8,
  border: 0,
  background: 'transparent',
  color: '#9aa',
  fontSize: 14,
} as const;
const errorBox = {
  background: '#2a1717',
  color: '#ff8a8a',
  borderRadius: 10,
  padding: 12,
  fontSize: 13,
  marginBottom: 12,
} as const;
