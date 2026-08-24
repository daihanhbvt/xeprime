import { LOCALES } from './config';
import { MESSAGES } from './messages';

function keyPaths(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];

  return Object.entries(value).flatMap(([key, child]) =>
    keyPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('bó message', () => {
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
});
