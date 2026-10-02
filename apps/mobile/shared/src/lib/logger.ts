type LogPayload = Readonly<Record<string, unknown>>;

/**
 * Một cửa duy nhất để ghi log, thay cho `console.*` rải rác (đang bị `no-console` chặn).
 *
 * Bản phát hành im lặng: log của thư viện client không tới được ai, mà lại có nguy cơ in
 * thông tin của người dùng ra logcat/Console.app. Chỗ này là nơi cắm Sentry sau.
 */
const enabled = __DEV__;

function write(level: 'debug' | 'warn' | 'error', message: string, payload?: LogPayload): void {
  if (!enabled) return;

  // eslint-disable-next-line no-console -- đây LÀ chỗ được phép; mọi nơi khác đi qua logger.
  console[level === 'debug' ? 'log' : level](message, payload ?? '');
}

export const logger = {
  debug: (message: string, payload?: LogPayload) => write('debug', message, payload),
  warn: (message: string, payload?: LogPayload) => write('warn', message, payload),
  error: (message: string, payload?: LogPayload) => write('error', message, payload),
};
