import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IntlTestProvider } from '@/i18n/test-utils';
import { LocaleSwitcher } from './LocaleSwitcher';

const mocks = vi.hoisted(() => ({
  setLocale: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('@/i18n/actions', () => ({ setLocale: mocks.setLocale }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: mocks.push, replace: mocks.replace }),
}));

const START_URL = '/search?provinceCode=79&serviceType=self_drive#results';

beforeEach(() => {
  mocks.setLocale.mockReset();
  mocks.setLocale.mockResolvedValue({ ok: true, locale: 'en' });
  mocks.refresh.mockClear();
  mocks.push.mockClear();
  mocks.replace.mockClear();
  window.history.replaceState(null, '', START_URL);
});

/**
 * `vitest.setup.tsx` đã bọc mọi `render` bằng provider TIẾNG VIỆT. Ở đây cần chọn ngôn ngữ
 * theo từng bài, nên truyền provider riêng — nó lồng bên trong provider mặc định và thắng,
 * vì `useLocale` đọc context gần nhất.
 */
function renderSwitcher(locale: 'vi' | 'en' = 'vi') {
  return render(
    <IntlTestProvider locale={locale}>
      <LocaleSwitcher />
    </IntlTestProvider>,
  );
}

const triggerName = /Đổi ngôn ngữ giao diện|Change interface language/;

async function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: triggerName }));
  return screen.findByRole('menu');
}

describe('LocaleSwitcher — hiển thị', () => {
  it('hiện mã ngôn ngữ đang dùng và nêu tên đầy đủ trong nhãn khả truy cập', () => {
    renderSwitcher('vi');
    const trigger = screen.getByRole('button', { name: triggerName });
    expect(trigger.textContent).toContain('VI');
    expect(trigger.getAttribute('aria-label')).toContain('Tiếng Việt');
  });

  it('ở tiếng Anh thì chính bộ chuyển cũng nói tiếng Anh', () => {
    renderSwitcher('en');
    const trigger = screen.getByRole('button', { name: /Change interface language/ });
    expect(trigger.textContent).toContain('EN');
  });

  it('có mặt khi CHƯA đăng nhập — không nằm sau một cổng đăng nhập nào', () => {
    // Component không nhận `user` và không gọi hook auth nào. Nếu ai đó thêm cổng đăng nhập
    // vào đây, render này sẽ nổ vì thiếu provider — đó chính là tín hiệu cần.
    renderSwitcher('vi');
    expect(screen.getByRole('button', { name: triggerName })).toBeTruthy();
  });

  it('liệt kê đúng hai ngôn ngữ và đánh dấu ngôn ngữ đang dùng', async () => {
    renderSwitcher('vi');
    const menu = await openMenu();
    const items = within(menu).getAllByRole('menuitem');

    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain('Tiếng Việt');
    expect(items[1]?.textContent).toContain('English');
    // AntD đánh dấu mục đang chọn qua `selectedKeys`.
    expect(items[0]?.className).toContain('selected');
    expect(items[1]?.className).not.toContain('selected');
  });
});

describe('LocaleSwitcher — đổi ngôn ngữ', () => {
  it('gọi Server Action rồi MỚI router.refresh(); không điều hướng', async () => {
    renderSwitcher('vi');
    const menu = await openMenu();
    fireEvent.click(within(menu).getByText('English'));

    await waitFor(() => expect(mocks.setLocale).toHaveBeenCalledWith('en'));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('KHÔNG làm mới khi Server Action từ chối — tránh render lại bằng ngôn ngữ cũ', async () => {
    mocks.setLocale.mockResolvedValue({ ok: false, locale: null });
    renderSwitcher('vi');
    const menu = await openMenu();
    fireEvent.click(within(menu).getByText('English'));

    await waitFor(() => expect(mocks.setLocale).toHaveBeenCalled());
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('giữ NGUYÊN đường dẫn, query và hash — trạng thái tìm kiếm không mất', async () => {
    renderSwitcher('vi');
    const menu = await openMenu();
    fireEvent.click(within(menu).getByText('English'));

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe(
      START_URL,
    );
  });

  it('không thêm entry lịch sử — nút Back vẫn về đúng trang trước', async () => {
    const lengthBefore = window.history.length;
    renderSwitcher('vi');
    const menu = await openMenu();
    fireEvent.click(within(menu).getByText('English'));

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(window.history.length).toBe(lengthBefore);
  });

  it('chọn lại ngôn ngữ ĐANG dùng thì không gọi gì cả', async () => {
    renderSwitcher('vi');
    const menu = await openMenu();
    fireEvent.click(within(menu).getByText('Tiếng Việt'));

    expect(mocks.setLocale).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  /**
   * Bàn phím: khẳng định trên CẤU TRÚC chứ không mô phỏng phím.
   *
   * Nút là `<button>` thật và không bị gỡ khỏi luồng Tab, nên trình duyệt tự biến Enter/Space
   * thành một sự kiện click — hành vi đó thuộc về nền tảng, không thuộc về component. jsdom
   * KHÔNG dựng lại phép chuyển đó, nên bắn `keyDown` ở đây chỉ kiểm tra jsdom chứ không kiểm
   * tra sản phẩm. Điều thật sự vỡ được là ai đó đổi nút thành `<div onClick>` hoặc thêm
   * `tabIndex={-1}` — và đó là thứ được khoá.
   */
  it('nút là <button> thật, vào được bằng Tab, và click mở menu', async () => {
    renderSwitcher('vi');
    const trigger = screen.getByRole('button', { name: triggerName });

    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger.getAttribute('tabindex')).not.toBe('-1');
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    expect(await screen.findByRole('menu')).toBeTruthy();
  });
});
