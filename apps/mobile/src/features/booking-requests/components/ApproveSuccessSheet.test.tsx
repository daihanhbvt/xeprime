import { render } from '@testing-library/react-native';
import { withIntl } from '@/i18n/test-utils';
import viBookingRequests from '@xeprime/domain/messages/vi/booking-requests.json';
import type { BookingRequestDecisionTarget } from '../api';
import { ApproveSuccessSheet } from './ApproveSuccessSheet';

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

/**
 * Kết quả sau khi DUYỆT phải nói ĐÚNG kết cục — ADR 0044 điều 2.
 *
 * Bài test này tồn tại vì bản trước của tấm nói "Đã tạo đơn thuê" cho MỌI lượt duyệt, kể cả
 * nhánh mặc định của luồng hiện hành (có thu tiền giữ chỗ) nơi chưa có đơn nào tồn tại và khách
 * còn chưa chuyển đồng nào. Một lời khẳng định sai ở đây làm gian hàng tin chuyến đã chắc chắn,
 * rồi đi tìm một đơn không có.
 */
function target(overrides: Partial<BookingRequestDecisionTarget> = {}) {
  return {
    id: '01JQZX0000000000000000000R',
    vehicleName: 'Toyota Vios 2022',
    vehiclePlate: '51A-123.45',
    customerName: 'Nguyễn Văn An',
    customerPhone: '0901234567',
    pickupAt: '2026-09-25T02:00:00.000Z',
    returnAt: '2026-09-27T02:00:00.000Z',
    bookingId: null,
    ...overrides,
  } as BookingRequestDecisionTarget;
}

async function renderSheet(overrides: Partial<BookingRequestDecisionTarget> = {}) {
  return await render(
    withIntl(<ApproveSuccessSheet request={target(overrides)} onClose={jest.fn()} />),
  );
}

describe('ApproveSuccessSheet — chuyến CÓ thu tiền giữ chỗ (chưa có đơn)', () => {
  it('nói đã NHẬN chuyến và đang chờ khách thanh toán, không phải "đã tạo đơn thuê"', async () => {
    const view = await renderSheet({ bookingId: null });

    expect(view.queryByText(viBookingRequests.approved.holdTitle)).not.toBeNull();
    expect(view.queryByText(viBookingRequests.approved.holdLead)).not.toBeNull();
    expect(view.queryByText(viBookingRequests.approved.holdNext)).not.toBeNull();

    // Câu của nhánh "đã có đơn" không được lọt sang đây.
    expect(view.queryByText(viBookingRequests.approved.title)).toBeNull();
    expect(view.queryByText(viBookingRequests.approved.lead)).toBeNull();
    expect(view.queryByText(viBookingRequests.approved.next)).toBeNull();
  });

  /* Chưa có đơn thì không có gì để mở — một nút dẫn vào hư vô tệ hơn là không có nút. */
  it('không bày nút "Xem chi tiết đơn"; lối chính là quay về hộp thư', async () => {
    const view = await renderSheet({ bookingId: null });

    expect(view.queryByText(viBookingRequests.approved.viewBooking)).toBeNull();
    expect(view.queryByText(viBookingRequests.approved.holdClose)).not.toBeNull();
  });
});

describe('ApproveSuccessSheet — chuyến KHÔNG thu (đơn ra đời ngay lúc duyệt)', () => {
  it('nói đã tạo đơn và mở được đơn đó', async () => {
    const view = await renderSheet({ bookingId: '01JQZX0000000000000000000B' });

    expect(view.queryByText(viBookingRequests.approved.title)).not.toBeNull();
    expect(view.queryByText(viBookingRequests.approved.lead)).not.toBeNull();
    expect(view.queryByText(viBookingRequests.approved.next)).not.toBeNull();
    expect(view.queryByText(viBookingRequests.approved.viewBooking)).not.toBeNull();

    expect(view.queryByText(viBookingRequests.approved.holdTitle)).toBeNull();
  });

  it('thuê dài hạn dùng câu riêng của nó', async () => {
    const view = await renderSheet({
      bookingId: '01JQZX0000000000000000000B',
      longTermPackageMonths: 3,
    } as Partial<BookingRequestDecisionTarget>);

    expect(view.queryByText(viBookingRequests.approved.leadLongTerm)).not.toBeNull();
    expect(view.queryByText(viBookingRequests.approved.lead)).toBeNull();
  });
});
