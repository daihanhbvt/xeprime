import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ResponsiveDialog } from './ResponsiveDialog';
import { accessibleName, drawerWrapper } from './overlay-test-utils';

/**
 * Khoá hợp đồng của vỏ overlay tác vụ. Thứ đáng test không phải "có render không" mà là năm
 * điều dễ vỡ khi migrate 19 overlay: hình thái theo thiết bị, tên khả truy cập, các đường
 * đóng (và việc khoá chúng), lớp chặn gửi trùng, và trả focus.
 */
const media = vi.hoisted(() => ({ isMobile: false }));
vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => media.isMobile,
  useMediaQuery: () => media.isMobile,
}));

afterEach(() => {
  media.isMobile = false;
  cleanup();
});

function dialog() {
  return screen.getByRole('dialog');
}

function pressEscape() {
  fireEvent.keyDown(dialog(), { key: 'Escape', keyCode: 27 });
}

/**
 * Bấm nền của Modal. rc-dialog KHÔNG đóng theo `click`: nó ghi nhận `mouseDown` rồi kiểm
 * `mouseUp` cùng chỗ — để bôi đen chữ trong modal rồi thả chuột ra ngoài không làm đóng.
 * Test phải mô phỏng đủ chuỗi đó, nếu không sẽ "xanh giả" ở nhánh maskClosable={false}.
 */
function clickMask() {
  const wrap = document.querySelector('.ant-modal-wrap');
  if (!wrap) return;
  fireEvent.mouseDown(wrap);
  fireEvent.mouseUp(wrap);
  fireEvent.click(wrap);
}

/**
 * jsdom không chạy CSS transition, nên rc-motion không tự phát `afterClose` — mà đó chính là
 * lúc rc-dialog trả focus về trigger. Bắn tay sự kiện kết thúc chuyển động để chuỗi đóng
 * hoàn tất như trên trình duyệt thật.
 */
function finishCloseAnimation() {
  const modal = document.querySelector('.ant-modal');
  if (!modal) return;
  fireEvent.animationEnd(modal);
  fireEvent.transitionEnd(modal);
}

