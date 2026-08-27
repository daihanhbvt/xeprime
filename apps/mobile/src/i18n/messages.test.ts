import { LOCALES } from './config';
import { MESSAGES } from './messages';

/**
 * Parity vi↔en của GỐC CHUNG do `pnpm --filter @xeprime/web i18n:check` canh — nó thấy cả 22
 * namespace, kể cả những cái app native chưa nạp.
 *
 * Test này canh thứ script không thấy: bó THẬT SỰ vào bundle native. Bảng gom quên một
 * namespace ở một ngôn ngữ là màn hình đó rơi về khoá thô đúng ở ngôn ngữ đó — lỗi chỉ hiện
 * khi ai đó đổi ngôn ngữ trong app.
 */
function keyPaths(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];

  return Object.entries(value).flatMap(([key, child]) =>
    keyPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('bó message của app native', () => {
  const viKeys = keyPaths(MESSAGES.vi).sort();

  it.each(LOCALES)('%s có đúng bộ khoá như tiếng Việt', (locale) => {
    expect(keyPaths(MESSAGES[locale]).sort()).toEqual(viKeys);
  });

  it.each(LOCALES)('%s không có chuỗi rỗng', (locale) => {
    const empty = keyPaths(MESSAGES[locale]).filter((path) => {
      const value = path
        .split('.')
        .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], MESSAGES[locale]);
      return typeof value !== 'string' || value.trim() === '';
    });

    expect(empty).toEqual([]);
  });

  it.each(LOCALES)('%s gom đúng bộ namespace như tiếng Việt', (locale) => {
    expect(Object.keys(MESSAGES[locale]).sort()).toEqual(Object.keys(MESSAGES.vi).sort());
  });
});
