import { App } from 'antd';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  API_ERROR_CODE,
  BOOKING_NO_SHOW_GRACE_MINUTES,
  BOOKING_STATUS,
  PERMISSION,
} from '@xeprime/types';
import { ApiClientError } from '@/services/api-client';
import { BookingStatusActions } from './BookingStatusActions';
import type { BookingDetail } from '../types';

/**
 * Đặc tả các QUYẾT ĐỊNH TRẠNG THÁI của gian hàng trên một đơn.
 *
 * Thứ được khoá ở đây không phải "nút có hiện không" mà là **ranh giới của máy trạng thái nằm
 * trên giao diện**: đúng HAI quyết định khép đơn (hủy · khách không đến), KHÔNG có 'Xác nhận
 * đơn' (gian hàng đã xác nhận ở 'Duyệt & giữ xe'), và KHÔNG có đường nào bấm thẳng sang
 * `active`/`completed` — hai trạng thái đó chỉ đến từ một lần bàn giao thật (design 14 §1).
 * Một bộ chọn trạng thái tự do mọc lại ở đây sẽ làm đỏ đúng các test này.
 *
 * Thứ hai: hủy và ghi nhận không đến là hành động PHÁ HUỶ — nhả lịch xe ngay, không hoàn tác
 * (ADR 0006). Nên chúng phải đi qua hộp xác nhận có LÝ DO bắt buộc, và một lần bấm không được
 * biến thành hai request.
 */

const permissions = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (permission: string) => permissions.granted.has(permission),
    hasAny: (...keys: string[]) => keys.some((key) => permissions.granted.has(key)),
    isLoading: false,
  }),
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

const transition = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  isError: false,
  error: null as unknown,
}));
vi.mock('../hooks/use-booking-mutations', () => ({
  useTransitionBooking: () => transition,
}));

/** Mốc ISO cách 'bây giờ' đúng `minutes` phút về TRƯỚC (số âm là tương lai). */
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

function booking(overrides: Partial<BookingDetail> = {}): BookingDetail {
  return {
    id: 'bk-1',
    code: 'DH-0007',
    status: BOOKING_STATUS.RESERVED,
    customerName: 'Lê Minh Cường',
    vehicleName: 'Mazda 3',
    vehiclePlate: '43B-336.92',
    // Mặc định: chuyến ĐÃ quá giờ hẹn quá ân hạn, để ca thường thấy đủ cả hai quyết định.
    // Ca kiểm ân hạn tự đặt mốc riêng.
    pickupAt: minutesAgo(BOOKING_NO_SHOW_GRACE_MINUTES + 60),
    returnAt: minutesAgo(-48 * 60),
    collectedAmount: '0',
    debtAmount: '0',
    depositAmount: '0',
    ...overrides,
  } as unknown as BookingDetail;
}

function renderActions(
  detail: BookingDetail = booking(),
  opts: { pickupConfirmed?: boolean } = {},
) {
  return render(
    <App>
      <BookingStatusActions booking={detail} pickupConfirmed={opts.pickupConfirmed} />
    </App>,
  );
}

/** Mở hộp xác nhận rồi trả về nút chính của hộp đó. */
function openClosingDialog(name: string | RegExp): void {
  fireEvent.click(screen.getByRole('button', { name }));
}

beforeEach(() => {
  permissions.granted = new Set([PERMISSION.BOOKING_UPDATE]);
  transition.mutate.mockReset();
  transition.isPending = false;
  transition.isError = false;
  transition.error = null;
});