describe('ResponsiveDialog', () => {
  describe('hình thái theo thiết bị', () => {
    it('desktop render Modal', () => {
      render(
        <ResponsiveDialog open title="Tiêu đề" onClose={vi.fn()}>
          <p>Nội dung</p>
        </ResponsiveDialog>,
      );
      expect(document.querySelector('.ant-modal')).not.toBeNull();
      expect(document.querySelector('.ant-drawer')).toBeNull();
    });

    it('mobile render Drawer neo đáy', () => {
      media.isMobile = true;
      render(
        <ResponsiveDialog open title="Tiêu đề" onClose={vi.fn()}>
          <p>Nội dung</p>
        </ResponsiveDialog>,
      );
      expect(document.querySelector('.ant-drawer')).not.toBeNull();
      expect(document.querySelector('.ant-modal')).toBeNull();
      expect(document.querySelector('.ant-drawer-bottom')).not.toBeNull();
    });

    it('bề rộng desktop lấy từ token modal, không phải số trần', () => {
      const { rerender } = render(
        <ResponsiveDialog open title="T" size="sm" onClose={vi.fn()}>
          <p>N</p>
        </ResponsiveDialog>,
      );
      expect(document.querySelector<HTMLElement>('.ant-modal')?.style.width).toBe('400px');

      rerender(
        <ResponsiveDialog open title="T" size="lg" onClose={vi.fn()}>
          <p>N</p>
        </ResponsiveDialog>,
      );
      expect(document.querySelector<HTMLElement>('.ant-modal')?.style.width).toBe('720px');
    });

    it('size sm → bottom sheet trần 85dvh trên mobile (Figma quy tắc 1)', () => {
      media.isMobile = true;
      render(
        <ResponsiveDialog open title="Xác nhận" size="sm" onClose={vi.fn()}>
          <p>Nội dung</p>
        </ResponsiveDialog>,
      );
      expect(drawerWrapper()?.style.maxHeight).toBe('85dvh');
    });

    it('size md → toàn màn hình trên mobile (Figma quy tắc 2/5, chỗ cho bàn phím)', () => {
      media.isMobile = true;
      render(
        <ResponsiveDialog open title="Biểu mẫu" size="md" onClose={vi.fn()}>
          <p>Nội dung</p>
        </ResponsiveDialog>,
      );
      expect(drawerWrapper()?.style.maxHeight).toBe('');
      expect(drawerWrapper()?.style.height).toBe('100%');
    });

    it('mobileMode ghi đè mặc định theo size', () => {
      media.isMobile = true;
      render(
        <ResponsiveDialog open title="Xác nhận xoá" size="lg" mobileMode="sheet" onClose={vi.fn()}>
          <p>Nội dung</p>
        </ResponsiveDialog>,
      );
      expect(drawerWrapper()?.style.maxHeight).toBe('85dvh');
    });
  });

  describe('tên khả truy cập', () => {
    it('tiêu đề chuỗi trở thành tên của dialog', () => {
      render(
        <ResponsiveDialog open title="Ghi nhận thanh toán" onClose={vi.fn()}>
          <p>Nội dung</p>
        </ResponsiveDialog>,
      );
      expect(accessibleName(dialog())).toBe('Ghi nhận thanh toán');
    });

    it('ẩn tiêu đề header vẫn có tên (qua tiêu đề chỉ-đọc-màn-hình)', () => {
      render(
        <ResponsiveDialog open hideHeaderTitle ariaLabel="Đăng nhập XePrime" onClose={vi.fn()}>
          <p>Nội dung</p>
        </ResponsiveDialog>,
      );
      expect(accessibleName(dialog())).toBe('Đăng nhập XePrime');
    });

    it('mobile cũng giữ tên khả truy cập', () => {
      media.isMobile = true;
      render(
        <ResponsiveDialog open title="Bộ lọc" onClose={vi.fn()}>
          <p>Nội dung</p>
        </ResponsiveDialog>,
      );
      expect(accessibleName(dialog())).toBe('Bộ lọc');
    });
  });

  describe('đường đóng — bật/tắt được', () => {
    it('nút đóng gọi onClose', () => {
      const onClose = vi.fn();
      render(
        <ResponsiveDialog open title="Tiêu đề" onClose={onClose}>
          <p>Nội dung</p>
        </ResponsiveDialog>,
      );
      fireEvent.click(within(dialog()).getByRole('button', { name: 'Close' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('Esc đóng theo mặc định', () => {
      const onClose = vi.fn();
      render(
        <ResponsiveDialog open title="Tiêu đề" onClose={onClose}>
          <p>Nội dung</p>
        </ResponsiveDialog>,
      );
      pressEscape();
      expect(onClose).toHaveBeenCalled();
    });

    it('closeOnEsc={false} thì Esc không đóng', () => {
      const onClose = vi.fn();
      render(
        <ResponsiveDialog open title="Tiêu đề" closeOnEsc={false} onClose={onClose}>
          <p>Nội dung</p>
        </ResponsiveDialog>,
      );
      pressEscape();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('bấm nền đóng theo mặc định', () => {
      const onClose = vi.fn();
      render(
        <ResponsiveDialog open title="Tiêu đề" onClose={onClose}>
          <p>Nội dung</p>
        </ResponsiveDialog>,
      );
      clickMask();
      expect(onClose).toHaveBeenCalled();
    });

    it('maskClosable={false} thì bấm nền không đóng', () => {
      const onClose = vi.fn();
      render(
        <ResponsiveDialog open title="Tiêu đề" maskClosable={false} onClose={onClose}>
          <p>Nội dung</p>
        </ResponsiveDialog>,
      );
      clickMask();
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('chống gửi trùng khi đang gửi', () => {
    it('Esc bị khoá dù closeOnEsc mặc định bật', () => {
      const onClose = vi.fn();
      render(
        <ResponsiveDialog open title="Tiêu đề" confirmLoading onOk={vi.fn()} onClose={onClose}>
          <p>Nội dung</p>
        </ResponsiveDialog>,
      );
      pressEscape();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('bấm nền bị khoá dù maskClosable mặc định bật', () => {
      const onClose = vi.fn();
      render(
        <ResponsiveDialog open title="Tiêu đề" confirmLoading onOk={vi.fn()} onClose={onClose}>
          <p>Nội dung</p>
        </ResponsiveDialog>,
      );
      clickMask();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('nút chính vào loading và click thứ hai không gọi onOk', () => {
      const onOk = vi.fn();
      render(
        <ResponsiveDialog open title="Tiêu đề" confirmLoading onOk={onOk} onClose={vi.fn()}>
          <p>Nội dung</p>
        </ResponsiveDialog>,
      );
      const ok = screen.getByRole('button', { name: /Xác nhận/ });
      expect(ok.className).toContain('ant-btn-loading');
      fireEvent.click(ok);
      expect(onOk).not.toHaveBeenCalled();
    });

    it('nút Huỷ bị vô hiệu khi đang gửi', () => {
      render(
        <ResponsiveDialog open title="Tiêu đề" confirmLoading onOk={vi.fn()} onClose={vi.fn()}>
          <p>Nội dung</p>
        </ResponsiveDialog>,
      );
      expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Huỷ' }).disabled).toBe(true);
    });
  });

  describe('footer', () => {
    it('dựng footer mặc định từ onOk', () => {
      const onOk = vi.fn();
      render(
        <ResponsiveDialog open title="Tiêu đề" onOk={onOk} okText="Lưu" onClose={vi.fn()}>
          <p>Nội dung</p>
        </ResponsiveDialog>,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
      expect(onOk).toHaveBeenCalledTimes(1);
    });

    it('destructive dùng sắc nguy hiểm của AntD, không phải màu tự đặt', () => {
      render(
        <ResponsiveDialog
          open
          title="Xoá xe"
          destructive
          onOk={vi.fn()}
          okText="Xoá"
          onClose={vi.fn()}
        >
          <p>Nội dung</p>
        </ResponsiveDialog>,
      );
      const ok = screen.getByRole('button', { name: 'Xoá' });
      expect(ok.className).toContain('ant-btn-dangerous');
      // Không có style màu inline: màu đến từ token qua theme.
      expect(ok.getAttribute('style')).toBeNull();
    });

    it('okDisabled chặn hành động chính', () => {
      render(
        <ResponsiveDialog open title="T" okDisabled onOk={vi.fn()} onClose={vi.fn()}>
          <p>N</p>
        </ResponsiveDialog>,
      );
      expect(screen.getByRole<HTMLButtonElement>('button', { name: /Xác nhận/ }).disabled).toBe(
        true,
      );
    });

    it('footer={null} không dựng hành động nào', () => {
      render(
        <ResponsiveDialog open title="Tiêu đề" footer={null} onClose={vi.fn()}>
          <p>Nội dung</p>
        </ResponsiveDialog>,
      );
      expect(screen.queryByRole('button', { name: 'Huỷ' })).toBeNull();
    });

    it('footer tuỳ biến thắng footer mặc định', () => {
      render(
        <ResponsiveDialog
          open
          title="Tiêu đề"
          onOk={vi.fn()}
          footer={<button type="button">Hành động riêng</button>}
          onClose={vi.fn()}
        >
          <p>Nội dung</p>
        </ResponsiveDialog>,
      );
      expect(screen.getByRole('button', { name: 'Hành động riêng' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Xác nhận' })).toBeNull();
    });
  });

  /**
   * Trả focus về nút đã mở overlay. Đây là hành vi của rc-dialog (không tự dựng focus trap),
   * nhưng nếu một lần refactor làm mất nó thì bàn phím sẽ nhảy về đầu trang — vẫn phải khoá.
   */
  it('trả focus về phần tử đã mở sau khi đóng', async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Mở
          </button>
          <ResponsiveDialog open={open} title="Tiêu đề" onClose={() => setOpen(false)}>
            <p>Nội dung</p>
          </ResponsiveDialog>
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Mở' });
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    await screen.findByRole('dialog');

    // jsdom không tự chuyển focus vào overlay như trình duyệt thật, nên mô phỏng việc người
    // dùng tab vào trong. Điều đang kiểm là **khôi phục** focus, không phải cách focus vào.
    const closeButton = within(dialog()).getByRole('button', { name: 'Close' });
    closeButton.focus();
    expect(dialog().contains(document.activeElement)).toBe(true);

    fireEvent.click(closeButton);
    // Bắn lặp: React phải flush `open=false` trước thì sự kiện kết thúc chuyển động mới có tác dụng.
    await waitFor(
      () => {
        finishCloseAnimation();
        expect(document.activeElement).toBe(trigger);
      },
      { timeout: 3000 },
    );
  });

  /**
   * Chưa mở thì KHÔNG dựng DOM của overlay. Vừa tránh rò nội dung, vừa là lý do nhánh
   * desktop/mobile không gây lệch hydrate (xem docstring của component).
   */
  it('chưa mở thì không render nội dung ở cả hai nhánh thiết bị', () => {
    const { unmount } = render(
      <ResponsiveDialog open={false} title="Tiêu đề" onClose={vi.fn()}>
        <p>Nội dung bí mật</p>
      </ResponsiveDialog>,
    );
    expect(screen.queryByText('Nội dung bí mật')).toBeNull();
    expect(document.querySelector('.ant-modal')).toBeNull();
    unmount();

    media.isMobile = true;
    render(
      <ResponsiveDialog open={false} title="Tiêu đề" onClose={vi.fn()}>
        <p>Nội dung bí mật</p>
      </ResponsiveDialog>,
    );
    expect(screen.queryByText('Nội dung bí mật')).toBeNull();
    expect(document.querySelector('.ant-drawer')).toBeNull();
  });
});
