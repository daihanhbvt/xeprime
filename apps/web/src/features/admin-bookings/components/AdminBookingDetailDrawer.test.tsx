import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminBookingDetailDrawer } from './AdminBookingDetailDrawer';

/**
 * Panel giám sát đơn thuê của NỀN TẢNG — đại diện cho 7 panel `*DetailDrawer` đã chuyển sang
 * `DetailDrawer` ở Wave 1B.
 *
 * Test tập trung vào thứ việc thay vỏ có thể làm hỏng mà typecheck không bắt được:
 * masking PII, quyền bỏ che, trạng thái lỗi + thử lại, và việc `open` bám theo id được chọn.
 * Nội dung/nghiệp vụ vẫn thuộc feature; `DetailDrawer` chỉ lo vỏ.
 */
const query = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));
const reveal = vi.hoisted(() => ({
  data: undefined as unknown,
  isPending: false,
  mutate: vi.fn(),
}));
const perms = vi.hoisted(() => ({ granted: [] as string[] }));

vi.mock('../hooks/use-admin-bookings', () => ({
  useAdminBooking: () => query,
  useRevealBookingContact: () => reveal,
}));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (p: string) => perms.granted.includes(p),
    hasAny: (...p: string[]) => p.some((x) => perms.granted.includes(x)),
    isLoading: false,
  }),
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useMediaQuery: () => false,
}));

const BOOKING = {
  id: 'B1',
  code: 'XP-001',
  status: 'active',
  customerName: 'Nguyễn Văn A',
  customerPhoneMasked: '090****567',
  tenantName: 'Gian hàng ABC',
  tenantStatus: 'active',
  vehicleName: 'Toyota Vios',
  vehiclePlateNumber: '51A-12345',
  serviceType: 'self_drive',
  pickupAt: '2026-09-01T02:00:00.000Z',
  returnAt: '2026-09-03T02:00:00.000Z',
  actualPickupAt: null,
  actualReturnAt: null,
  baseAmount: '1000000',
  deliveryFee: '0',
  discountAmount: '0',
  totalAmount: '1000000',
  depositAmount: '0',
  paidAmount: '0',
  debtAmount: '1000000',
  receiptCount: 0,
  paymentCount: 0,
  hasContract: false,
  note: null,
  createdByName: null,
  createdAt: '2026-08-01T02:00:00.000Z',
  updatedAt: '2026-08-01T02:00:00.000Z',
};

function renderDrawer(bookingId: string | null = 'B1') {
  const onClose = vi.fn();
  render(
    <App>
      <AdminBookingDetailDrawer bookingId={bookingId} onClose={onClose} />
    </App>,
  );
  return { onClose };
}

beforeEach(() => {
  query.data = BOOKING;
  query.isLoading = false;
  query.isError = false;
  query.refetch.mockReset();
  reveal.data = undefined;
  reveal.isPending = false;
  reveal.mutate.mockReset();
  perms.granted = [];
});

afterEach(cleanup);

describe('AdminBookingDetailDrawer', () => {
  it('không chọn đơn nào thì panel đóng', () => {
    query.data = undefined;
    renderDrawer(null);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('mở theo id được chọn, tiêu đề là mã đơn', () => {
    renderDrawer();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Đơn XP-001')).toBeTruthy();
  });

  it('đang tải thì hiện khung xương, chưa hiện nội dung', () => {
    query.data = undefined;
    query.isLoading = true;
    renderDrawer();
    expect(document.querySelector('.ant-skeleton')).not.toBeNull();
    expect(screen.queryByText('Nguyễn Văn A')).toBeNull();
  });

  it('lỗi: giữ nguyên câu "Không tải được thông tin đơn" và có nút thử lại', () => {
    query.data = undefined;
    query.isError = true;
    renderDrawer();
    expect(screen.getByText('Không tải được thông tin đơn')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(query.refetch).toHaveBeenCalledTimes(1);
  });

  describe('PII', () => {
    it('mặc định hiện SĐT đã che', () => {
      renderDrawer();
      expect(screen.getByText('090****567')).toBeTruthy();
    });

    it('KHÔNG có quyền xem PII thì không có nút bỏ che', () => {
      renderDrawer();
      expect(screen.queryByRole('button', { name: /Xem đầy đủ/ })).toBeNull();
    });

    it('có quyền thì bỏ che là hành động phải bấm, không tự bung', async () => {
      perms.granted = ['platform.customers.view_pii'];
      renderDrawer();

      // Chưa bấm thì vẫn là bản che.
      expect(screen.getByText('090****567')).toBeTruthy();
      expect(reveal.mutate).not.toHaveBeenCalled();

      const revealBtn = document.querySelector('.ant-btn-link') as HTMLElement | null;
      expect(revealBtn).not.toBeNull();
      fireEvent.click(revealBtn!);
      await waitFor(() => expect(reveal.mutate).toHaveBeenCalledTimes(1));
    });

    it('sau khi bỏ che thì hiện số đầy đủ', () => {
      perms.granted = ['platform.customers.view_pii'];
      reveal.data = { customerPhone: '0901234567' };
      renderDrawer();
      expect(screen.getByText('0901234567')).toBeTruthy();
    });
  });
});
