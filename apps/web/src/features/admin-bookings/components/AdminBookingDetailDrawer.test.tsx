import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PERMISSION } from '@xeprime/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminBookingDetailDrawer } from './AdminBookingDetailDrawer';

/**
 * Panel giám sát đơn thuê của NỀN TẢNG — đứng cạnh bảng (modeless, cỡ `split`).
 *
 * Khoá lại những thứ typecheck không bắt được: masking PII + quyền bỏ che, ba trạng thái tải,
 * dòng thời gian suy từ dữ liệu THẬT (không mốc/giờ bịa), tách bạch tài sản bảo đảm với tiền của
 * đơn, và nút điều hướng chỉ xuất hiện khi có route hợp lệ + quyền.
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
  actualPickupAt: '2026-09-01T02:05:00.000Z',
  actualReturnAt: null,
  baseAmount: '1000000',
  deliveryFee: '0',
  discountAmount: '0',
  totalAmount: '1000000',
  depositAmount: '5000000',
  paidAmount: '0',
  debtAmount: '1000000',
  receiptCount: 2,
  paymentCount: 3,
  hasContract: true,
  note: null,
  createdByName: 'Ngô Thanh Hải',
  createdAt: '2026-08-01T02:00:00.000Z',
  updatedAt: '2026-08-02T03:30:00.000Z',
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

function timelineStates(): Record<string, string | null> {
  const list = screen.getByRole('list', { name: 'Tiến trình đơn thuê' });
  return Object.fromEntries(
    within(list)
      .getAllByRole('listitem')
      .map((item) => [item.querySelector('[class*="stepLabel"]')?.textContent, item.dataset.state]),
  );
}

function summaryList(): HTMLElement {
  return screen.getByLabelText('Tóm tắt thanh toán');
}

function collateralCard(): HTMLElement {
  return screen.getByRole('complementary', { name: 'Tài sản bảo đảm khi nhận xe' });
}

beforeEach(() => {
  query.data = { ...BOOKING };
  query.isLoading = false;
  query.isError = false;
  query.refetch.mockReset();
  reveal.data = undefined;
  reveal.isPending = false;
  reveal.mutate.mockReset();
  perms.granted = [];
});

afterEach(cleanup);

describe('AdminBookingDetailDrawer — vỏ panel', () => {
  it('không chọn đơn nào thì panel đóng', () => {
    query.data = undefined;
    renderDrawer(null);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('mở theo id được chọn: tiêu đề là mã đơn, trạng thái đứng cạnh, dòng phụ là giờ tạo', () => {
    renderDrawer();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Đơn XP-001')).toBeTruthy();
    const header = document.querySelector('.ant-drawer-header') as HTMLElement;
    expect(within(header).getByText('Đang thuê')).toBeTruthy();
    // 02:00Z = 09:00 giờ VN.
    expect(within(header).getByText('Tạo lúc 09:00 · 01/08/2026')).toBeTruthy();
  });

  it('đứng cạnh bảng: không có mask tối che danh sách', () => {
    renderDrawer();
    expect(document.querySelector('.ant-drawer-mask')).toBeNull();
  });

  it('nút đóng có tên khả truy cập và gọi onClose', () => {
    const { onClose } = renderDrawer();
    const close = document.querySelector('.ant-drawer-close') as HTMLElement;
    expect(close.getAttribute('aria-label')).toBeTruthy();
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Esc đóng panel', () => {
    const { onClose } = renderDrawer();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
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
});

describe('AdminBookingDetailDrawer — Thông tin đơn', () => {
  it('hiện khách, gian hàng + trạng thái gian hàng, xe + biển số, dịch vụ', () => {
    renderDrawer();
    expect(screen.getByText('Nguyễn Văn A')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Gian hàng ABC' }).getAttribute('href')).toBe(
      '/manage/admin/tenants?q=Gian%20h%C3%A0ng%20ABC',
    );
    expect(screen.getByText('Đang hoạt động')).toBeTruthy();
    // Link xe tra theo BIỂN SỐ — tên xe trùng nhau giữa nhiều gian hàng.
    expect(screen.getByRole('link', { name: 'Toyota Vios · 51A-12345' }).getAttribute('href')).toBe(
      '/manage/admin/vehicles?q=51A-12345',
    );
    expect(screen.getByText('Tự lái')).toBeTruthy();
  });

  it('thiếu dữ liệu: SĐT "—", không biển số, không ghi chú, người tạo "—" — không bịa', () => {
    query.data = {
      ...BOOKING,
      customerPhoneMasked: null,
      vehiclePlateNumber: null,
      createdByName: null,
      note: null,
    };
    renderDrawer();
    expect(screen.getByRole('link', { name: 'Toyota Vios' }).getAttribute('href')).toBe(
      '/manage/admin/vehicles?q=Toyota%20Vios',
    );
    expect(screen.queryByText('Ghi chú')).toBeNull();
    expect(screen.getByText('Người tạo: —')).toBeTruthy();
    // Không có dòng điểm nhận xe: API không trả địa chỉ nhận.
    expect(screen.queryByText('Điểm nhận xe')).toBeNull();
  });

  it('có ghi chú thì hiện đúng ghi chú', () => {
    query.data = { ...BOOKING, note: 'Khách nhận xe ở sân bay' };
    renderDrawer();
    expect(screen.getByText('Khách nhận xe ở sân bay')).toBeTruthy();
  });

  describe('PII', () => {
    it('mặc định hiện SĐT đã che', () => {
      renderDrawer();
      expect(screen.getByText('090****567')).toBeTruthy();
    });

    it('KHÔNG có quyền xem PII thì không có nút bỏ che', () => {
      renderDrawer();
      expect(document.querySelector('.ant-btn-link')).toBeNull();
    });

    it('có quyền thì bỏ che là hành động phải bấm, không tự bung', async () => {
      perms.granted = [PERMISSION.PLATFORM_CUSTOMER_PII_VIEW];
      renderDrawer();

      expect(screen.getByText('090****567')).toBeTruthy();
      expect(reveal.mutate).not.toHaveBeenCalled();

      const revealBtn = document.querySelector('.ant-btn-link') as HTMLElement | null;
      expect(revealBtn).not.toBeNull();
      fireEvent.click(revealBtn!);
      await waitFor(() => expect(reveal.mutate).toHaveBeenCalledTimes(1));
    });

    it('sau khi bỏ che thì hiện số đầy đủ', () => {
      perms.granted = [PERMISSION.PLATFORM_CUSTOMER_PII_VIEW];
      reveal.data = { customerPhone: '0901234567' };
      renderDrawer();
      expect(screen.getByText('0901234567')).toBeTruthy();
    });
  });
});

describe('AdminBookingDetailDrawer — Lịch trình', () => {
  it('đơn đang thuê: tạo đơn + giao xe xong, hoàn thành chưa tới', () => {
    renderDrawer();
    expect(timelineStates()).toEqual({
      'Tạo đơn': 'done',
      'Đã giao xe': 'done',
      'Hoàn thành': 'todo',
    });
  });

  it('đơn hoàn thành: mọi mốc xong, giờ thực tế là khoảng giao → trả', () => {
    query.data = {
      ...BOOKING,
      status: 'completed',
      actualReturnAt: '2026-09-03T02:10:00.000Z',
      debtAmount: '0',
    };
    renderDrawer();
    expect(Object.values(timelineStates())).toEqual(['done', 'done', 'done']);
    expect(screen.getByText('01/09/2026 09:05 → 03/09/2026 09:10')).toBeTruthy();
  });

  it('đơn đã huỷ: điểm cuối "Đã hủy" thay cho các mốc sau', () => {
    query.data = { ...BOOKING, status: 'cancelled', actualPickupAt: null };
    renderDrawer();
    expect(timelineStates()).toEqual({ 'Tạo đơn': 'done', 'Đã hủy': 'failed' });
  });

  it('dự kiến lấy giờ nhận/trả theo đơn; thực tế chưa giao xe thì "Chưa có dữ liệu"', () => {
    query.data = { ...BOOKING, status: 'reserved', actualPickupAt: null };
    renderDrawer();
    expect(screen.getByText('01/09/2026 09:00 → 03/09/2026 09:00')).toBeTruthy();
    expect(screen.getByText('Chưa có dữ liệu')).toBeTruthy();
    // Giờ tạo đơn KHÔNG được mượn làm giờ thực tế.
    expect(screen.queryByText(/01\/08\/2026 09:00 →/)).toBeNull();
  });

  it('đã giao xe nhưng chưa trả: thực tế ghi rõ "chưa trả xe"', () => {
    renderDrawer();
    expect(screen.getByText('01/09/2026 09:05 → chưa trả xe')).toBeTruthy();
  });
});

describe('AdminBookingDetailDrawer — Thanh toán', () => {
  it('tài sản bảo đảm là khối RIÊNG, không nằm trong bảng tiền của đơn', () => {
    renderDrawer();
    expect(within(collateralCard()).getByText('5.000.000 ₫')).toBeTruthy();
    expect(within(collateralCard()).getByText(/không phải tiền giữ chỗ/)).toBeTruthy();
    expect(within(summaryList()).queryByText('5.000.000 ₫')).toBeNull();
  });

  it('không dựng dòng "tiền giữ chỗ"/"cọc giữ chỗ" từ cọc thế chấp', () => {
    renderDrawer();
    expect(within(summaryList()).queryByText(/giữ chỗ/i)).toBeNull();
  });

  it('đơn không khai cọc tiền: nói thẳng, không hiện 0 ₫', () => {
    query.data = { ...BOOKING, depositAmount: '0' };
    renderDrawer();
    expect(within(collateralCard()).getByText('Đơn không khai cọc tiền')).toBeTruthy();
    expect(within(collateralCard()).queryByText('0 ₫')).toBeNull();
  });

  it('bảng tiền: tiền thuê, giảm giá, phụ phí (nếu có), tổng, đã thanh toán, còn phải thanh toán', () => {
    query.data = {
      ...BOOKING,
      baseAmount: '520000',
      deliveryFee: '50000',
      discountAmount: '52000',
      totalAmount: '518000',
      paidAmount: '200000',
      debtAmount: '318000',
    };
    renderDrawer();
    const list = within(summaryList());
    expect(list.getByText('Tiền thuê')).toBeTruthy();
    expect(list.getByText('520.000 ₫')).toBeTruthy();
    expect(list.getByText('Phí giao xe')).toBeTruthy();
    expect(list.getByText('− 52.000 ₫')).toBeTruthy();
    expect(list.getByText('Tổng thanh toán')).toBeTruthy();
    expect(list.getByText('518.000 ₫')).toBeTruthy();
    expect(list.getByText('Đã thanh toán')).toBeTruthy();
    expect(list.getByText('318.000 ₫')).toBeTruthy();
  });

  it('tổng có phụ phí phát sinh chưa tách dòng: hiện phần chênh để các dòng cộng khớp', () => {
    query.data = {
      ...BOOKING,
      baseAmount: '1000000',
      totalAmount: '1200000',
      debtAmount: '1200000',
    };
    renderDrawer();
    const list = within(summaryList());
    expect(list.getByText('Phụ phí & khoản khác')).toBeTruthy();
    expect(list.getByText('200.000 ₫')).toBeTruthy();
  });

  it('đơn đã huỷ: không có dòng "Còn phải thanh toán" (ngoài phạm vi công nợ)', () => {
    query.data = { ...BOOKING, status: 'cancelled', actualPickupAt: null };
    renderDrawer();
    expect(within(summaryList()).queryByText('Còn phải thanh toán')).toBeNull();
    expect(within(summaryList()).getByText('Đã thanh toán')).toBeTruthy();
  });

  it('phụ phí và giảm giá bằng 0 thì không chiếm dòng', () => {
    renderDrawer();
    expect(within(summaryList()).queryByText('Phí giao xe')).toBeNull();
    expect(within(summaryList()).queryByText('Giảm giá')).toBeNull();
    expect(within(summaryList()).queryByText('Phụ phí & khoản khác')).toBeNull();
  });

  it('còn nợ của chuyến CHƯA kết thúc không bị tô cảnh báo', () => {
    renderDrawer();
    expect(screen.queryByText('Chuyến đã hoàn thành nhưng vẫn còn nợ')).toBeNull();
    expect(summaryList().querySelector('[class*="debtOverdue"]')).toBeNull();
  });

  it('chuyến đã hoàn thành mà còn nợ: cảnh báo bằng màu VÀ bằng chữ', () => {
    query.data = { ...BOOKING, status: 'completed', actualReturnAt: '2026-09-03T02:10:00.000Z' };
    renderDrawer();
    expect(screen.getByText('Chuyến đã hoàn thành nhưng vẫn còn nợ')).toBeTruthy();
  });
});

describe('AdminBookingDetailDrawer — Hồ sơ & điều hướng', () => {
  it('đếm giao dịch, phiếu thu/chi, hợp đồng + người tạo, giờ cập nhật', () => {
    renderDrawer();
    expect(screen.getByText('3 giao dịch')).toBeTruthy();
    expect(screen.getByText('2 phiếu thu/chi')).toBeTruthy();
    expect(screen.getByText('1 hợp đồng')).toBeTruthy();
    expect(screen.getByText('Người tạo: Ngô Thanh Hải')).toBeTruthy();
    expect(screen.getByText('Cập nhật: 02/08/2026 10:30')).toBeTruthy();
  });

  it('chưa có hồ sơ nào thì nói "Chưa có…", không hiện "0 hợp đồng"', () => {
    query.data = { ...BOOKING, receiptCount: 0, paymentCount: 0, hasContract: false };
    renderDrawer();
    expect(screen.getByText('Chưa có giao dịch')).toBeTruthy();
    expect(screen.getByText('Chưa có phiếu thu/chi')).toBeTruthy();
    expect(screen.getByText('Chưa có hợp đồng')).toBeTruthy();
  });

  it('các ô hồ sơ không phải link giả — route của chúng thuộc phạm vi gian hàng', () => {
    renderDrawer();
    const docs = screen.getByText('3 giao dịch').closest('ul') as HTMLElement;
    expect(within(docs).queryAllByRole('link')).toHaveLength(0);
  });

  it('có quyền xem nhật ký: "Xem lịch sử" trỏ vào nhật ký lọc sẵn theo đơn', () => {
    perms.granted = [PERMISSION.PLATFORM_AUDIT_VIEW];
    renderDrawer();
    const footer = document.querySelector('.ant-drawer-footer') as HTMLElement;
    const link = within(footer).getByRole('link');
    expect(link.getAttribute('href')).toBe('/manage/admin/audit?targetType=booking&targetId=B1');
    expect(within(link).getByRole('button', { name: /Xem lịch sử/ })).toBeTruthy();
  });

  it('không có quyền xem nhật ký: không có nút lịch sử, và không có footer rỗng', () => {
    renderDrawer();
    expect(screen.queryByRole('button', { name: /Xem lịch sử/ })).toBeNull();
    expect(document.querySelector('.ant-drawer-footer')).toBeNull();
  });

  it('không có nút "Mở chi tiết đầy đủ" — admin nền tảng không có route chi tiết đơn', () => {
    perms.granted = [PERMISSION.PLATFORM_AUDIT_VIEW];
    renderDrawer();
    expect(screen.queryByText(/Mở chi tiết đầy đủ/)).toBeNull();
    expect(document.querySelector('a[href^="/manage/bookings/"]')).toBeNull();
  });
});
