import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { isAddress, parseEther } from 'ethers';
import { colors, radius, spacing } from '../theme';
import { resolveAddress } from '../ens';

interface SendModalProps {
  visible: boolean;
  userAddress: string;
  balanceEth: string;
  onSendTx: (to: string, amountEth: string) => void;
  onClose: () => void;
}

export function SendModal({
  visible,
  userAddress,
  balanceEth,
  onSendTx,
  onClose,
}: SendModalProps) {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [ensResolved, setEnsResolved] = useState<string | null>(null);
  const [resolvingEns, setResolvingEns] = useState(false);
  const [error, setError] = useState('');

  const handleRecipientChange = async (text: string) => {
    setRecipient(text.trim());
    setError('');
    setEnsResolved(null);

    // If it looks like an address, try reverse lookup
    if (isAddress(text.trim())) {
      setResolvingEns(true);
      try {
        const id = await resolveAddress(text.trim());
        if (id.name) setEnsResolved(id.name);
      } catch {
        // ok
      } finally {
        setResolvingEns(false);
      }
    }
  };

  const handleMax = () => {
    const num = parseFloat(balanceEth);
    if (!isNaN(num) && num > 0.002) {
      // Leave 0.002 for gas
      setAmount((num - 0.002).toFixed(4));
    } else {
      setAmount(balanceEth);
    }
  };

  const handleContinue = () => {
    setError('');
    if (!recipient) {
      setError('Please enter a recipient address or ENS name.');
      return;
    }
    if (!isAddress(recipient)) {
      setError('Invalid Ethereum address.');
      return;
    }
    const amtNum = parseFloat(amount);
    if (isNaN(amtNum) || amtNum <= 0) {
      setError('Please enter a valid amount.');
      return;
    }

    onSendTx(recipient, amount);
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={styles.title}>Send Ethereum</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* Recipient Input */}
          <Text style={styles.inputLabel}>To (Address or ENS)</Text>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="0x... or name.eth"
              placeholderTextColor={colors.textDim}
              value={recipient}
              onChangeText={handleRecipientChange}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {resolvingEns && (
              <ActivityIndicator color={colors.brand} style={styles.inputIcon} />
            )}
          </View>
          {ensResolved && (
            <Text style={styles.ensHelperText}>✓ Resolves to: {ensResolved}</Text>
          )}

          {/* Amount Input */}
          <View style={styles.labelRow}>
            <Text style={styles.inputLabel}>Amount (ETH)</Text>
            <Text style={styles.availableText}>Available: {balanceEth} ETH</Text>
          </View>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="0.0"
              placeholderTextColor={colors.textDim}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
            />
            <TouchableOpacity style={styles.maxButton} onPress={handleMax}>
              <Text style={styles.maxText}>MAX</Text>
            </TouchableOpacity>
          </View>

          {/* Continue Button */}
          <TouchableOpacity style={styles.continueButton} onPress={handleContinue}>
            <Text style={styles.continueText}>Review & Sign</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 7, 10, 0.8)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingBottom: 40,
    paddingHorizontal: spacing.lg,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderFocus,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  closeText: {
    fontSize: 18,
    color: colors.textDim,
    padding: 4,
  },
  errorText: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
    color: colors.danger,
    padding: 10,
    borderRadius: radius.md,
    fontSize: 13,
    marginBottom: spacing.md,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 6,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: 6,
  },
  availableText: {
    fontSize: 12,
    color: colors.textDim,
  },
  inputWrapper: {
    position: 'relative',
    justifyContent: 'center',
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    color: colors.text,
    padding: 14,
    fontSize: 15,
  },
  inputIcon: {
    position: 'absolute',
    right: 14,
  },
  ensHelperText: {
    color: colors.ok,
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
  maxButton: {
    position: 'absolute',
    right: 12,
    backgroundColor: colors.brandBg,
    borderColor: colors.brand,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
  },
  maxText: {
    color: colors.brandSoft,
    fontSize: 12,
    fontWeight: '700',
  },
  continueButton: {
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  continueText: {
    color: colors.onBrand,
    fontSize: 16,
    fontWeight: '600',
  },
});
