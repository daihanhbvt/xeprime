import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { withIntl } from '@/i18n/test-utils';
import type { CustomerUnpaidHold } from '../api';
import { UnpaidHoldsReminder } from './UnpaidHoldsReminder';

/**
 * Thẻ nhắc thanh toán đầu "Chuyến của tôi" — bản native của test web cùng tên.
 *
 * Khoá: chỉ hiện khi CÓ chuyến chưa trả; mỗi chuyến một lối trả thẳng sang màn thanh toán của
 * đúng chuyến đó; chạm trần thì nói rõ là KHÔNG đặt thêm được.
 */
const mockUnpaid: { data: unknown } = { data: undefined };
/** Đồng hồ cần điều hướng (`useFocusEffect`) — có test riêng, ở đây chỉ cần nó không vẽ gì. */
jest.mock('@/components/ui/Countdown', () => ({ Countdown: () => null }));

jest.mock('../hooks/use-trips', () => ({ useUnpaidHolds: () => mockUnpaid }));

const mockNavigate = jest.fn();
jest.mock('@/hooks/use-navigate-once', () => ({ useNavigateOnce: () => mockNavigate }));

function hold(n: number, minutesLeft = 30): CustomerUnpaidHold {
  return {
    tripId: `T${n}`,
    code: `XPH0000000${n}`,
    vehicleName: `Xe số ${n}`,
    vehicleImageUrl: null,
    pickupAt: '2026-10-23T10:00:00.000Z',
    returnAt: '2026-10-24T03:00:00.000Z',
    remainingAmount: '176000',
    expiresAt: new Date(Date.now() + minutesLeft * 60_000).toISOString(),
  };
}

beforeEach(() => {
  mockUnpaid.data = undefined;
  mockNavigate.mockReset();
});
afterEach(cleanup);

describe('UnpaidHoldsReminder', () => {
  it('không có chuyến chưa trả (hoặc chưa tải xong) ⇒ không vẽ gì', async () => {
    const view = await render(withIntl(<UnpaidHoldsReminder />));
    expect(view.queryByText(/thanh toán/i)).toBeNull();

    mockUnpaid.data = { limit: 3, limitReached: false, items: [] };
    await view.rerender(withIntl(<UnpaidHoldsReminder />));
    expect(view.queryByText(/thanh toán/i)).toBeNull();
  });

  it('dưới trần ⇒ nhắc nhẹ, mỗi chuyến một nút trả tới đúng màn thanh toán', async () => {
    mockUnpaid.data = { limit: 3, limitReached: false, items: [hold(1), hold(2)] };
    await render(withIntl(<UnpaidHoldsReminder />));

    expect(screen.getByText('Bạn có 2 chuyến chờ thanh toán')).toBeTruthy();
    expect(screen.getAllByText(/176\.000/)).toHaveLength(2);

    fireEvent.press(screen.getByLabelText('Thanh toán chuyến Xe số 2'));
    expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/payment/[id]', params: { id: 'T2' } });
  });

  it('chạm trần ⇒ nói rõ không đặt thêm xe được', async () => {
    mockUnpaid.data = { limit: 3, limitReached: true, items: [hold(1), hold(2), hold(3)] };
    await render(withIntl(<UnpaidHoldsReminder />));

    expect(screen.getByText('Bạn đã giữ tối đa 3 chuyến chưa thanh toán')).toBeTruthy();
    expect(screen.getByText(/chưa thể đặt thêm xe/)).toBeTruthy();
  });
});
