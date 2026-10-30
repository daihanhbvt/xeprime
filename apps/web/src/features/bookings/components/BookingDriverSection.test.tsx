import { App } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import {
  BOOKING_STATUS,
  CANCELLATION_REASON_CATEGORY,
  DRIVER_ASSIGNMENT_STATUS,
  DRIVER_DROP_REASON,
  DRIVER_DROP_ZONE,
  DRIVER_INCIDENT_LEVEL,
  DRIVER_SOURCE,
  DRIVER_WAGE_STAGE,
  SERVICE_TYPE,
} from '@xeprime/types';

import { IntlTestProvider } from '@/i18n/test-utils';
import type { BookingDetail, BookingDriverIncident } from '../types';
import { BookingDriverSection } from './BookingDriverSection';

/**
 * Khối Tài xế trên chi tiết đơn (ADR 0063 · ADR 0074): không còn lối nhập tài xế ngoài hệ thống;
 * đơn cũ còn mang tài xế ngoài vẫn hiện và gỡ được; sự cố tài xế rút hiện thẻ khẩn kèm hạn điều
 * phối và lối "Huỷ chuyến do thiếu tài xế"; đơn trống tài xế sát giờ hiện cảnh báo.
 */

/** Hai lời gọi tiền công riêng: sửa một lượt gán, và đổi mức chung của gian hàng. */
const wageCalls = vi.hoisted(() => ({
  update: vi.fn(),
  saveDefault: vi.fn(),
}));
const mutation = vi.hoisted(() => ({
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  reset: vi.fn(),
}));
/** Dữ liệu tiền công (ADR 0075) mà từng ca bơm vào — lịch sử lượt gán, gợi ý hộp gán, bộ chọn. */
const wageData = vi.hoisted(() => ({
  history: [] as unknown[],
  quote: null as unknown,
  assignable: [] as unknown[],
}));
vi.mock('../hooks/use-booking-mutations', () => ({
  useAssignBookingDriver: () => ({
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    reset: mutation.reset,
    isPending: false,
    isError: false,
    error: null,
  }),
  useUpdateDriverWage: () => ({ mutate: vi.fn(), mutateAsync: wageCalls.update, isPending: false }),
}));
vi.mock('../hooks/use-booking', () => ({
  useBookingDriverHistory: () => ({ data: wageData.history, isLoading: false, isError: false }),
  useDriverWageQuote: () => ({
    data: wageData.quote,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ has: () => true }),
}));
vi.mock('@/features/drivers/hooks/use-drivers', () => ({
  useAssignableDrivers: () => ({ data: wageData.assignable, isLoading: false, isError: false }),
  useUpdateDriverWageSettings: () => ({ mutateAsync: wageCalls.saveDefault, isPending: false }),
}));
vi.mock('./BookingDriverHistory', () => ({ BookingDriverHistory: () => null }));
vi.mock('./BookingStatusTransitionDialog', () => ({
  BookingStatusTransitionDialog: (props: { defaultReasonCategory?: string }) => (
    <div data-testid="cancel-dialog">{props.defaultReasonCategory}</div>
  ),
}));

const HOUR = 3_600_000;

function booking(overrides: Partial<BookingDetail> = {}): BookingDetail {
  return {
    id: 'bk-1',
    code: 'DH-0001',
    status: BOOKING_STATUS.RESERVED,
    serviceType: SERVICE_TYPE.WITH_DRIVER,
    routeType: null,
    pickupAddress: null,
    destination: null,
    pickupAt: new Date(Date.now() + 48 * HOUR).toISOString(),
    returnAt: new Date(Date.now() + 56 * HOUR).toISOString(),
    driver: null,
    driverIncident: null,
    ...overrides,
  } as unknown as BookingDetail;
}

function Harness({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <IntlTestProvider>
      <QueryClientProvider client={client}>
        <App>{children}</App>
      </QueryClientProvider>
    </IntlTestProvider>
  );
}

beforeEach(() => {
  mutation.mutate.mockClear();
  mutation.mutateAsync.mockReset();
  mutation.reset.mockClear();
  wageCalls.update.mockReset().mockResolvedValue({});
  wageCalls.saveDefault.mockReset().mockResolvedValue({});
  wageData.history = [];
  wageData.quote = null;
  wageData.assignable = [];
});
afterEach(cleanup);

