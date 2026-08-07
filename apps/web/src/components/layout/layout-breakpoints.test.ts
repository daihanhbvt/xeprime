import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { XP_BREAKPOINTS } from '@/styles/theme';

/**
 * Kiểm kê breakpoint của các component vỏ portal.
 *
 * Quy tắc dự án: `.module.css` PHẢI gãy ở đúng ba con số của `XP_BREAKPOINTS` (640 · 1024 ·
 * 1440) — CSS không dùng được custom property trong `@media`, nên số là thứ duy nhất phải
 * gõ tay, và gõ lệch thì CSS với JS gãy ở hai chỗ khác nhau.
 *
 * Hiện trạng của vỏ portal: **cả bốn file đều gãy ở 992px** (giá trị `lg` của Ant Design),
 * trong khi `useIsDesktop()` đòi ≥1025px. Dải **993–1024px** vì thế mâu thuẫn: CSS đã coi là
 * desktop và hiện sidebar, JS vẫn coi là tablet.
 *
 * Test này CHỐT HIỆN TRẠNG, không phải phê duyệt nó. Batch 1D-B đổi 992 → 1024 và phải sửa
 * test này cùng lúc — đó chính là mục đích: con số không được trôi đi im lặng.
 */

const SHELL_STYLESHEETS = [
  'AppShell.module.css',
  'Sidebar.module.css',
  'Topbar.module.css',
  'MobileNav.module.css',
] as const;

/** Phần vỏ mà Batch 1D-B dựng lại. `MobileNav` thuộc 1D-C. */
const DESKTOP_SHELL_STYLESHEETS = [
  'AppShell.module.css',
  'Sidebar.module.css',
  'Topbar.module.css',
  'ManageMenu.module.css',
  'ManageUserCard.module.css',
] as const;

/** Ranh giới cũ, kế thừa từ token `lg` của Ant Design. Đã gỡ ở Batch 1D-C. */
const LEGACY_BOUNDARY = 992;

/**
 * Đọc stylesheet dưới dạng VĂN BẢN.
 *
 * Phải ghép đường dẫn bằng `node:path` chứ không dùng `new URL('./x.css', import.meta.url)`:
 * Vite nhận diện dạng sau là import asset và trả lỗi "?url is not supported with CSS modules".
 */
const HERE = dirname(fileURLToPath(import.meta.url));

function read(file: string): string {
  return readFileSync(join(HERE, file), 'utf8');
}

/**
 * Chỉ phần CODE của stylesheet, đã bỏ comment.
 *
 * Cần thiết vì các comment ở đây CỐ Ý nhắc lại giá trị đã gỡ ("trước đây là 992px",
 * "`rgba(120, 88, 20, 0.06)` đã gỡ") để người đọc sau hiểu vì sao. Khẳng định "không còn X"
 * mà quét cả comment thì chính lời giải thích lại làm test đỏ.
 */
