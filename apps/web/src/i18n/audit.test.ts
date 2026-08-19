import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { AUDIT_ALLOWLIST } from '../../scripts/i18n-audit-allowlist.mjs';

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * `i18n:audit` là thứ trả lời câu hỏi "còn bao nhiêu việc". Một bộ dò im lặng còn tệ hơn không
 * có bộ dò nào: nó biến "chưa dịch" thành "đã xong" trên giấy tờ.
 *
 * Nên test này chạy chính script đó và khoá hai hướng sai:
 *   - **Bỏ sót** — khu vực chưa i18n hoá phải bị nêu tên.
 *   - **Báo nhầm** — file đã chuyển sang `t(...)` phải biến mất khỏi báo cáo.
 *
 * Chạy script thật qua tiến trình con thay vì gọi hàm nội bộ: đó đúng là thứ CI chạy, kể cả
 * mã thoát.
 */
function runAudit(): { stdout: string; code: number } {
  try {
    const stdout = execFileSync(process.execPath, ['scripts/i18n-audit.mjs', '--verbose'], {
      cwd: WEB_ROOT,
      encoding: 'utf8',
    });
    return { stdout, code: 0 };
  } catch (error) {
    const err = error as { status: number; stdout: string };
    return { stdout: err.stdout, code: err.status };
  }
}

const audit = runAudit();

describe('i18n:audit — dò được chuỗi giao diện thô', () => {
  it('thoát khác 0 khi còn chuỗi chưa dịch (đúng là một cổng CI, không phải một bản in)', () => {
    // Ngày nào bộ này về 0 thì đổi khẳng định này thành `toBe(0)` — lúc đó nó khoá chiều ngược lại.
    expect(audit.code).toBe(1);
    expect(audit.stdout).toMatch(/i18n:audit — \d+ chuỗi nghi chưa dịch/);
  });

  it('nêu tên khu vực CHƯA i18n hoá', () => {
    // Cổng quản lý còn nguyên chuỗi tiếng Việt; nếu bộ dò im ở đây thì nó đang hỏng.
    expect(audit.stdout).toContain('vehicles —');
    expect(audit.stdout).toContain('booking-requests —');
  });

  it('phân loại được vị trí, không chỉ nói "có chữ tiếng Việt"', () => {
    // Lượt quét theo VỊ TRÍ là thứ bắt được cả chuỗi không dấu; mất nó là mất nửa giá trị.
    for (const kind of ['[jsx-text]', '[jsx-prop:', '[prop:']) {
      expect(audit.stdout).toContain(kind);
    }
  });

  it.each([
    'src/features/marketplace/components/MarketHeader.tsx',
    'src/features/marketplace/components/MarketFooter.tsx',
    'src/features/marketplace/search/SearchCard.tsx',
    'src/features/marketplace/search/StickySearchBar.tsx',
    'src/features/marketplace/search/LocationPicker.tsx',
    'src/components/layout/Topbar.tsx',
    'src/constants/nav.ts',
    'src/app/(auth)/forgot-password/page.tsx',
  ])('file ĐÃ chuyển sang t(...) không còn bị nêu: %s', (file) => {
    expect(audit.stdout).not.toContain(file);
  });

  it('không báo nhầm chú thích, khoá kỹ thuật hay đường dẫn', () => {
    // Ba chuỗi này có mặt trong mã production nhưng không phải chữ cho người đọc.
    for (const technical of ['self_drive', 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY']) {
      expect(audit.stdout).not.toContain(`  ${technical}`);
    }
  });
});

describe('allowlist của i18n:audit', () => {
  it('mỗi ngoại lệ có LÝ DO viết ra thành câu', () => {
    for (const entry of AUDIT_ALLOWLIST) {
      expect(entry.text.trim().length).toBeGreaterThan(0);
      expect(entry.reason?.trim().length ?? 0).toBeGreaterThan(10);
    }
  });

  it('danh sách ngắn — nó dài ra nghĩa là bộ dò sai, không phải ngoại lệ nhiều', () => {
    expect(AUDIT_ALLOWLIST.length).toBeLessThanOrEqual(15);
  });

  it('chỉ chứa DANH TỪ RIÊNG, không chứa câu chữ giao diện', () => {
    for (const entry of AUDIT_ALLOWLIST) {
      // Một ngoại lệ nhiều hơn hai từ gần như chắc chắn là một câu chưa kịp dịch.
      expect(entry.text.split(/\s+/).length).toBeLessThanOrEqual(2);
      // Và không bao giờ được là chữ tiếng Việt có dấu.
      expect(entry.text).not.toMatch(/[àáảãạăâèéẻẽẹêìíỉĩịòóỏõọôơùúủũụưỳýỷỹỵđ]/i);
    }
  });
});
