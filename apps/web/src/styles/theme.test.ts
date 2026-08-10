import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { theme } from 'antd';
import { describe, expect, it } from 'vitest';

import { XP_BREAKPOINTS, XP_TOKENS, antdTheme } from './theme';

/**
 * ADR 0003: `theme.ts` và `tokens.css` là hai bản của cùng một bộ token. Không có test này
 * thì một bên đổi mà bên kia quên là lỗi im lặng — CSS chỉ fallback về giá trị trình duyệt.
 *
 * Dùng cwd (= apps/web khi vitest chạy) thay cho import.meta.url: Turbopack/vitest có thể
 * không cấp URL scheme `file:` cho import.meta.url, làm fileURLToPath ném lỗi.
 */
const CSS_PATH = resolve(process.cwd(), 'src/styles/tokens.css');
const DECLARATION_RE = /^\s*(--xp-[a-z0-9-]+)\s*:\s*([^;]+);/gm;

/** Độ sáng tương đối theo WCAG 2.x. Nhận cả `#rgb` lẫn `#rrggbb` (AntD trả `#fff`). */
function luminance(hex: string): number {
  const raw = hex.replace('#', '');
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : raw;
  const channels = [0, 2, 4]
    .map((i) => Number.parseInt(full.slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Chuẩn hoá giá trị token trước khi so sánh.
 *
 * So sánh chuỗi thô không dùng được: Prettier xuống dòng những giá trị dài (`color-mix(...)`
 * của sidebar tối), tạo ra `color-mix( in srgb, …` trong CSS trong khi TS viết liền. Hai bên
 * vẫn là CÙNG một giá trị CSS — cái cần khoá là giá trị, không phải cách xuống dòng.
 */
function normalize(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s*,\s*/g, ', ');
}

function readCssTokens(): Map<string, string> {
  /*
   * Chỉ đọc khối `:root` GỐC, cắt tại `@media` đầu tiên.
   *
   * Từ Wave 3B-R2, `tokens.css` có một khối ghi đè mật độ ở ≤640px. Đọc cả file thì giá trị
   * mobile (khai sau) đè lên giá trị desktop trong Map và test đỏ oan — trong khi hợp đồng mà
   * test này khoá là "`theme.ts` khớp token DESKTOP".
   */
  // Cắt tại at-rule THẬT (`@media` đầu dòng) — có một comment nhắc tới chữ "@media" ở giữa
  // dòng, cắt theo chuỗi trần sẽ nuốt luôn phần token khai sau comment đó.
  const css = readFileSync(CSS_PATH, 'utf8').split(/^@media/m)[0]!;
  const tokens = new Map<string, string>();

  for (const match of css.matchAll(DECLARATION_RE)) {
    const name = match[1];
    const value = match[2];
    if (name && value) {
      tokens.set(name, normalize(value));
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
      expect(cssTokens.get(`--xp-${key}`), `token --xp-${key}`).toBe(normalize(value));
    }
  });

  it('không có token rỗng', () => {
    for (const [name, value] of cssTokens) {
      expect(value.length, `token ${name}`).toBeGreaterThan(0);
    }
  });

  it('bí danh deprecated trỏ về token canonical, không nhân đôi giá trị', () => {
    // Nếu một bí danh được gán giá trị thật thay vì var(), hai nguồn sẽ trôi khỏi nhau
    // đúng vào lúc token canonical đổi — đây là thứ test này chặn.
    const aliases = [
      'color-bg-layout',
      'color-border-secondary',
      'gold-deep',
      'gold-wash',
      'color-bg-sand',
      'shadow-sm',
      'shadow-md',
      'shadow-lg',
    ] as const;

    for (const alias of aliases) {
      const value = XP_TOKENS[alias];
      expect(value, `bí danh --xp-${alias}`).toMatch(/^var\(--xp-[a-z0-9-]+\)$/);
      // Token đích phải tồn tại thật.
      const target = value.slice('var('.length, -1);
      expect(cssTokens.has(target), `đích của --xp-${alias} là ${target}`).toBe(true);
    }
  });

  it('XP_BREAKPOINTS suy ra từ token, không gõ lại số', () => {
    expect(XP_BREAKPOINTS.mobile).toBe(Number.parseFloat(XP_TOKENS['bp-mobile']));
    expect(XP_BREAKPOINTS.tablet).toBe(Number.parseFloat(XP_TOKENS['bp-tablet']));
    expect(XP_BREAKPOINTS.desktop).toBe(Number.parseFloat(XP_TOKENS['bp-desktop']));
  });

  it('gold thương hiệu không mang nghĩa success/warning/error', () => {
    // Quy tắc Wave 1A: trạng thái nghiệp vụ phải đọc được mà không dựa vào sắc thương hiệu.
    const brand = [
      XP_TOKENS['color-primary'],
      XP_TOKENS['color-primary-hover'],
      XP_TOKENS['color-primary-active'],
    ];
    for (const status of ['color-success', 'color-warning', 'color-error', 'color-info'] as const) {
      expect(brand, `${status} trùng màu thương hiệu`).not.toContain(XP_TOKENS[status]);
    }
  });

  it('AntD dẫn xuất được token từ seed mà không lỗi', () => {
    const derived = theme.getDesignToken(antdTheme);
    // `colorTextDisabled` cố tình KHÔNG set tay: nó phải sinh ra từ `colorTextBase`.
    expect(derived.colorTextDisabled).toBeTruthy();
    expect(derived.colorPrimary).toBe(XP_TOKENS['color-primary']);
    expect(derived.controlHeight).toBe(32);
  });

  /**
   * Tương phản màu. Brief 00 §16 ghi mức tuân thủ WCAG là `Unknown` (câu hỏi mở Q7) và
   * "contrast ratios unverified" là khoảng trống đã biết — nên test này KHÔNG ép AA lên
   * toàn bộ bảng màu (làm vậy là tự quyết thay thiết kế). Nó chốt con số ĐANG CÓ để một
   * lần đổi token sau này không âm thầm làm tệ đi.
   */
  describe('tương phản', () => {
    const contrast = contrastRatio;

    it.each([
      ['text trên nền trang', 'color-bg', 'color-text', 4.5],
      ['text trên container', 'color-bg-container', 'color-text', 4.5],
      ['text-secondary trên nền trang', 'color-bg', 'color-text-secondary', 4.5],
      ['text-secondary trên container', 'color-bg-container', 'color-text-secondary', 4.5],
      ['chữ trên nút primary', 'color-primary', 'color-primary-contrast', 4.5],
      ['chữ trên sidebar tối', 'shell-sidebar-bg', 'shell-sidebar-text', 4.5],
      ['mục active trên sidebar tối', 'shell-sidebar-bg', 'shell-sidebar-active', 4.5],
    ] as const)('%s đạt AA', (_label, bg, fg, min) => {
      expect(contrast(XP_TOKENS[bg], XP_TOKENS[fg])).toBeGreaterThanOrEqual(min);
    });

    /**
     * Các cặp CHƯA đạt AA, đã đo và ghi nhận (xem 08_DECISION_BACKLOG.md P18).
     * `color-text-tertiary` vốn đã trượt từ trước Wave 1A (bản cũ 2.99). Ngưỡng dưới ở đây
     * là chốt chặn: giảm thêm là test đỏ.
     */
    it.each([
      ['text-tertiary trên nền trang', 'color-bg', 'color-text-tertiary', 2.7],
      ['warning trên warning-bg', 'color-warning-bg', 'color-warning', 2.8],
      ['success trên success-bg', 'color-success-bg', 'color-success', 3.1],
      ['error trên error-bg', 'color-error-bg', 'color-error', 4.4],
    ] as const)('%s giữ nguyên mức đã ghi nhận (chưa đạt AA)', (_label, bg, fg, floor) => {
      const value = contrast(XP_TOKENS[bg], XP_TOKENS[fg]);
      expect(value).toBeGreaterThanOrEqual(floor);
      expect(value, 'nếu cặp này đã đạt AA thì chuyển sang nhóm trên').toBeLessThan(4.5);
    });

    /**
     * Bốn bậc trạng thái của sidebar tối là giá trị DẪN XUẤT bằng `color-mix`, không phải màu
     * đọc từ Figma — nên tỉ lệ trộn là một lựa chọn, và lựa chọn đó phải được ĐO chứ không
     * ước lượng. Đây là chỗ đo.
     *
     * Có thật một cái bẫy ở đây: bộ token nền sáng KHÔNG dùng lại được trên nền tối.
     * `--xp-color-text-secondary` chỉ đạt 2.99 và `--xp-gold-deep` 4.33 trên
     * `--xp-shell-sidebar-bg` — cả hai từng là màu chữ menu trước Wave 1D-B.
     */
    describe('sidebar tối — bậc trạng thái dẫn xuất', () => {
      /** Giải `color-mix(in srgb, <token> N%, <token>)` ra hex để đo được. */
      function resolveMix(value: string): string {
        const match = value.match(
          /^color-mix\(in srgb, var\(--xp-([a-z0-9-]+)\) (\d+)%, var\(--xp-([a-z0-9-]+)\)\)$/,
        );
        if (!match) throw new Error(`Không giải được color-mix: ${value}`);
        const [, fgKey, percent, bgKey] = match;
        const ratio = Number(percent) / 100;
        const fg = XP_TOKENS[fgKey as keyof typeof XP_TOKENS];
        const bg = XP_TOKENS[bgKey as keyof typeof XP_TOKENS];
        const channel = (hex: string, i: number) =>
          Number.parseInt(hex.replace('#', '').slice(i * 2, i * 2 + 2), 16);
        return `#${[0, 1, 2]
          .map((i) => Math.round(channel(fg, i) * ratio + channel(bg, i) * (1 - ratio)))
          .map((v) => v.toString(16).padStart(2, '0'))
          .join('')}`;
      }

      const BG = XP_TOKENS['shell-sidebar-bg'];
      const hover = resolveMix(XP_TOKENS['shell-sidebar-hover']);
      const selected = resolveMix(XP_TOKENS['shell-sidebar-selected-bg']);
      const muted = resolveMix(XP_TOKENS['shell-sidebar-muted']);

      it.each([
        ['nhãn nhóm (muted) trên nền sidebar', muted, BG],
        ['chữ mục menu trên nền hover', XP_TOKENS['shell-sidebar-text'], hover],
        ['chữ mục menu trên nền mục đang chọn', XP_TOKENS['shell-sidebar-text'], selected],
        ['icon gold trên nền mục đang chọn', XP_TOKENS['shell-sidebar-active'], selected],
        [
          'chữ huy hiệu vai trò trên nền gold',
          XP_TOKENS['color-primary-contrast'],
          XP_TOKENS['shell-sidebar-active'],
        ],
      ] as const)('%s đạt AA', (_label, fg, bg) => {
        expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
      });

      it('hai token nền SÁNG thật sự trượt trên nền tối — nên việc thay chúng là cần thiết', () => {
        expect(contrast(XP_TOKENS['color-text-secondary'], BG)).toBeLessThan(4.5);
        expect(contrast(XP_TOKENS['color-primary-active'], BG)).toBeLessThan(4.5);
      });

      it('nền hover và nền mục đang chọn phân biệt được với nhau', () => {
        expect(hover).not.toBe(selected);
        expect(contrast(selected, BG)).toBeGreaterThan(1);
      });
    });

    /**
     * Vỏ portal cũng có bề mặt SÁNG (topbar, thanh tab dưới đáy). Đo tương phản ở 1D-C phát
     * hiện ba cặp trượt AA tại đây — không phải trên nền tối như dự đoán.
     *
     * Bài học ghi lại kèm số: **gold không dùng làm màu CHỮ nhỏ trên nền sáng được.**
     * `--xp-gold-deep` chỉ đạt 3.97 trên trắng và 3.68 trên `--xp-gold-wash`. Nó hợp lệ khi
     * là NỀN (chữ `--xp-color-primary-contrast` lên trên: 6.60) hoặc khi là thành phần đồ hoạ
     * như vạch chỉ báo (ngưỡng 3:1).
     */
    describe('vỏ portal — bề mặt sáng', () => {
      const WHITE = XP_TOKENS['color-bg-container'];

      it.each([
        ['chữ tab thường trên thanh tab', 'color-text-secondary', WHITE],
        ['chữ tab đang chọn trên thanh tab', 'color-text', WHITE],
        ['chữ ô gian hàng trên nền gold', 'color-primary-contrast', XP_TOKENS['color-primary']],
        [
          'chữ huy hiệu vai trò trên nền gold',
          'color-primary-contrast',
          XP_TOKENS['color-primary'],
        ],
      ] as const)('%s đạt AA', (_label, fgKey, bg) => {
        expect(contrast(XP_TOKENS[fgKey], bg)).toBeGreaterThanOrEqual(4.5);
      });

      it('vạch chỉ báo tab đang chọn đạt ngưỡng 3:1 của thành phần đồ hoạ', () => {
        expect(contrast(XP_TOKENS['color-primary-active'], WHITE)).toBeGreaterThanOrEqual(3);
      });

      it('ba cặp bị THAY ở 1D-C thật sự trượt — nên việc thay là cần thiết', () => {
        // tab thường cũ: text-tertiary trên trắng
        expect(contrast(XP_TOKENS['color-text-tertiary'], WHITE)).toBeLessThan(4.5);
        // tab đang chọn cũ + ô gian hàng cũ: gold-deep trên trắng / trên gold-wash
        expect(contrast(XP_TOKENS['color-primary-active'], WHITE)).toBeLessThan(4.5);
        expect(
          contrast(XP_TOKENS['color-primary-active'], XP_TOKENS['color-primary-light']),
        ).toBeLessThan(4.5);
      });
    });
  });

  /**
   * Ngoại lệ `components.Button` (Wave 1B batch 1B.0). Test này giữ hai điều: ngoại lệ vẫn
   * bám token, và lý do tồn tại của nó (tương phản) không âm thầm biến mất.
   */
  describe('ngoại lệ components.Button', () => {
    it('màu chữ nút primary lấy từ token, không hard code', () => {
      expect(antdTheme.components?.Button?.primaryColor).toBe(XP_TOKENS['color-primary-contrast']);
    });

    it('là ngoại lệ DUY NHẤT — không có override component nào khác', () => {
      expect(Object.keys(antdTheme.components ?? {})).toEqual(['Button']);
      expect(Object.keys(antdTheme.components?.Button ?? {})).toEqual(['primaryColor']);
    });

    it('mặc định của AntD (chữ trắng) thật sự trượt AA nên ngoại lệ là cần thiết', () => {
      const derived = theme.getDesignToken(antdTheme);
      // Nếu AntD đổi cách dẫn xuất và chữ trắng bỗng đạt chuẩn, ngoại lệ này nên được gỡ.
      expect(
        contrastRatio(XP_TOKENS['color-primary'], String(derived.colorTextLightSolid)),
      ).toBeLessThan(4.5);
      expect(
        contrastRatio(XP_TOKENS['color-primary'], XP_TOKENS['color-primary-contrast']),
      ).toBeGreaterThanOrEqual(4.5);
    });
  });

  it('antdTheme lấy giá trị từ XP_TOKENS, không hard code', () => {
    const token = antdTheme.token ?? {};
    expect(token.colorPrimary).toBe(XP_TOKENS['color-primary']);
    expect(token.colorError).toBe(XP_TOKENS['color-error']);
    expect(token.colorBgLayout).toBe(XP_TOKENS['color-bg']);
    expect(token.colorBorder).toBe(XP_TOKENS['color-border']);
    expect(token.boxShadow).toBe(XP_TOKENS['shadow-card']);
    expect(token.fontSizeHeading1).toBe(Number.parseFloat(XP_TOKENS['font-size-h1']));
    // Tầng overlay: một con số duy nhất cho cả AntD lẫn CSS Module.
    expect(String(token.zIndexPopupBase)).toBe(XP_TOKENS['z-popup-base']);
  });
});
