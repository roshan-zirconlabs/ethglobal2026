import React, { useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { colors, radius, spacing } from '../theme';

interface ReceiveModalProps {
  visible: boolean;
  address: string;
  ensName?: string;
  onClose: () => void;
}

export function ReceiveModal({
  visible,
  address,
  ensName,
  onClose,
}: ReceiveModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Receive Assets</Text>
          <Text style={styles.subtitle}>
            Sepolia Testnet (Ethereum, ERC-20, ENS)
          </Text>

          {/* QR Code Container with High-Contrast White Plate */}
          <View style={styles.qrPlate}>
            <QRCode
              value={address}
              size={190}
              color="#0B0D12"
              backgroundColor="#FFFFFF"
            />
          </View>

          {/* ENS or Truncated Address */}
          {ensName ? (
            <View style={styles.ensBadge}>
              <Text style={styles.ensText}>{ensName} ✓</Text>
            </View>
          ) : null}

          <View style={styles.addressBox}>
            <Text style={styles.addressText}>{address}</Text>
          </View>

          <TouchableOpacity style={styles.copyButton} onPress={handleCopy}>
            <Text style={styles.copyButtonText}>
              {copied ? '✓ Address Copied' : 'Copy Address'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 7, 10, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textDim,
    marginBottom: spacing.lg,
  },
  qrPlate: {
    padding: spacing.lg,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    marginBottom: spacing.lg,
  },
  ensBadge: {
    backgroundColor: colors.brandBg,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.brand,
    marginBottom: 8,
  },
  ensText: {
    color: colors.brandSoft,
    fontSize: 13,
    fontWeight: '600',
  },
  addressBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    width: '100%',
  },
  addressText: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
  },
  copyButton: {
    backgroundColor: colors.brand,
    width: '100%',
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  copyButtonText: {
    color: colors.onBrand,
    fontSize: 15,
    fontWeight: '600',
  },
  closeButton: {
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
  },
  closeButtonText: {
    color: colors.textDim,
    fontSize: 14,
    fontWeight: '500',
  },
});