const EXTERNAL_DRIVER = {
  source: DRIVER_SOURCE.EXTERNAL,
  id: null,
  name: 'Trần Văn Ngoài',
  phone: '0912000111',
  assignmentStatus: DRIVER_ASSIGNMENT_STATUS.ACCEPTED,
  assignedAt: new Date().toISOString(),
  respondedAt: null,
  respondBy: null,
};

function incident(overrides: Partial<BookingDriverIncident> = {}): BookingDriverIncident {
  return {
    droppedAt: new Date().toISOString(),
    reassignBy: new Date(Date.now() + HOUR).toISOString(),
    level: DRIVER_INCIDENT_LEVEL.REARRANGING,
    customerCanCancelFree: false,
    driverName: 'Lê Rút',
    reasonCategory: DRIVER_DROP_REASON.HEALTH_ISSUE,
    reason: 'Sốt cao',
    zone: DRIVER_DROP_ZONE.SAME_DAY,
    ...overrides,
  };
}

describe('BookingDriverSection', () => {
  it('không còn nút nhập tài xế ngoài hệ thống', () => {
    render(
      <Harness>
        <BookingDriverSection booking={booking()} canUpdate />
      </Harness>,
    );
    expect(screen.getByRole('button', { name: 'Gán tài xế' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /ngoài hệ thống/ })).toBeNull();
  });

  it('đơn cũ mang tài xế ngoài: hiện nhãn + ghi chú đã bỏ, bỏ gán gửi driverId null', async () => {
    render(
      <Harness>
        <BookingDriverSection booking={booking({ driver: EXTERNAL_DRIVER })} canUpdate />
      </Harness>,
    );
    expect(screen.getByText('Ngoài hệ thống')).toBeTruthy();
    expect(screen.getByText(/XePrime không còn nhận cách này/)).toBeTruthy();
    expect(screen.getByRole('link', { name: '0912000111' }).getAttribute('href')).toContain(
      '0912000111',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Bỏ gán' }));
    fireEvent.click(await screen.findByRole('button', { name: /OK|Đồng ý|Có/ }));
    await waitFor(() => expect(mutation.mutate).toHaveBeenCalledTimes(1));
    expect((mutation.mutate.mock.calls[0] as unknown[])[0]).toEqual({ driverId: null });
  });

  it('sự cố tài xế rút: tên, lý do, hạn điều phối; nút huỷ mở hộp với nhóm "thiếu tài xế"', () => {
    render(
      <Harness>
        <BookingDriverSection booking={booking({ driverIncident: incident() })} canUpdate />
      </Harness>,
    );
    expect(screen.getByText('Tài xế Lê Rút đã rút khỏi chuyến')).toBeTruthy();
    expect(screen.getByText(/Lý do: Sức khoẻ — “Sốt cao”/)).toBeTruthy();
    expect(screen.getByText(/Gán tài xế liên kết khác trước/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Huỷ chuyến do thiếu tài xế' }));
    expect(screen.getByTestId('cancel-dialog').textContent).toBe(
      CANCELLATION_REASON_CATEGORY.DRIVER_UNAVAILABLE,
    );
  });

  it('sự cố quá hạn điều phối: nói rõ khách đang được huỷ hoàn 100%; không chồng cảnh báo 2 giờ', () => {
    render(
      <Harness>
        <BookingDriverSection
          booking={booking({
            pickupAt: new Date(Date.now() + HOUR).toISOString(),
            driverIncident: incident({
              level: DRIVER_INCIDENT_LEVEL.URGENT,
              customerCanCancelFree: true,
            }),
          })}
          canUpdate
        />
      </Harness>,
    );
    expect(screen.getByText(/khách đang được huỷ hoàn 100%/)).toBeTruthy();
    expect(screen.queryByText(/Còn dưới 2 giờ tới giờ nhận/)).toBeNull();
  });

  it('chưa có tài xế và còn dưới 2 giờ tới giờ nhận ⇒ cảnh báo; còn xa thì không', () => {
    const { unmount } = render(
      <Harness>
        <BookingDriverSection
          booking={booking({ pickupAt: new Date(Date.now() + HOUR).toISOString() })}
          canUpdate
        />
      </Harness>,
    );
    expect(screen.getByText(/Còn dưới 2 giờ tới giờ nhận/)).toBeTruthy();
    unmount();

    render(
      <Harness>
        <BookingDriverSection booking={booking()} canUpdate />
      </Harness>,
    );
    expect(screen.queryByText(/Còn dưới 2 giờ tới giờ nhận/)).toBeNull();
  });

  it('đơn đã giao xe: chỉ đọc, không có nút gán / huỷ do thiếu tài xế', () => {
    render(
      <Harness>
        <BookingDriverSection booking={booking({ status: BOOKING_STATUS.ACTIVE })} canUpdate />
      </Harness>,
    );
    expect(screen.queryByRole('button', { name: 'Gán tài xế' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Huỷ chuyến do thiếu tài xế' })).toBeNull();
  });
});

describe('BookingDriverSection — tiền công tài xế (ADR 0075)', () => {
  const LINKED = {
    source: DRIVER_SOURCE.LINKED,
    id: 'drv-1',
    name: 'Nguyễn An',
    phone: '0912000222',
    assignmentStatus: DRIVER_ASSIGNMENT_STATUS.ACCEPTED,
    assignedAt: new Date().toISOString(),
    respondedAt: new Date().toISOString(),
    respondBy: null,
  };
  const openItem = {
    id: 'asg-1',
    driverId: 'drv-1',
    driverName: 'Nguyễn An',
    driverPhone: '0912000222',
    outcome: 'open',
    assignedAt: new Date().toISOString(),
    assignedByName: 'Chủ xe',
    acceptedAt: new Date().toISOString(),
    endedAt: null,
    endedByName: null,
    dropReasonCategory: null,
    dropReason: null,
    dropZone: null,
    wage: {
      amount: '1500000',
      days: 3,
      stage: DRIVER_WAGE_STAGE.RUNNING,
      editable: true,
      editableUntil: null,
      range: { min: '600000', max: '6000000' },
      changes: [
        {
          id: 'chg-1',
          oldAmount: '1200000',
          newAmount: '1500000',
          reason: 'thêm buổi tối',
          changedAt: new Date().toISOString(),
          changedByName: 'Chủ xe',
        },
      ],
    },
  };

  const QUOTE = {
    days: 3,
    dailyWage: '500000',
    suggestedAmount: '1500000',
    range: { min: '600000', max: '6000000' },
    wageDaily: { min: '200000', max: '2000000' },
    suggestedDaily: '500000',
    rentAmount: '4200000',
  };

  it('tài xế đang gán: hiện tiền công, lịch sử sửa và mở hộp sửa', async () => {
    wageData.history = [openItem];
    wageData.quote = QUOTE;
    render(
      <Harness>
        <BookingDriverSection booking={booking({ driver: LINKED })} canUpdate />
      </Harness>,
    );
    expect(screen.getByText(/Tiền công 1\.500\.000/)).toBeTruthy();
    expect(screen.getByText(/1\.200\.000.*→.*1\.500\.000/)).toBeTruthy();
    expect(screen.getByText(/thêm buổi tối/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Sửa tiền công/ }));
    expect(await screen.findByText('Sửa tiền công · Nguyễn An')).toBeTruthy();
    // Nhập theo ngày: 1.500.000 / 3 ngày đọc lại thành 500.000/ngày, đúng mức chung.
    expect(screen.getByText(/Tổng chuyến: 500\.000.*× 3 ngày/)).toBeTruthy();
    expect(screen.getByText(/Mức chung: 500\.000/)).toBeTruthy();
    // Bằng mức chung thì không có gì để chọn phạm vi.
    expect(screen.queryByText('Chỉ chuyến này')).toBeNull();
  });

  it('sửa tiền công khác mức chung: chỉ áp cho chuyến này, không có lựa chọn phạm vi', async () => {
    wageData.history = [openItem];
    wageData.quote = QUOTE;
    render(
      <Harness>
        <BookingDriverSection booking={booking({ driver: LINKED })} canUpdate />
      </Harness>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Sửa tiền công/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Tiền công\/ngày/), { target: { value: '650000' } });
    expect(await within(dialog).findByText(/Tổng chuyến: 650\.000.*× 3 ngày/)).toBeTruthy();
    expect(within(dialog).queryByText('Chỉ chuyến này')).toBeNull();
    expect(within(dialog).queryByText('Chuyến này và các chuyến gán sau')).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(wageCalls.update).toHaveBeenCalledTimes(1));
    expect(wageCalls.saveDefault).not.toHaveBeenCalled();
    expect(wageCalls.update.mock.calls[0]![0]).toEqual({
      assignmentId: 'asg-1',
      body: { amount: '1950000' },
    });
  });

  it('gán với mức khác mức chung, chọn "các chuyến sau" ⇒ đổi mức chung rồi gán tổng × số ngày', async () => {
    wageData.assignable = [
      { id: 'drv-2', name: 'Trần Bình', phone: '0912000333', busy: false, licenceState: 'none' },
    ];
    wageData.quote = QUOTE;
    mutation.mutateAsync.mockResolvedValue({});
    render(
      <Harness>
        <BookingDriverSection booking={booking()} canUpdate />
      </Harness>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Gán tài xế' }));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Chọn tài xế cho đơn' }));
    fireEvent.click(await screen.findByText(/Trần Bình · 0912000333/));

    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Tiền công\/ngày/), { target: { value: '650000' } });
    expect(await within(dialog).findByText('Chỉ chuyến này')).toBeTruthy();
    fireEvent.click(within(dialog).getByText('Chuyến này và các chuyến gán sau'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Gán tài xế' }));

    await waitFor(() => expect(mutation.mutateAsync).toHaveBeenCalledTimes(1));
    expect(wageCalls.saveDefault).toHaveBeenCalledWith({ dailyWage: '650000' });
    expect(mutation.mutateAsync.mock.calls[0]![0]).toEqual({ driverId: 'drv-2', wageAmount: '1950000' });
  });

  it('số ngày của đơn đổi sau khi gán ⇒ nhắc kiểm tra lại tiền công', () => {
    wageData.history = [openItem];
    wageData.quote = {
      ...QUOTE,
      days: 4,
      suggestedAmount: '2000000',
      range: { min: '800000', max: '8000000' },
      rentAmount: '5600000',
    };
    render(
      <Harness>
        <BookingDriverSection booking={booking({ driver: LINKED })} canUpdate />
      </Harness>,
    );
    expect(screen.getByText(/Số ngày của đơn đã đổi \(3 → 4 ngày\)/)).toBeTruthy();
  });

  it('chọn tài xế mở hộp gán: điền sẵn mặc định × số ngày, gán gửi đúng tiền công', async () => {
    wageData.assignable = [
      { id: 'drv-2', name: 'Trần Bình', phone: '0912000333', busy: false, licenceState: 'none' },
    ];
    wageData.quote = QUOTE;
    mutation.mutateAsync.mockResolvedValue({});
    render(
      <Harness>
        <BookingDriverSection booking={booking()} canUpdate />
      </Harness>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Gán tài xế' }));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Chọn tài xế cho đơn' }));
    fireEvent.click(await screen.findByText(/Trần Bình · 0912000333/));

    expect(await screen.findByText('Gán Trần Bình')).toBeTruthy();
    expect(screen.getByText(/Tổng chuyến: 500\.000.*× 3 ngày/)).toBeTruthy();
    // Gán thẳng từ bộ chọn không còn nữa — phải qua hộp gán kèm tiền công.
    expect(mutation.mutate).not.toHaveBeenCalled();

    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Gán tài xế' }));
    await waitFor(() => expect(mutation.mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutation.mutateAsync.mock.calls[0]![0]).toEqual({
      driverId: 'drv-2',
      wageAmount: '1500000',
    });
    // Đúng mức chung ⇒ không đổi mức chung.
    expect(wageCalls.saveDefault).not.toHaveBeenCalled();
  });

  it('gian hàng chưa đặt mức chung: không tự điền, chỉ nhắc mức gợi ý; "chỉ chuyến này" không đổi mức chung', async () => {
    wageData.assignable = [
      { id: 'drv-2', name: 'Trần Bình', phone: '0912000333', busy: false, licenceState: 'none' },
    ];
    wageData.quote = { ...QUOTE, dailyWage: null, suggestedAmount: null };
    mutation.mutateAsync.mockResolvedValue({});
    render(
      <Harness>
        <BookingDriverSection booking={booking()} canUpdate />
      </Harness>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Gán tài xế' }));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Chọn tài xế cho đơn' }));
    fireEvent.click(await screen.findByText(/Trần Bình · 0912000333/));

    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByLabelText(/Tiền công\/ngày/) as HTMLInputElement;
    expect(input.value).toBe('');
    expect(input.placeholder).toMatch(/Gợi ý 500\.000/);
    expect(within(dialog).getByText(/Chưa có mức chung · khoảng 200\.000/)).toBeTruthy();

    fireEvent.change(input, { target: { value: '600000' } });
    expect(await within(dialog).findByText('Gian hàng vẫn chưa có mức chung.')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Gán tài xế' }));

    await waitFor(() => expect(mutation.mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutation.mutateAsync.mock.calls[0]![0]).toEqual({ driverId: 'drv-2', wageAmount: '1800000' });
    expect(wageCalls.saveDefault).not.toHaveBeenCalled();
  });
});
