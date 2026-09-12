import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, radius, spacing } from '../theme';
import {
  readNfcCardId,
  cancelNfcRead,
  isNfcSupported,
  isNfcEnabled,
  openNfcSettings,
} from '../nfc';

interface NfcScanSheetProps {
  visible: boolean;
  title?: string;
  subtitle?: string;
  onScanned: (cardId: string) => void;
  onCancel: () => void;
}

export function NfcScanSheet({
  visible,
  title = 'Ready to Scan',
  subtitle = 'Hold your card to the back of your phone',
  onScanned,
  onCancel,
}: NfcScanSheetProps) {
  const [status, setStatus] = useState<'scanning' | 'success' | 'error'>('scanning');
  const [errorMessage, setErrorMessage] = useState('');
  const [isNfcOff, setIsNfcOff] = useState(false);

  // Pulsing radar animations
  const pulseAnim1 = useRef(new Animated.Value(0)).current;
  const pulseAnim2 = useRef(new Animated.Value(0)).current;
  const pulseAnim3 = useRef(new Animated.Value(0)).current;

  const runScan = useRef<() => void>(() => {});

  useEffect(() => {
    if (!visible) {
      cancelNfcRead().catch(() => {});
      return;
    }

    // Start pulsing loops
    const createPulse = (anim: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: 1,
            duration: 2000,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      );
    };

    const pulse1 = createPulse(pulseAnim1, 0);
    const pulse2 = createPulse(pulseAnim2, 600);
    const pulse3 = createPulse(pulseAnim3, 1200);

    pulse1.start();
    pulse2.start();
    pulse3.start();

    let isCancelled = false;

    const startScan = async () => {
      setStatus('scanning');
      setErrorMessage('');
      setIsNfcOff(false);

      try {
        const supported = await isNfcSupported();
        if (!supported) {
          throw new Error('NFC is not supported on this phone hardware.');
        }

        const enabled = await isNfcEnabled();
        if (!enabled) {
          setIsNfcOff(true);
          throw new Error('NFC is turned OFF in your phone settings.');
        }

        const id = await readNfcCardId();
        if (isCancelled) return;

        setStatus('success');
        setTimeout(() => {
          onScanned(id);
        }, 500);
      } catch (err: any) {
        if (isCancelled) return;
        setStatus('error');
        setErrorMessage(err?.message || 'Failed to read card.');
      }
    };

    runScan.current = startScan;
    startScan();

    return () => {
      isCancelled = true;
      pulse1.stop();
      pulse2.stop();
      pulse3.stop();
      cancelNfcRead().catch(() => {});
    };
  }, [visible, pulseAnim1, pulseAnim2, pulseAnim3, onScanned]);

  // Dev simulation tap for environments without physical cards
  const handleDevTap = () => {
    setStatus('success');
    setTimeout(() => {
      onScanned('notwallet-simulated-card-uid-4a8f9c');
    }, 400);
  };

  const handleCancel = () => {
    cancelNfcRead().catch(() => {});
    onCancel();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {/* Grab handle indicator */}
          <View style={styles.handle} />

          {/* Title and instructions */}
          <Text style={styles.title}>
            {status === 'success' ? 'Card Detected!' : title}
          </Text>
          <Text style={styles.subtitle}>
            {status === 'success'
              ? 'Deriving hardware key securely…'
              : status === 'error'
              ? errorMessage
              : subtitle}
          </Text>

          {/* Tangem-style Radar Scanner Animation */}
          <View style={styles.radarContainer}>
            {status === 'scanning' && (
              <>
                <Animated.View
                  style={[
                    styles.radarRing,
                    {
                      transform: [
                        {
                          scale: pulseAnim1.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.8, 2.2],
                          }),
                        },
                      ],
                      opacity: pulseAnim1.interpolate({
                        inputRange: [0, 0.7, 1],
                        outputRange: [0.6, 0.2, 0],
                      }),
                    },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.radarRing,
                    {
                      transform: [
                        {
                          scale: pulseAnim2.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.8, 2.2],
                          }),
                        },
                      ],
                      opacity: pulseAnim2.interpolate({
                        inputRange: [0, 0.7, 1],
                        outputRange: [0.6, 0.2, 0],
                      }),
                    },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.radarRing,
                    {
                      transform: [
                        {
                          scale: pulseAnim3.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.8, 2.2],
                          }),
                        },
                      ],
                      opacity: pulseAnim3.interpolate({
                        inputRange: [0, 0.7, 1],
                        outputRange: [0.6, 0.2, 0],
                      }),
                    },
                  ]}
                />
              </>
            )}

            {/* Central Physical Card Card Graphic */}
            <View
              style={[
                styles.cardBadge,
                status === 'success' && styles.cardBadgeSuccess,
                status === 'error' && styles.cardBadgeError,
              ]}
            >
              <Text style={styles.cardIcon}>
                {status === 'success' ? '✓' : status === 'error' ? '!' : '💳'}
              </Text>
              {status === 'scanning' && (
                <View style={styles.nfcWaveBadge}>
                  <Text style={styles.nfcWaveText}>((( NFC )))</Text>
                </View>
              )}
            </View>
          </View>

          {/* Status Label */}
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                status === 'scanning' && styles.statusDotScanning,
                status === 'success' && styles.statusDotSuccess,
                status === 'error' && styles.statusDotError,
              ]}
            />
            <Text style={styles.statusText}>
              {status === 'scanning'
                ? 'Ready • Tap NFC Card'
                : status === 'success'
                ? 'Authenticated'
                : 'Tap Failed'}
            </Text>
          </View>

          {status === 'scanning' && (
            <Text style={styles.hintText}>
              Hold card against the upper-back of your phone (near camera module)
            </Text>
          )}

          {/* Action Buttons for Error State */}
          {status === 'error' && (
            <View style={styles.errorActionRow}>
              {isNfcOff && (
                <TouchableOpacity
                  style={styles.settingsButton}
                  onPress={() => openNfcSettings()}
                >
                  <Text style={styles.settingsButtonText}>⚙️ Open Phone NFC Settings</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => runScan.current?.()}
              >
                <Text style={styles.retryButtonText}>🔄 Try Again</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Dev bypass for physical testing if NFC chip is absent */}
          {__DEV__ && status === 'scanning' && (
            <TouchableOpacity style={styles.devSimButton} onPress={handleDevTap}>
              <Text style={styles.devSimText}>⚡ Test NFC Tap (Simulator)</Text>
            </TouchableOpacity>
          )}

          {/* Cancel Button */}
          <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 7, 10, 0.78)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingBottom: 40,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 20,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderFocus,
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textDim,
    textAlign: 'center',
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  radarContainer: {
    width: 180,
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: spacing.md,
  },
  radarRing: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
    borderColor: colors.brand,
    backgroundColor: colors.brandBg,
  },
  cardBadge: {
    width: 110,
    height: 72,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: colors.brandSoft,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.brand,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  cardBadgeSuccess: {
    borderColor: colors.ok,
    backgroundColor: colors.okBg,
  },
  cardBadgeError: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerBg,
  },
  cardIcon: {
    fontSize: 28,
    color: colors.text,
  },
  nfcWaveBadge: {
    marginTop: 2,
  },
  nfcWaveText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.brandSoft,
    letterSpacing: 1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusDotScanning: {
    backgroundColor: colors.brandSoft,
  },
  statusDotSuccess: {
    backgroundColor: colors.ok,
  },
  statusDotError: {
    backgroundColor: colors.danger,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  devSimButton: {
    marginTop: spacing.xs,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  devSimText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.brandSoft,
  },
  cancelButton: {
    marginTop: spacing.lg,
    paddingVertical: 12,
    paddingHorizontal: spacing.xxl,
    borderRadius: radius.pill,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textDim,
  },
  hintText: {
    fontSize: 12,
    color: colors.textDim,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  errorActionRow: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
    width: '100%',
    paddingHorizontal: spacing.lg,
  },
  settingsButton: {
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.brandSoft,
    width: '100%',
    alignItems: 'center',
  },
  settingsButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.brandSoft,
  },
  retryButton: {
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSoft,
    width: '100%',
    alignItems: 'center',
  },
  retryButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.surface,
  },
});
