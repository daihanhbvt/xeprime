import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { XP_TOKENS } from './theme';

/**
 * ADR 0003: `theme.ts` và `tokens.css` là hai bản của cùng một bộ token. Không có test này
 * thì một bên đổi mà bên kia quên là lỗi im lặng — CSS chỉ fallback về giá trị trình duyệt.
 *
 * Dùng cwd (= apps/web khi vitest chạy) thay cho import.meta.url: Turbopack/vitest có thể
 * không cấp URL scheme `file:` cho import.meta.url, làm fileURLToPath ném lỗi.
 */
const CSS_PATH = resolve(process.cwd(), 'src/styles/tokens.css');
const DECLARATION_RE = /^\s*(--xp-[a-z0-9-]+)\s*:\s*([^;]+);/gm;

function readCssTokens(): Map<string, string> {
  const css = readFileSync(CSS_PATH, 'utf8');
  const tokens = new Map<string, string>();

  for (const match of css.matchAll(DECLARATION_RE)) {
    const name = match[1];
    const value = match[2];
    if (name && value) {
      tokens.set(name, value.trim().replace(/\s+/g, ' '));
    }
  }

  return tokens;
}

describe('design token', () => {
  const cssTokens = readCssTokens();

  it('tokens.css khai báo đúng bộ key của XP_TOKENS', () => {
    const fromTs = Object.keys(XP_TOKENS)
      .map((key) => `--xp-${key}`)
      .sort();
    const fromCss = [...cssTokens.keys()].sort();

    expect(fromCss).toEqual(fromTs);
  });

  it('giá trị của từng token khớp nhau', () => {
    for (const [key, value] of Object.entries(XP_TOKENS)) {
      expect(cssTokens.get(`--xp-${key}`), `token --xp-${key}`).toBe(value.replace(/\s+/g, ' '));
    }
  });

  it('không có token rỗng', () => {
    for (const [name, value] of cssTokens) {
      expect(value.length, `token ${name}`).toBeGreaterThan(0);
    }
  });
});