describe('Hành động theo trạng thái đơn', () => {
  it('đơn đã giữ xe, đã qua ân hạn: hủy đơn + ghi nhận khách không đến', () => {
    renderActions(booking({ status: BOOKING_STATUS.RESERVED }));

    expect(screen.getByRole('button', { name: 'Hủy đơn' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ghi nhận khách không đến' })).toBeTruthy();
  });

  /**
   * Sự xác nhận của gian hàng đã xảy ra ở `Duyệt & giữ xe` trên yêu cầu thuê — đó là thứ tạo ra
   * chính đơn này. Một nút "Xác nhận đơn" ở đây là một bước rỗng, và nó cạnh tranh với CTA thật
   * của màn hình (`Xác nhận đã giao xe`).
   */
  it.each([BOOKING_STATUS.RESERVED, BOOKING_STATUS.CONFIRMED])(
    'đơn %s: KHÔNG có nút "Xác nhận đơn"',
    (status) => {
      renderActions(booking({ status }));

      expect(screen.queryByRole('button', { name: /Xác nhận đơn/ })).toBeNull();
    },
  );

  it('đơn đã xác nhận: vẫn hủy và ghi nhận không đến được', () => {
    renderActions(booking({ status: BOOKING_STATUS.CONFIRMED }));

    expect(screen.getByRole('button', { name: 'Hủy đơn' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ghi nhận khách không đến' })).toBeTruthy();
  });

  /**
   * Xe đang ở ngoài đường: chặng duy nhất còn lại là `Xác nhận đã nhận xe` trên thanh hành động
   * (qua biên bản bàn giao). Nếu ở đây mọc ra một nút đổi trạng thái thì một chuyến kết thúc mà
   * không có giờ nhận thực tế lẫn KM trả — và `Hủy đơn` sẽ nhả lịch một chiếc xe đang chạy.
   */
  it('đơn đang thuê: KHÔNG có nút nào — không hủy, không đổi trạng thái', () => {
    const { container } = renderActions(booking({ status: BOOKING_STATUS.ACTIVE }));

    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it.each([BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CANCELLED, BOOKING_STATUS.NO_SHOW])(
    'đơn đã khép (%s): không render hành động trạng thái',
    (status) => {
      const { container } = renderActions(booking({ status }));

      expect(container.querySelectorAll('button')).toHaveLength(0);
    },
  );

  it('thiếu quyền bookings.update: không render gì (backend vẫn là lớp chặn thật)', () => {
    permissions.granted = new Set();

    const { container } = renderActions(booking({ status: BOOKING_STATUS.RESERVED }));

    expect(container.querySelectorAll('button')).toHaveLength(0);
  });
});

/**
 * Ba điều kiện của `no_show`, và mỗi ca dưới đây phá đúng một cái. Đây là bộ ĐÚNG BẰNG bộ mà
 * server kiểm (`assertNoShowAllowed`) — giao diện không được bày ra một nút chắc chắn nhận 409.
 */
describe('Điều kiện ghi nhận khách không đến', () => {
  it('chưa qua ân hạn: chỉ còn nút hủy', () => {
    renderActions(
      booking({
        status: BOOKING_STATUS.CONFIRMED,
        pickupAt: minutesAgo(BOOKING_NO_SHOW_GRACE_MINUTES - 10),
      }),
    );

    expect(screen.getByRole('button', { name: 'Hủy đơn' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ghi nhận khách không đến' })).toBeNull();
  });

  it('chuyến còn ở tương lai: chưa ghi nhận không đến được', () => {
    renderActions(booking({ status: BOOKING_STATUS.RESERVED, pickupAt: minutesAgo(-120) }));

    expect(screen.queryByRole('button', { name: 'Ghi nhận khách không đến' })).toBeNull();
  });

  it('đã có biên bản giao xe: khách đã cầm chìa khoá, không gọi là không đến', () => {
    renderActions(booking({ status: BOOKING_STATUS.CONFIRMED }), { pickupConfirmed: true });

    expect(screen.getByRole('button', { name: 'Hủy đơn' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ghi nhận khách không đến' })).toBeNull();
  });

  it('đúng sau ân hạn thì hiện lên', () => {
    renderActions(
      booking({
        status: BOOKING_STATUS.CONFIRMED,
        pickupAt: minutesAgo(BOOKING_NO_SHOW_GRACE_MINUTES + 1),
      }),
    );

    expect(screen.getByRole('button', { name: 'Ghi nhận khách không đến' })).toBeTruthy();
  });
});

describe('Hộp xác nhận hủy đơn', () => {
  it('nêu rõ đơn nào và hậu quả không hoàn tác', async () => {
    renderActions(booking({ status: BOOKING_STATUS.RESERVED }));
    openClosingDialog('Hủy đơn');

    expect(await screen.findByText(/Hủy đơn DH-0007/)).toBeTruthy();
    expect(screen.getByText(/không mở lại được/)).toBeTruthy();
    expect(screen.getByText('Lê Minh Cường')).toBeTruthy();
    expect(screen.getByText(/Mazda 3/)).toBeTruthy();
  });

  it('thiếu lý do thì chặn ngay ở client, không gửi request', async () => {
    renderActions(booking({ status: BOOKING_STATUS.RESERVED }));
    openClosingDialog('Hủy đơn');

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hủy đơn' }));

    expect(await screen.findByText('Nhập lý do trước khi tiếp tục')).toBeTruthy();
    expect(transition.mutate).not.toHaveBeenCalled();
  });

  it('khoảng trắng không phải là lý do', async () => {
    renderActions(booking({ status: BOOKING_STATUS.RESERVED }));
    openClosingDialog('Hủy đơn');

    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '   ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hủy đơn' }));

    expect(await screen.findByText('Nhập lý do trước khi tiếp tục')).toBeTruthy();
    expect(transition.mutate).not.toHaveBeenCalled();
  });

  it('có lý do thì gửi đúng trạng thái đích và lý do đã trim', async () => {
    renderActions(booking({ status: BOOKING_STATUS.RESERVED }));
    openClosingDialog('Hủy đơn');

    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox'), {
      target: { value: '  Khách báo hủy qua điện thoại  ' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hủy đơn' }));

    await waitFor(() => expect(transition.mutate).toHaveBeenCalledTimes(1));
    expect(transition.mutate.mock.calls[0]![0]).toEqual({
      status: BOOKING_STATUS.CANCELLED,
      reason: 'Khách báo hủy qua điện thoại',
    });
  });

  /** Tiền đã cầm của khách không tự bay đi — XePrime không có cổng thanh toán (ADR 0013). */
  it('đã thu tiền thì cảnh báo khoản đó không tự hoàn', async () => {
    renderActions(booking({ status: BOOKING_STATUS.CONFIRMED, collectedAmount: '2500000' }));
    openClosingDialog('Hủy đơn');

    expect(await screen.findByText(/tiền đã thu/)).toBeTruthy();
    expect(screen.getByText(/không tự hoàn tiền/)).toBeTruthy();
  });

  it('chưa thu đồng nào thì không dọa người dùng bằng cảnh báo tiền', async () => {
    renderActions(booking({ status: BOOKING_STATUS.CONFIRMED, collectedAmount: '0' }));
    openClosingDialog('Hủy đơn');

    await screen.findByRole('dialog');
    expect(screen.queryByText(/tiền đã thu/)).toBeNull();
  });

  it('lỗi thì ở lại trong hộp và nói bằng chữ dịch từ MÃ, không phải message backend', async () => {
    transition.isError = true;
    transition.error = new ApiClientError({
      code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
      message: 'Không thể chuyển đơn từ "active" sang "cancelled"',
      status: 409,
    });
    renderActions(booking({ status: BOOKING_STATUS.CONFIRMED }));
    openClosingDialog('Hủy đơn');

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('alert').textContent).toContain(
      'Không chuyển được sang trạng thái này.',
    );
  });

  it('đang gửi: nút chính ở trạng thái chờ, một cú bấm không thành hai request', async () => {
    transition.isPending = true;
    renderActions(booking({ status: BOOKING_STATUS.CONFIRMED }));
    openClosingDialog('Hủy đơn');

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: /Hủy đơn/ }).className).toContain(
      'ant-btn-loading',
    );
  });

  it('thành công thì đóng hộp lại', async () => {
    renderActions(booking({ status: BOOKING_STATUS.RESERVED }));
    openClosingDialog('Hủy đơn');

    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox'), {
      target: { value: 'Xe hỏng đột xuất' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hủy đơn' }));

    await waitFor(() => expect(transition.mutate).toHaveBeenCalledTimes(1));
    const options = transition.mutate.mock.calls[0]![1] as { onSuccess: () => void };
    options.onSuccess();

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('Hộp ghi nhận khách không đến', () => {
  it('cũng bắt buộc lý do và gửi đúng trạng thái no_show', async () => {
    renderActions(booking({ status: BOOKING_STATUS.CONFIRMED }));
    openClosingDialog('Ghi nhận khách không đến');

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ghi nhận không đến' }));
    expect(await screen.findByText('Nhập lý do trước khi tiếp tục')).toBeTruthy();
    expect(transition.mutate).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByRole('textbox'), {
      target: { value: 'Quá hẹn 3 tiếng, không liên lạc được' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ghi nhận không đến' }));

    await waitFor(() => expect(transition.mutate).toHaveBeenCalledTimes(1));
    expect(transition.mutate.mock.calls[0]![0]).toEqual({
      status: BOOKING_STATUS.NO_SHOW,
      reason: 'Quá hẹn 3 tiếng, không liên lạc được',
    });
  });
});
