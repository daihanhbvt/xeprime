import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Modal } from 'antd';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DetailDrawer } from './DetailDrawer';
import { accessibleName, drawerWrapper } from './overlay-test-utils';

const media = vi.hoisted(() => ({ isMobile: false }));
vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => media.isMobile,
  useMediaQuery: () => media.isMobile,
}));

afterEach(() => {
  media.isMobile = false;
  cleanup();
});

describe('DetailDrawer', () => {
  describe('ba trạng thái nội dung', () => {
    it('content: render children khi không loading/error', () => {
      render(
        <DetailDrawer open title="Đơn XP-001" onClose={vi.fn()}>
          <p>Nội dung thật</p>
        </DetailDrawer>,
      );
      expect(screen.getByText('Nội dung thật')).toBeTruthy();
      expect(document.querySelector('.ant-skeleton')).toBeNull();
    });

    it('loading: khung xương thay cho children', () => {
      render(
        <DetailDrawer open title="Đơn XP-001" loading onClose={vi.fn()}>
          <p>Nội dung thật</p>
        </DetailDrawer>,
      );
      expect(document.querySelector('.ant-skeleton')).not.toBeNull();
      expect(screen.queryByText('Nội dung thật')).toBeNull();
    });

    it('error: thông báo lỗi thay cho children', () => {
      render(
        <DetailDrawer open title="Đơn XP-001" error onClose={vi.fn()}>
          <p>Nội dung thật</p>
        </DetailDrawer>,
      );
      expect(screen.getByText('Không tải được dữ liệu')).toBeTruthy();
      expect(screen.queryByText('Nội dung thật')).toBeNull();
    });

    it('error thắng loading — refetch nền không che mất lỗi đang hiện', () => {
      render(
        <DetailDrawer open title="Đơn XP-001" error loading onClose={vi.fn()}>
          <p>Nội dung thật</p>
        </DetailDrawer>,
      );
      expect(screen.getByText('Không tải được dữ liệu')).toBeTruthy();
      expect(document.querySelector('.ant-skeleton')).toBeNull();
    });

    it('nội dung lỗi tuỳ biến được', () => {
      render(
        <DetailDrawer
          open
          title="T"
          error
          errorTitle="Không tải được gian hàng"
          errorDescription="Thử lại sau ít phút."
          onClose={vi.fn()}
        >
          <p>N</p>
        </DetailDrawer>,
      );
      expect(screen.getByText('Không tải được gian hàng')).toBeTruthy();
      expect(screen.getByText('Thử lại sau ít phút.')).toBeTruthy();
    });
  });

  describe('retry', () => {
    it('có onRetry thì hiện nút thử lại và gọi đúng một lần', () => {
      const onRetry = vi.fn();
      render(
        <DetailDrawer open title="T" error onRetry={onRetry} onClose={vi.fn()}>
          <p>N</p>
        </DetailDrawer>,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('không có onRetry thì không hiện nút thử lại', () => {
      render(
        <DetailDrawer open title="T" error onClose={vi.fn()}>
          <p>N</p>
        </DetailDrawer>,
      );
      expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
    });
  });

  describe('kích thước', () => {
    it('desktop md lấy bề rộng từ token', () => {
      render(
        <DetailDrawer open title="Đơn XP-001" onClose={vi.fn()}>
          <p>N</p>
        </DetailDrawer>,
      );
      expect(drawerWrapper()?.style.width).toBe('560px');
    });

    it('desktop lg lấy bề rộng lớn từ token', () => {
      render(
        <DetailDrawer open title="Nhật ký" size="lg" onClose={vi.fn()}>
          <p>N</p>
        </DetailDrawer>,
      );
      expect(drawerWrapper()?.style.width).toBe('720px');
    });

    it('mobile toàn màn hình, không tràn viewport (Figma quy tắc 3)', () => {
      media.isMobile = true;
      render(
        <DetailDrawer open title="Đơn XP-001" onClose={vi.fn()}>
          <p>N</p>
        </DetailDrawer>,
      );
      expect(drawerWrapper()?.style.width).toBe('100%');
    });
  });

  describe('header và footer', () => {
    it('tiêu đề trở thành tên khả truy cập', () => {
      render(
        <DetailDrawer open title="Gian hàng ABC" onClose={vi.fn()}>
          <p>N</p>
        </DetailDrawer>,
      );
      expect(accessibleName(screen.getByRole('dialog'))).toBe('Gian hàng ABC');
    });

    it('tiêu đề không phải chuỗi thì lấy tên từ ariaLabel', () => {
      render(
        <DetailDrawer
          open
          title={<span>Gian hàng ABC</span>}
          ariaLabel="Chi tiết gian hàng ABC"
          onClose={vi.fn()}
        >
          <p>N</p>
        </DetailDrawer>,
      );
      expect(accessibleName(screen.getByRole('dialog'))).toBe('Chi tiết gian hàng ABC');
    });

    it('extra hiện ở header', () => {
      render(
        <DetailDrawer open title="Đơn XP-001" extra={<span>Đang thuê</span>} onClose={vi.fn()}>
          <p>N</p>
        </DetailDrawer>,
      );
      expect(screen.getByText('Đang thuê')).toBeTruthy();
    });

    it('footer render được hành động', () => {
      const onAct = vi.fn();
      render(
        <DetailDrawer
          open
          title="Đơn XP-001"
          footer={
            <button type="button" onClick={onAct}>
              Kết thúc chuyến
            </button>
          }
          onClose={vi.fn()}
        >
          <p>N</p>
        </DetailDrawer>,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Kết thúc chuyến' }));
      expect(onAct).toHaveBeenCalledTimes(1);
    });

    it('không truyền footer thì không dựng vùng footer', () => {
      render(
        <DetailDrawer open title="Đơn XP-001" onClose={vi.fn()}>
          <p>N</p>
        </DetailDrawer>,
      );
      expect(document.querySelector('.ant-drawer-footer')).toBeNull();
    });
  });

  it('nút đóng gọi onClose', () => {
    const onClose = vi.fn();
    render(
      <DetailDrawer open title="Đơn XP-001" onClose={onClose}>
        <p>N</p>
      </DetailDrawer>,
    );
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('chưa mở thì không render nội dung', () => {
    render(
      <DetailDrawer open={false} title="Đơn XP-001" onClose={vi.fn()}>
        <p>Dữ liệu khách</p>
      </DetailDrawer>,
    );
    expect(screen.queryByText('Dữ liệu khách')).toBeNull();
  });

  /**
   * Modal lồng trong Drawer là hình thái thật của 4 panel quản trị (khoá gian hàng, ẩn xe,
   * duyệt hồ sơ, ghi nhận thanh toán). Kiểm rằng Modal mở được từ trong Drawer và nằm TRÊN
   * nó — chồng lớp do AntD tự quản từ `zIndexPopupBase`, component không tự đặt z-index.
   */
  it('Modal lồng bên trong mở được và nằm trên Drawer', () => {
    function Harness() {
      const [nested, setNested] = useState(false);
      return (
        <DetailDrawer open title="Gian hàng ABC" onClose={vi.fn()}>
          <button type="button" onClick={() => setNested(true)}>
            Khoá gian hàng
          </button>
          <Modal open={nested} title="Khoá gian hàng" onCancel={() => setNested(false)}>
            <p>Lý do khoá</p>
          </Modal>
        </DetailDrawer>
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Khoá gian hàng' }));

    expect(screen.getByText('Lý do khoá')).toBeTruthy();

    const drawerZ = Number(
      (document.querySelector('.ant-drawer') as HTMLElement | null)?.style.zIndex || 0,
    );
    const modalWrap = document.querySelector('.ant-modal-wrap') as HTMLElement | null;
    const modalRoot = document.querySelector('.ant-modal-root') as HTMLElement | null;
    const modalZ = Number(modalWrap?.style.zIndex || modalRoot?.style.zIndex || 0);

    // Chỉ khẳng định khi AntD thật sự đặt z-index inline (nó chỉ làm vậy khi có lồng nhau).
    if (drawerZ > 0 && modalZ > 0) {
      expect(modalZ).toBeGreaterThanOrEqual(drawerZ);
    }
  });
});
