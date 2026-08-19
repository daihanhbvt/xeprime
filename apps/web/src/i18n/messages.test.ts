import { parse } from '@formatjs/icu-messageformat-parser';
import { describe, expect, it } from 'vitest';

import enMessages from '../../messages/en';
import viMessages from '../../messages/vi';
import { SUPPORTED_LOCALES } from './config';
import { loadMessages } from './messages';
import { MESSAGE_NAMESPACES } from './namespaces';

/**
 * Toàn vẹn của hai bó message.
 *
 * `pnpm i18n:check` kiểm cùng những điều này ở tầng CI; bản test ở đây làm cho chúng đỏ ngay
 * trong vòng lặp phát triển, và đặc biệt là khoá được thứ script không thấy: bó nạp LÚC CHẠY
 * (qua `loadMessages`) đúng bằng bó trên đĩa, và chỉ MỘT ngôn ngữ được nạp mỗi lần.
 */
const BUNDLES = { vi: viMessages, en: enMessages } as const;

function flatten(node: unknown, prefix = '', out: Record<string, unknown> = {}) {
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      flatten(value, full, out);
    } else {
      out[full] = value;
    }
  }
  return out;
}

describe('cấu trúc bó message', () => {
  it('mỗi namespace khai báo đều có mặt ở cả hai ngôn ngữ', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const bundle = BUNDLES[locale] as Record<string, unknown>;
      const declared = MESSAGE_NAMESPACES.map((n) => n.namespace);
      expect(Object.keys(bundle).sort()).toEqual([...declared].sort());
    }
  });

  it('không namespace nào rỗng — một namespace rỗng là chuỗi chết trong bundle', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const bundle = BUNDLES[locale] as Record<string, Record<string, unknown>>;
      const empty = Object.entries(bundle)
        .filter(([, value]) => Object.keys(value).length === 0)
        .map(([name]) => name);
      expect(empty).toEqual([]);
    }
  });
});

describe('parity hai chiều vi ↔ en', () => {
  const vi = flatten(viMessages);
  const en = flatten(enMessages);

  it('tiếng Anh không thiếu khoá nào của tiếng Việt', () => {
    expect(Object.keys(vi).filter((key) => !(key in en))).toEqual([]);
  });

  it('tiếng Anh không có khoá nào tiếng Việt không có', () => {
    expect(Object.keys(en).filter((key) => !(key in vi))).toEqual([]);
  });

  it('mọi giá trị là chuỗi KHÔNG rỗng — bản dịch thiếu phải đỏ, không phải hiện ô trống', () => {
    for (const [name, bundle] of Object.entries({ vi, en })) {
      const bad = Object.entries(bundle)
        .filter(([, value]) => typeof value !== 'string' || value.trim() === '')
        .map(([key]) => `${name}:${key}`);
      expect(bad).toEqual([]);
    }
  });
});

describe('cú pháp ICU', () => {
  it.each(SUPPORTED_LOCALES)('%s parse được toàn bộ message', (locale) => {
    const broken: string[] = [];
    for (const [key, value] of Object.entries(flatten(BUNDLES[locale]))) {
      try {
        parse(String(value));
      } catch (error) {
        broken.push(`${key}: ${(error as Error).message}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('cùng một khoá dùng cùng tập biến ở hai ngôn ngữ', () => {
    const vi = flatten(viMessages);
    const en = flatten(enMessages);
    const variables = (message: string) => {
      const names = new Set<string>();
      const walk = (nodes: readonly { type: number; value?: unknown; options?: Record<string, { value: unknown }> }[]) => {
        for (const node of nodes) {
          if (node.type !== 0 && typeof node.value === 'string') names.add(node.value);
          if (node.options) {
            for (const option of Object.values(node.options)) {
              walk(option.value as never);
            }
          }
        }
      };
      walk(parse(message) as never);
      return [...names].sort();
    };

    const mismatched = Object.keys(vi).filter(
      (key) => variables(String(vi[key])) .join() !== variables(String(en[key])).join(),
    );
    expect(mismatched).toEqual([]);
  });
});

describe('chỉ nạp MỘT ngôn ngữ mỗi lần', () => {
  it.each(SUPPORTED_LOCALES)('loadMessages(%s) trả đúng bó của ngôn ngữ đó', async (locale) => {
    await expect(loadMessages(locale)).resolves.toBe(BUNDLES[locale]);
  });

  it('hai bó là hai object khác nhau — không có đường nào trộn chúng vào một', async () => {
    const [vi, en] = await Promise.all([loadMessages('vi'), loadMessages('en')]);
    expect(vi).not.toBe(en);
    expect(vi.Common.actions.save).not.toBe(en.Common.actions.save);
  });
});
