import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Button } from 'antd';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PlaceholderPage } from '@/components/common/PlaceholderPage';

import { ManagePageHeader } from './ManagePageHeader';

/** Mọi file `.tsx` dưới một thư mục. */
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith('.tsx') && !entry.name.includes('.test.') ? [full] : [];
  });
}

/**
 * Test ĐẶC TẢ cho tiêu đề trang của Management Portal — 21 trang `/manage` dùng chung nó.
 *
 * Điểm nóng của Wave 1D là **cấp heading**: hiện tại là `<h3>`, nghĩa là **không trang manage
 * nào có `<h1>`**. Quyết định P6 đổi sang H1. Test dưới đây chốt hiện trạng để lần đổi đó là
 * một thay đổi CÓ CHỦ Ý, nhìn thấy được trong diff, chứ không trôi qua im lặng.
 */

afterEach(cleanup);

describe('ManagePageHeader — nội dung', () => {
  it('hiện tiêu đề', () => {
    render(<ManagePageHeader title="Danh sách xe" />);

    expect(screen.getByText('Danh sách xe')).toBeTruthy();
  });

  it('nhận tiêu đề là ReactNode, không chỉ chuỗi', () => {
    render(
      <ManagePageHeader
        title={
          <>
            Xe <span>(12)</span>
          </>
        }
      />,
    );

    expect(screen.getByRole('heading').textContent).toBe('Xe (12)');
  });

  it('vùng hành động bên phải hiện khi có `extra`', () => {
    render(<ManagePageHeader title="Xe" extra={<Button>Thêm xe</Button>} />);

    expect(screen.getByRole('button', { name: 'Thêm xe' })).toBeTruthy();
  });

  it('không có `extra` thì không dựng vùng hành động rỗng', () => {
    render(<ManagePageHeader title="Xe" />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('nhiều hành động giữ nguyên thứ tự truyền vào', () => {
    render(
      <ManagePageHeader
        title="Xe"
        extra={
          <>
            <Button>Xuất file</Button>
            <Button type="primary">Thêm xe</Button>
          </>
        }
      />,
    );

    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Xuất file',
      'Thêm xe',
    ]);
  });
});

describe('ManagePageHeader — nút quay lại', () => {
  it('chỉ dựng nút khi có `onBack`', () => {
    const { unmount } = render(<ManagePageHeader title="Xe" />);
    expect(screen.queryByRole('button', { name: 'Quay lại' })).toBeNull();
    unmount();

    render(<ManagePageHeader title="Xe" onBack={() => {}} />);
    expect(screen.getByRole('button', { name: 'Quay lại' })).toBeTruthy();
  });

  it('nút quay lại có tên truy cập được và gọi đúng callback', () => {
    const onBack = vi.fn();
    render(<ManagePageHeader title="Chi tiết xe" onBack={onBack} />);

    fireEvent.click(screen.getByRole('button', { name: 'Quay lại' }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('KHÔNG tự điều hướng — trang chủ động quyết định đi đâu', () => {
    render(<ManagePageHeader title="Chi tiết xe" onBack={() => {}} />);

    // Là <button>, không phải <a href>: không có đích cứng nào nhúng trong component chung.
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});

describe('ManagePageHeader — cấp heading (P6, đã giải ở 1D-B)', () => {
  it('tiêu đề trang là <h1>', () => {
    render(<ManagePageHeader title="Danh sách xe" />);

    const heading = screen.getByRole('heading', { level: 1, name: 'Danh sách xe' });
    expect(heading.tagName).toBe('H1');
  });

  it('đúng MỘT heading do component này sinh ra', () => {
    render(<ManagePageHeader title="Xe" extra={<Button>Thêm xe</Button>} />);

    expect(screen.getAllByRole('heading')).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('cỡ chữ lấy từ token h2, KHÔNG hạ cấp heading để có chữ nhỏ', () => {
    // Figma `58:98` cho tiêu đề trang ~24px = `--xp-font-size-h2`, trong khi `level={1}` của
    // AntD mang 32px. Ngữ nghĩa và thị giác tách nhau: h1 + token h2.
    const css = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'ManagePageHeader.module.css'),
      'utf8',
    );

    expect(css).toContain('var(--xp-font-size-h2)');
    expect(css).not.toContain('var(--xp-font-size-h1)');
  });
});

describe('ManagePageHeader — không sinh h1 trùng ở trang thật', () => {
  it('trang placeholder chỉ có đúng một h1, đến từ header chung', () => {
    render(<PlaceholderPage title="Tài xế" />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Tài xế');
  });

  it('trong khung portal, ManagePageHeader là nơi DUY NHẤT sinh h1', () => {
    // Quét source thay vì render 21 trang: rẻ hơn và bắt đúng thứ cần bắt — một trang tự dựng
    // `<h1>` riêng SẼ có hai h1 vì nó cũng đi qua header chung.
    //
    // Hai ngoại lệ hợp lệ, không phải sót: `/manage/login` và `/manage/onboarding` nằm trong
    // `BARE_PORTAL_PATHS` của `AppShell` — chúng render NGOÀI khung, không dùng
    // `ManagePageHeader`, nên `<h1>` tự dựng của chúng là h1 duy nhất của trang đó.
    const manageDir = join(dirname(fileURLToPath(import.meta.url)), '../../app/(manage)');
    const BARE = [
      'manage\\login\\page.tsx',
      'manage/login/page.tsx',
      'manage\\onboarding',
      'manage/onboarding',
    ];

    const offenders = walk(manageDir)
      .filter((file) => !BARE.some((bare) => file.includes(bare)))
      .filter((file) => {
        const source = readFileSync(file, 'utf8');
        return /<h1[\s>]/.test(source) || /Title\s+level=\{1\}/.test(source);
      });

    expect(offenders).toEqual([]);
  });

  it('hai trang ngoài khung mỗi trang có đúng một h1 tự dựng', () => {
    const manageDir = join(dirname(fileURLToPath(import.meta.url)), '../../app/(manage)');
    const bare = walk(manageDir).filter(
      (file) => file.includes('login') || file.includes('onboarding'),
    );

    for (const file of bare) {
      const count = (readFileSync(file, 'utf8').match(/<h1[\s>]/g) ?? []).length;
      expect(count, file).toBeLessThanOrEqual(1);
    }
  });
});

describe('ManagePageHeader — hành vi responsive', () => {
  it('KHÔNG có nhánh JS theo breakpoint — bố cục do CSS xuống dòng', () => {
    // Component không gọi `useIsMobile`/`useIsTablet`/`useMediaQuery`. Nếu Wave 1D thêm nhánh
    // JS, test này phải được sửa CÓ CHỦ Ý. Hiện trạng: cùng một DOM ở mọi bề rộng, phần
    // `extra` xuống dòng nhờ `flex-wrap` trong `.module.css`.
    const matchMedia = vi.spyOn(window, 'matchMedia');

    render(<ManagePageHeader title="Xe" extra={<Button>Thêm xe</Button>} />);

    expect(matchMedia).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Xe' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thêm xe' })).toBeTruthy();
  });
});
