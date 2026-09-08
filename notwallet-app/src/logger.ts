/**
 * In-App Logger — captures logs in memory and AsyncStorage so testers can view
 * them directly on their Android phone without a USB cable or terminal.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export type LogEntry = {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'nfc';
  tag: string;
  message: string;
  details?: string;
};

const MAX_LOGS = 200;
const LOG_STORAGE_KEY = 'notwallet.debug_logs.v1';
const inMemoryLogs: LogEntry[] = [];
const listeners = new Set<(logs: LogEntry[]) => void>();

export const logger = {
  log(tag: string, message: string, details?: any) {
    appendLog('info', tag, message, details);
    console.log(`[${tag}] ${message}`, details ?? '');
  },

  warn(tag: string, message: string, details?: any) {
    appendLog('warn', tag, message, details);
    console.warn(`[${tag}] ⚠️ ${message}`, details ?? '');
  },

  error(tag: string, message: string, details?: any) {
    appendLog('error', tag, message, details);
    console.error(`[${tag}] 🚨 ${message}`, details ?? '');
  },

  nfc(tag: string, message: string, details?: any) {
    appendLog('nfc', tag, message, details);
    console.log(`[NFC:${tag}] 📇 ${message}`, details ?? '');
  },

  getLogs(): LogEntry[] {
    return [...inMemoryLogs];
  },

  clear() {
    inMemoryLogs.length = 0;
    notify();
    AsyncStorage.removeItem(LOG_STORAGE_KEY).catch(() => {});
  },

  subscribe(listener: (logs: LogEntry[]) => void) {
    listeners.add(listener);
    listener([...inMemoryLogs]);
    return () => {
      listeners.delete(listener);
    };
  },
};

function appendLog(
  level: LogEntry['level'],
  tag: string,
  message: string,
  details?: any,
) {
  const time = new Date().toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const entry: LogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: time,
    level,
    tag,
    message,
    details: details ? (typeof details === 'string' ? details : JSON.stringify(details)) : undefined,
  };

  inMemoryLogs.unshift(entry);
  if (inMemoryLogs.length > MAX_LOGS) {
    inMemoryLogs.pop();
  }

  notify();
}

function notify() {
  const copy = [...inMemoryLogs];
  listeners.forEach((fn) => fn(copy));
}
