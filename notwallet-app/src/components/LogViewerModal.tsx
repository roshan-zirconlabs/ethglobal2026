import React, { useEffect, useState } from 'react';
import {
  Clipboard,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, radius, spacing } from '../theme';
import { logger, type LogEntry } from '../logger';

interface LogViewerModalProps {
  visible: boolean;
  onClose: () => void;
}

export function LogViewerModal({ visible, onClose }: LogViewerModalProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<'all' | 'nfc' | 'warn' | 'error'>('all');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!visible) return;
    return logger.subscribe(setLogs);
  }, [visible]);

  const filteredLogs = logs.filter((log) => {
    if (filter === 'all') return true;
    if (filter === 'nfc') return log.level === 'nfc';
    if (filter === 'warn') return log.level === 'warn';
    if (filter === 'error') return log.level === 'error';
    return true;
  });

  const handleCopyLogs = () => {
    const text = logs
      .map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.tag}] ${l.message}${l.details ? ' ' + l.details : ''}`)
      .join('\n');
    Clipboard.setString(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          {/* Top Header */}
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>Live Device Logs</Text>
              <Text style={styles.subtitle}>{logs.length} events logged in memory</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Filter Chips & Action Bar */}
          <View style={styles.actionBar}>
            <View style={styles.filterGroup}>
              {(['all', 'nfc', 'warn', 'error'] as const).map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterChip, filter === f && styles.filterChipActive]}
                  onPress={() => setFilter(f)}
                >
                  <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
                    {f === 'nfc' ? '📇 NFC' : f.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.actionButtonsRow}>
              <TouchableOpacity style={styles.utilityBtn} onPress={handleCopyLogs}>
                <Text style={styles.utilityBtnText}>{copied ? '✓ Copied' : 'Copy All'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.utilityBtn} onPress={() => logger.clear()}>
                <Text style={[styles.utilityBtnText, { color: colors.danger }]}>Clear</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Log Stream List */}
          <ScrollView style={styles.logList} contentContainerStyle={styles.logListContent}>
            {filteredLogs.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No logs match this filter.</Text>
              </View>
            ) : (
              filteredLogs.map((log) => (
                <View key={log.id} style={styles.logCard}>
                  <View style={styles.logMetaRow}>
                    <View style={styles.tagGroup}>
                      <Text
                        style={[
                          styles.levelBadge,
                          log.level === 'nfc' && styles.levelBadgeNfc,
                          log.level === 'warn' && styles.levelBadgeWarn,
                          log.level === 'error' && styles.levelBadgeError,
                        ]}
                      >
                        {log.level.toUpperCase()}
                      </Text>
                      <Text style={styles.tagText}>{log.tag}</Text>
                    </View>
                    <Text style={styles.timestampText}>{log.timestamp}</Text>
                  </View>
                  <Text style={styles.messageText}>{log.message}</Text>
                  {log.details && <Text style={styles.detailsText}>{log.details}</Text>}
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 7, 10, 0.85)',
    justifyContent: 'flex-end',
  },
  sheet: {
    height: '85%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textDim,
  },
  closeBtn: {
    padding: 6,
  },
  closeBtnText: {
    fontSize: 18,
    color: colors.textDim,
  },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  filterGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  filterChip: {
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.brandBg,
    borderColor: colors.brand,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textDim,
  },
  filterChipTextActive: {
    color: colors.brandSoft,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  utilityBtn: {
    backgroundColor: colors.surfaceAlt,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  utilityBtnText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  logList: {
    flex: 1,
  },
  logListContent: {
    paddingVertical: spacing.md,
    gap: 8,
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textDim,
    fontSize: 14,
  },
  logCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  tagGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  levelBadge: {
    fontSize: 9,
    fontWeight: '700',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: colors.infoBg,
    color: colors.info,
  },
  levelBadgeNfc: {
    backgroundColor: colors.brandBg,
    color: colors.brandSoft,
  },
  levelBadgeWarn: {
    backgroundColor: colors.warnBg,
    color: colors.warn,
  },
  levelBadgeError: {
    backgroundColor: colors.dangerBg,
    color: colors.danger,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  timestampText: {
    fontSize: 10,
    color: colors.textDim,
    fontFamily: 'monospace',
  },
  messageText: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  },
  detailsText: {
    fontSize: 11,
    color: colors.textDim,
    fontFamily: 'monospace',
    marginTop: 4,
  },
});