function readCode(file: string): string {
  return read(file).replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Mọi con số xuất hiện trong `@media (... : Npx)` của một stylesheet. */
function mediaWidths(css: string): number[] {
  return [...css.matchAll(/@media[^{]*?(?:min|max)-width:\s*(\d+)px/g)].map((m) => Number(m[1]));
}

describe('vỏ portal — kiểm kê breakpoint', () => {
  it('thang chính tắc là 640 / 1024 / 1440', () => {
    expect(XP_BREAKPOINTS).toEqual({ mobile: 640, tablet: 1024, desktop: 1440 });
  });

  it('cả bốn stylesheet vỏ gãy ở ranh chính tắc 1024px', () => {
    // Đảo có chủ ý ở 1D-C. Trước đó cả bốn file gãy ở 992 (token `lg` của AntD).
    for (const file of SHELL_STYLESHEETS) {
      expect(mediaWidths(read(file)), file).toContain(XP_BREAKPOINTS.tablet);
      expect(mediaWidths(read(file)), file).not.toContain(LEGACY_BOUNDARY);
    }
  });

  it('1024px là ranh DUY NHẤT của vỏ — không còn giá trị lạ nào', () => {
    const all = SHELL_STYLESHEETS.flatMap((file) => mediaWidths(read(file)));
    expect(new Set(all)).toEqual(new Set([XP_BREAKPOINTS.tablet]));
  });

  it('CSS và JS nay gãy ở CÙNG một chỗ — dải 993–1024px hết mâu thuẫn', () => {
    // CSS `max-width: 1024px` ⇒ tablet/mobile. JS `useIsDesktop()` = ≥1025 ⇒ desktop.
    // Hai vế bù khít nhau: 1024 thuộc về mobile ở cả hai hệ, 1025 thuộc desktop ở cả hai.
    const cssBoundary = [...new Set(SHELL_STYLESHEETS.flatMap((f) => mediaWidths(read(f))))][0];

    expect(cssBoundary).toBe(XP_BREAKPOINTS.tablet);
    // Không còn khoảng hở nào giữa "CSS coi là mobile" và "JS coi là desktop".
    expect((cssBoundary as number) + 1).toBe(XP_BREAKPOINTS.tablet + 1);
  });

  it('vỏ KHÔNG còn tham chiếu 992 trong code', () => {
    for (const file of SHELL_STYLESHEETS) {
      expect(readCode(file), file).not.toContain('992');
    }
  });

  it('vỏ portal không dùng breakpoint theo chiều cao hay theo hướng màn', () => {
    for (const file of SHELL_STYLESHEETS) {
      const css = read(file);
      expect(css, file).not.toMatch(/@media[^{]*height/);
      expect(css, file).not.toMatch(/@media[^{]*orientation/);
    }
  });
});

/**
 * Bảo vệ chống lại lỗi ĐÃ XẢY RA THẬT: mục menu tàng hình trên sidebar tối.
 *
 * AntD 6 sinh CSS dạng `:where(.css-<hash>).ant-menu-light .ant-menu-item { … }`. `:where()`
 * làm phần hash có độ đặc hiệu **0**, nên luật của AntD chỉ (0,2,0) — hoặc (0,1,0) với
 * `.ant-btn` / `.ant-avatar`. Ghi đè bằng MỘT class CSS Module là HOÀ, và hoà thì thứ tự chèn
 * quyết định: AntD chèn `<style>` vào `<head>` lúc chạy, tức luôn sau file CSS Module ⇒ AntD
 * thắng, override của ta thành vô hiệu **mà không có lỗi nào báo ra**.
 *
 * Triệu chứng đã gặp: chữ mục menu đen trên nền `#1e1b16`, nút thu gọn tàng hình, hamburger
 * hiện cả trên desktop.
 *
 * Luật: mọi override nhắm vào class của AntD phải có **ít nhất hai class** trong selector.
 */
describe('vỏ portal — override AntD phải thắng được về độ đặc hiệu', () => {
  const ANTD_TARGETS = /\.(ant-menu|ant-btn|ant-avatar|ant-drawer)[a-z-]*/;

  /** Đếm số class trong một selector (đủ dùng cho bộ selector đơn giản của vỏ). */
  function classCount(selector: string): number {
    return (selector.match(/\.[a-zA-Z][\w-]*/g) ?? []).length;
  }

  /** Các selector (đã bỏ comment) nhắm vào class AntD. */
  function antdSelectors(file: string): string[] {
    return readCode(file)
      .split('}')
      .map((block) => block.split('{')[0]?.trim() ?? '')
      .filter(Boolean)
      .flatMap((sel) => sel.split(','))
      .map((sel) => sel.trim())
      .filter((sel) => ANTD_TARGETS.test(sel));
  }

  it.each([...DESKTOP_SHELL_STYLESHEETS, 'MobileNav.module.css'])(
    '%s: không override AntD bằng một class đơn',
    (file) => {
      for (const selector of antdSelectors(file)) {
        expect(classCount(selector), `${file} → ${selector}`).toBeGreaterThanOrEqual(2);
      }
    },
  );

  it('override menu bám vào chính lớp `.ant-menu-root.ant-menu-light` của AntD', () => {
    // Đây là thứ nâng luật của ta lên (0,4,0), trên luật (0,2,0) của AntD.
    const code = readCode('ManageMenu.module.css');
    const menuRules = code
      .split('}')
      .map((b) => b.split('{')[0]?.trim() ?? '')
      .filter((sel) => /\.ant-menu-item/.test(sel));

    expect(menuRules.length).toBeGreaterThan(0);
    for (const selector of menuRules) {
      expect(selector, selector).toContain('.ant-menu-root.ant-menu-light');
    }
  });
});

describe('vỏ portal — vùng an toàn và kích thước lấy từ token', () => {
  it('thanh tab dưới đáy chừa safe-area của iOS', () => {
    expect(read('MobileNav.module.css')).toContain('env(safe-area-inset-bottom');
  });

  it('vùng nội dung chừa chỗ cho thanh tab cố định', () => {
    // Nếu không chừa, dòng cuối của mọi bảng bị thanh tab che (navigation-audit `134:3810`).
    expect(read('AppShell.module.css')).toMatch(/@media[\s\S]*?\.content[\s\S]*?padding/);
  });

  it('bề rộng sidebar lấy từ token, không gõ số trong CSS', () => {
    const css = read('Sidebar.module.css');

    expect(css).toContain('var(--xp-shell-sidebar-width)');
    // Neo đầu dòng: `max-width: 992px` trong `@media` là chuyện khác, đã kiểm ở trên.
    expect(css).not.toMatch(/^\s*width:\s*\d+px/m);
  });

  it('chiều cao topbar lấy từ token', () => {
    expect(read('Topbar.module.css')).toContain('var(--xp-shell-topbar-height)');
  });

  it('sidebar thu gọn dùng token 64px, không gõ số', () => {
    // Đảo có chủ ý ở 1D-B: token `--xp-shell-sidebar-collapsed-width` có từ Wave 1A nhưng
    // tới batch này mới có người dùng. Figma xác nhận 64px ở CẢ hai nguồn (`14:1532`, `47:77`).
    expect(read('Sidebar.module.css')).toContain('var(--xp-shell-sidebar-collapsed-width)');
  });

  it('vỏ desktop dùng token semantic, không nhúng mã màu Figma', () => {
    expect(read('Sidebar.module.css')).toContain('var(--xp-shell-sidebar-bg)');

    for (const file of DESKTOP_SHELL_STYLESHEETS) {
      expect(readCode(file), file).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(readCode(file), file).not.toMatch(/\brgba?\(/);
    }
  });

  it('`MobileNav` không còn màu thô (D16.5 đã gỡ ở 1D-C)', () => {
    // `rgba(120, 88, 20, 0.06)` là đổ bóng hướng XUỐNG trên một thanh nằm sát đáy viewport —
    // không nhìn thấy được. Gỡ hẳn thay vì thay bằng token bóng (bộ token chỉ có bóng xuống);
    // `border-top` đã tách thanh khỏi nội dung.
    expect(readCode('MobileNav.module.css')).not.toMatch(/\brgba?\(/);
    expect(readCode('MobileNav.module.css')).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('chiều cao thanh tab và bề rộng drawer lấy từ token đọc từ Figma', () => {
    const css = read('MobileNav.module.css');

    expect(css).toContain('var(--xp-shell-bottom-nav-height)'); // 14:1641 = 64px
    expect(css).toContain('var(--xp-shell-drawer-width)'); // 14:1662 = 280px
    // Số 68 gõ tay ở `AppShell` (chừa chỗ cho thanh tab) đã thay bằng chính token đó.
    expect(read('AppShell.module.css')).toContain('var(--xp-shell-bottom-nav-height)');
    expect(read('AppShell.module.css')).not.toContain('68px');
  });
});
