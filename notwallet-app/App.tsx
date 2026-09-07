import { CameraView, useCameraPermissions } from 'expo-camera';
import * as LocalAuthentication from 'expo-local-authentication';
import { JsonRpcProvider, formatEther } from 'ethers';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import {
  clearSign,
  clearSignTypedData,
  type ClearSignResult,
  type RiskLevel,
} from './src/clearsign';
import { MfkdfSigner } from './src/mfkdf';
import { isNfcSupported, readNfcCardId } from './src/nfc';
import { decodeRequest, encodeAccount, encodeSignature } from './src/qr';
import { previewRequest, signRequestWithCard } from './src/signing';
import { clearAccount, loadAccount, saveAccount } from './src/storage';
import type { KeyringRequest } from './src/types';

const SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
const RISK_COLOR: Record<RiskLevel, string> = {
  info: '#8aa0b8',
  warn: '#e0a800',
  danger: '#ff5c5c',
};

type Screen = 'loading' | 'setup' | 'unlock' | 'home' | 'scan' | 'review' | 'signed' | 'pair';

type Account = { address: string; publicKey: string };

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

const short = (a: string) => (a.length > 12 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a);

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [locked, setLocked] = useState(false);
  const [password, setPassword] = useState('');
  const [cardId, setCardId] = useState('');
  const [account, setAccount] = useState<Account | null>(null);
  const [balance, setBalance] = useState('—');
  const [request, setRequest] = useState<KeyringRequest | null>(null);
  const [signatureQr, setSignatureQr] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [permission, requestPermission] = useCameraPermissions();

  const fail = (err: unknown) =>
    setError(err instanceof Error ? err.message : String(err));

  // On launch, restore a saved wallet (public identity only) so it persists like
  // a normal wallet. It comes up LOCKED — you unlock with password + card to sign.
  useEffect(() => {
    let alive = true;
    loadAccount().then((saved) => {
      if (!alive) {
        return;
      }
      if (saved) {
        setAccount({ address: saved.address, publicKey: saved.publicKey });
        setLocked(true);
        setScreen('home');
        void fetchBalance(saved.address);
      } else {
        setScreen('setup');
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      if (!(await isNfcSupported())) {
        throw new Error('NFC not available — type a card id instead.');
      }
      setCardId(await readNfcCardId());
    } catch (err) {
      fail(err);
    }
  }, []);

  // First-time setup: derive, persist the public identity, and unlock.
  const onUnlock = useCallback(async () => {
    setError('');
    setBusy(true);
    try {
      const identity = await new MfkdfSigner(cardId, password).getIdentity();
      const acct = { address: identity.address, publicKey: identity.publicKey };
      setAccount(acct);
      await saveAccount({
        address: identity.address,
        publicKey: identity.publicKey,
        label: identity.label,
      });
      setLocked(false);
      setScreen('home');
      void fetchBalance(acct.address);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }, [cardId, password, fetchBalance]);

  // Unlock an already-saved wallet: re-derive and confirm it matches.
  const onUnlockExisting = useCallback(async () => {
    setError('');
    setBusy(true);
    try {
      const identity = await new MfkdfSigner(cardId, password).getIdentity();
      if (
        !account ||
        identity.address.toLowerCase() !== account.address.toLowerCase()
      ) {
        throw new Error('Wrong password or card for this wallet.');
      }
      setLocked(false);
      setScreen('scan');
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }, [cardId, password, account]);

  const onForget = useCallback(async () => {
    await clearAccount();
    setAccount(null);
    setPassword('');
    setCardId('');
    setLocked(false);
    setBalance('—');
    setScreen('setup');
  }, []);

  const onScanned = useCallback(
    (data: string) => {
      if (screen !== 'scan') {
        return;
      }
      try {
        setRequest(decodeRequest(data));
        setError('');
        setScreen('review');
      } catch (err) {
        fail(err);
      }
    },
    [screen],
  );

  const onSign = useCallback(async () => {
    if (!request || !account) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (await LocalAuthentication.hasHardwareAsync()) {
        const res = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Confirm to sign',
        });
        if (!res.success) {
          throw new Error('Biometric check cancelled.');
        }
      }
      const signer = new MfkdfSigner(cardId, password);
      const identity = await signer.getIdentity();
      const expected = summarize(request).from;
      if (expected && identity.address.toLowerCase() !== expected.toLowerCase()) {
        throw new Error('This request is for a different account.');
      }
      const signature = await signRequestWithCard(request, signer);
      setSignatureQr(encodeSignature(request.id, signature));
      setScreen('signed');
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }, [request, account, cardId, password]);

  const summary = request ? summarize(request) : null;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.brand}>NotWallet</Text>
        <Text style={styles.sub}>Offline signer — your key never leaves this phone.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {screen === 'loading' && (
          <View style={{ marginTop: 40 }}>
            <ActivityIndicator color="#4f46e5" size="large" />
          </View>
        )}

        {screen === 'setup' && (
          <>
            <Text style={styles.label}>Unlock your wallet</Text>
            <TextInput
              style={styles.input}
              placeholder="Password (never stored)"
              placeholderTextColor="#66708a"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            <View style={styles.row}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Card id (tap to fill)"
                placeholderTextColor="#66708a"
                value={cardId}
                onChangeText={setCardId}
              />
              <TouchableOpacity style={styles.ghost} onPress={onTapCard}>
                <Text style={styles.ghostText}>📇 Tap</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.primary} onPress={onUnlock} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Unlock wallet</Text>}
            </TouchableOpacity>
            <Text style={styles.hint}>
              Your key is derived from these two, used to sign, then wiped. Same
              password + card = same account.
            </Text>
          </>
        )}

        {screen === 'home' && account && (
          <>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Account {locked ? '🔒' : '🔓'}</Text>
              <Text style={styles.address}>{short(account.address)}</Text>
              <Text style={styles.balance}>{balance}</Text>
              <Text style={styles.network}>Sepolia</Text>
            </View>
            <TouchableOpacity
              style={styles.primary}
              onPress={() => setScreen(locked ? 'unlock' : 'scan')}
            >
              <Text style={styles.primaryText}>
                {locked ? '🔒 Unlock to sign' : '📷 Scan request to sign'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondary} onPress={() => setScreen('pair')}>
              <Text style={styles.secondaryText}>🔗 Pair with MetaMask</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => fetchBalance(account.address)}>
              <Text style={styles.link}>Refresh balance</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onForget}>
              <Text style={styles.link}>Forget this wallet</Text>
            </TouchableOpacity>
          </>
        )}

        {screen === 'unlock' && (
          <>
            <Text style={styles.label}>Unlock to sign</Text>
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#66708a"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            <View style={styles.row}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Card id (tap to fill)"
                placeholderTextColor="#66708a"
                value={cardId}
                onChangeText={setCardId}
              />
              <TouchableOpacity style={styles.ghost} onPress={onTapCard}>
                <Text style={styles.ghostText}>📇 Tap</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.primary} onPress={onUnlockExisting} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Unlock</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setScreen('home')}>
              <Text style={styles.link}>Back</Text>
            </TouchableOpacity>
          </>
        )}

        {screen === 'scan' && (
          <>
            <Text style={styles.label}>Scan the request from your computer</Text>
            {!permission?.granted ? (
              <TouchableOpacity style={styles.primary} onPress={requestPermission}>
                <Text style={styles.primaryText}>Allow camera</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.camera}>
                <CameraView
                  style={{ flex: 1 }}
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={(e) => onScanned(e.data)}
                />
              </View>
            )}
            <TouchableOpacity onPress={() => setScreen('home')}>
              <Text style={styles.link}>Cancel</Text>
            </TouchableOpacity>
          </>
        )}

        {screen === 'review' && summary && (
          <>
            <View style={styles.card}>
              <Text style={{ ...styles.cardLabel, color: summary.result ? RISK_COLOR[summary.result.worstLevel] : '#8aa0b8' }}>
                {summary.result ? `${summary.result.worstLevel.toUpperCase()} — review` : 'Review'}
              </Text>
              <Text style={styles.summary}>
                {summary.result ? summary.result.summary : summary.fallback}
              </Text>
              {summary.result?.flags.map((flag, index) => (
                <Text key={index} style={{ color: RISK_COLOR[flag.level], fontSize: 13, marginTop: 4 }}>
                  • {flag.message}
                </Text>
              ))}
            </View>
            <TouchableOpacity style={styles.primary} onPress={onSign} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Confirm & sign</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setScreen('home')}>
              <Text style={styles.link}>Reject</Text>
            </TouchableOpacity>
          </>
        )}

        {screen === 'signed' && (
          <View style={styles.center}>
            <Text style={styles.label}>Show this to your computer</Text>
            <View style={styles.qrBox}>
              <QRCode value={signatureQr} size={280} />
            </View>
            <Text style={styles.hint}>Your computer scans this to finish the transaction.</Text>
            <TouchableOpacity style={styles.secondary} onPress={() => setScreen('home')}>
              <Text style={styles.secondaryText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}

        {screen === 'pair' && account && (
          <View style={styles.center}>
            <Text style={styles.label}>Scan this on your computer to add the account</Text>
            <View style={styles.qrBox}>
              <QRCode value={encodeAccount(account.address, account.publicKey, 'NFC Card')} size={280} />
            </View>
            <Text style={styles.hint}>{short(account.address)} — public info only, no key.</Text>
            <TouchableOpacity style={styles.secondary} onPress={() => setScreen('home')}>
              <Text style={styles.secondaryText}>Back</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0c0e14' },
  container: { padding: 22, paddingTop: 64 },
  brand: { color: '#fff', fontSize: 26, fontWeight: '700' },
  sub: { color: '#8aa0b8', fontSize: 13, marginBottom: 20 },
  label: { color: '#c7d0e0', fontSize: 14, marginBottom: 8 },
  hint: { color: '#66708a', fontSize: 12, marginTop: 14, textAlign: 'center' },
  error: { backgroundColor: '#2a1717', color: '#ff8a8a', padding: 12, borderRadius: 10, marginBottom: 14, fontSize: 13 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { backgroundColor: '#11141b', borderColor: '#2a2f3a', borderWidth: 1, borderRadius: 10, color: '#fff', padding: 14, fontSize: 16, marginVertical: 6 },
  primary: { backgroundColor: '#4f46e5', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 12 },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondary: { borderColor: '#4f46e5', borderWidth: 1, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 10 },
  secondaryText: { color: '#a9b0ff', fontSize: 15, fontWeight: '600' },
  ghost: { borderColor: '#4f46e5', borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 },
  ghostText: { color: '#a9b0ff', fontSize: 14 },
  link: { color: '#8aa0b8', fontSize: 14, textAlign: 'center', marginTop: 14 },
  card: { backgroundColor: '#161922', borderRadius: 14, padding: 18, marginBottom: 8 },
  cardLabel: { color: '#8aa0b8', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  address: { color: '#fff', fontSize: 16, marginTop: 6, fontFamily: 'monospace' },
  balance: { color: '#fff', fontSize: 30, fontWeight: '700', marginTop: 10 },
  network: { color: '#8aa0b8', fontSize: 13, marginTop: 2 },
  summary: { color: '#fff', fontSize: 17, fontWeight: '600', marginTop: 8 },
  center: { alignItems: 'center' },
  qrBox: { backgroundColor: '#fff', padding: 16, borderRadius: 12, marginVertical: 14 },
  camera: { height: 300, borderRadius: 12, overflow: 'hidden', marginVertical: 10 },
});
