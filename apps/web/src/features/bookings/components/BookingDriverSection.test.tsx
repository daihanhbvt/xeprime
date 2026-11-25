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
 * Thẻ "Tài xế" trên chi tiết đơn — Figma `23807:73143` · hộp chọn `24145:47780` · hộp sửa tiền công
 * `24145:61977` (cập nhật 25/11/2026). Giữ các luật cũ: không còn lối nhập tài xế ngoài hệ thống;
 * đơn cũ còn mang tài xế ngoài vẫn hiện và gỡ được; sự cố tài xế rút hiện thẻ khẩn kèm hạn điều phối
 * và lối "Huỷ chuyến do thiếu tài xế"; đơn trống tài xế sát giờ hiện cảnh báo; tiền công nhập theo
 * NGÀY (ADR 0075); tài xế nội bộ gán thẳng, không tiền công (ADR 0108).
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
  internal: [] as unknown[],
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
  useAssignableDrivers: () => ({
    data: wageData.assignable,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useUpdateDriverWageSettings: () => ({ mutateAsync: wageCalls.saveDefault, isPending: false }),
}));
vi.mock('@/features/drivers/hooks/use-internal-drivers', () => ({
  useAssignableInternalDrivers: () => ({
    data: wageData.internal,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/features/drivers/components/InternalDriverModal', () => ({
  InternalDriverModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="internal-driver-modal" /> : null,
}));
vi.mock('./BookingDriverHistory', () => ({
  BookingDriverHistoryDialog: ({ subtitle }: { subtitle: string }) => (
    <div data-testid="history-dialog">{subtitle}</div>
  ),
}));
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

function renderSection(b: BookingDetail) {
  return render(
    <Harness>
      <BookingDriverSection booking={b} canUpdate />
    </Harness>,
  );
}

/** Mở menu "…" của khung tài xế rồi bấm một mục. */
async function pickMenu(label: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Thao tác với tài xế' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: label }));
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
  wageData.internal = [];
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
  avatarUrl: null,
  licence: null,
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

function linkedCandidate(over: Record<string, unknown> = {}) {
  return {
    id: 'drv-2',
    name: 'Trần Bình',
    phone: '0912000333',
    busy: false,
    licenceState: 'verified',
    licenceClasses: ['B2'],
    driverType: 'staff',
    avatarUrl: null,
    expiredCount: 0,
    ...over,
  };
}

const QUOTE = {
  days: 3,
  dailyWage: '500000',
  suggestedAmount: '1500000',
  range: { min: '600000', max: '6000000' },
  wageDaily: { min: '200000', max: '2000000' },
  suggestedDaily: '500000',
  rentAmount: '4200000',
};

describe('BookingDriverSection', () => {
  it('chưa có tài xế: nút "Gán tài xế", không còn lối nhập tài xế ngoài hệ thống', () => {
    renderSection(booking());
    expect(screen.getByRole('button', { name: /Gán tài xế/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /ngoài hệ thống/ })).toBeNull();
  });

  it('đơn cũ mang tài xế ngoài: nhãn + ghi chú đã bỏ, "Bỏ gán" trong menu gửi driverId null', async () => {
    renderSection(booking({ driver: EXTERNAL_DRIVER }));
    expect(screen.getByText('Ngoài hệ thống')).toBeTruthy();
    expect(screen.getByText(/XePrime không còn nhận cách này/)).toBeTruthy();
    expect(screen.getByRole('link', { name: '0912000111' }).getAttribute('href')).toContain(
      '0912000111',
    );

    await pickMenu('Bỏ gán');
    const confirm = await screen.findAllByRole('button', { name: 'Bỏ gán' });
    fireEvent.click(confirm.at(-1)!);
    await waitFor(() => expect(mutation.mutate).toHaveBeenCalledTimes(1));
    expect((mutation.mutate.mock.calls[0] as unknown[])[0]).toEqual({ driverId: null });
  });

  it('"Lịch sử gán tài xế" mở hộp lịch sử với mã đơn', () => {
    renderSection(booking());
    fireEvent.click(screen.getByRole('button', { name: /Lịch sử gán tài xế/ }));
    expect(screen.getByTestId('history-dialog').textContent).toContain('DH-0001');
  });

  it('sự cố tài xế rút: tên, lý do, hạn điều phối; nút huỷ mở hộp với nhóm "thiếu tài xế"', () => {
    renderSection(booking({ driverIncident: incident() }));
    expect(screen.getByText('Tài xế Lê Rút đã rút khỏi chuyến')).toBeTruthy();
    expect(screen.getByText(/Lý do: Sức khoẻ - “Sốt cao”/)).toBeTruthy();
    expect(screen.getByText(/Gán tài xế liên kết khác trước/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Huỷ chuyến do thiếu tài xế' }));
    expect(screen.getByTestId('cancel-dialog').textContent).toBe(
      CANCELLATION_REASON_CATEGORY.DRIVER_UNAVAILABLE,
    );
  });

  it('sự cố quá hạn điều phối: nói rõ khách đang được huỷ hoàn 100%; không chồng cảnh báo 2 giờ', () => {
    renderSection(
      booking({
        pickupAt: new Date(Date.now() + HOUR).toISOString(),
        driverIncident: incident({
          level: DRIVER_INCIDENT_LEVEL.URGENT,
          customerCanCancelFree: true,
        }),
      }),
    );
    expect(screen.getByText(/khách đang được huỷ hoàn 100%/)).toBeTruthy();
    expect(screen.queryByText(/Còn dưới 2 giờ tới giờ nhận/)).toBeNull();
  });

  it('chưa có tài xế và còn dưới 2 giờ tới giờ nhận ⇒ cảnh báo; còn xa thì không', () => {
    const { unmount } = renderSection(
      booking({ pickupAt: new Date(Date.now() + HOUR).toISOString() }),
    );
    expect(screen.getByText(/Còn dưới 2 giờ tới giờ nhận/)).toBeTruthy();
    unmount();

    renderSection(booking());
    expect(screen.queryByText(/Còn dưới 2 giờ tới giờ nhận/)).toBeNull();
  });

  it('đơn đã giao xe: chỉ đọc, không có nút gán / huỷ do thiếu tài xế', () => {
    renderSection(booking({ status: BOOKING_STATUS.ACTIVE }));
    expect(screen.queryByRole('button', { name: /Gán tài xế/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Huỷ chuyến do thiếu tài xế' })).toBeNull();
  });
});

describe('BookingDriverSection - tài xế liên kết + tiền công (ADR 0075)', () => {
  const LINKED = {
    source: DRIVER_SOURCE.LINKED,
    id: 'drv-1',
    name: 'Nguyễn An',
    phone: '0912000222',
    assignmentStatus: DRIVER_ASSIGNMENT_STATUS.ACCEPTED,
    assignedAt: new Date().toISOString(),
    respondedAt: new Date().toISOString(),
    respondBy: null,
    avatarUrl: null,
    licence: { state: 'verified', classes: ['B2'], expiresOn: null, fullName: null, kind: null },
  } as NonNullable<BookingDetail['driver']>;
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
      changes: [],
    },
  };

  it('khung tài xế: bằng lái + dòng "Tiền công (x3 ngày)"', () => {
    wageData.history = [openItem];
    wageData.quote = QUOTE;
    renderSection(booking({ driver: LINKED }));
    expect(screen.getByText('Bằng lái B2')).toBeTruthy();
    expect(screen.getByText('Tiền công (x3 ngày)')).toBeTruthy();
    expect(screen.getByText(/1\.500\.000/)).toBeTruthy();
  });

  it('lượt đang chờ nhận: khung "Chờ tài xế nhận chuyến" + đồng hồ', () => {
    wageData.history = [openItem];
    renderSection(
      booking({
        driver: {
          ...LINKED,
          assignmentStatus: DRIVER_ASSIGNMENT_STATUS.PENDING,
          respondedAt: null,
          respondBy: new Date(Date.now() + 30 * 60_000).toISOString(),
        },
      }),
    );
    expect(screen.getByText('Chờ tài xế nhận chuyến')).toBeTruthy();
    expect(screen.getByLabelText(/^Còn \d+:\d{2}/)).toBeTruthy();
  });

  it('sửa tiền công theo ngày: tổng thu nhập + chênh lệch, chỉ áp chuyến này', async () => {
    wageData.history = [openItem];
    wageData.quote = QUOTE;
    renderSection(booking({ driver: LINKED }));
    await pickMenu('Sửa tiền công');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Nguyễn An - 0912000222')).toBeTruthy();
    // 1.500.000 / 3 ngày đọc lại thành 500.000/ngày.
    const input = within(dialog).getByLabelText(/Tiền công mới\/ngày/) as HTMLInputElement;
    expect(input.value).toMatch(/500/);
    fireEvent.change(input, { target: { value: '650000' } });
    expect(await within(dialog).findByText('+450.000')).toBeTruthy();
    expect(within(dialog).getByText('Tổng thu nhập')).toBeTruthy();
    expect(within(dialog).queryByText('Chuyến này và các chuyến gán sau')).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu tiền công' }));

    await waitFor(() => expect(wageCalls.update).toHaveBeenCalledTimes(1));
    expect(wageCalls.saveDefault).not.toHaveBeenCalled();
    expect(wageCalls.update.mock.calls[0]![0]).toEqual({
      assignmentId: 'asg-1',
      body: { amount: '1950000' },
    });
  });

  it('số ngày của đơn đổi sau khi gán ⇒ nhắc kiểm tra lại tiền công', () => {
    wageData.history = [openItem];
    wageData.quote = { ...QUOTE, days: 4, rentAmount: '5600000' };
    renderSection(booking({ driver: LINKED }));
    expect(screen.getByText(/Số ngày của đơn đã đổi \(3 → 4 ngày\)/)).toBeTruthy();
  });

  it('hộp gán: chọn tài xế liên kết, mức chung tự điền × số ngày, xác nhận gửi đúng tiền công', async () => {
    wageData.assignable = [linkedCandidate()];
    wageData.quote = QUOTE;
    mutation.mutateAsync.mockResolvedValue({});
    renderSection(booking());
    fireEvent.click(screen.getByRole('button', { name: /Gán tài xế/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Bằng lái B2 - Đã xác thực')).toBeTruthy();
    expect(within(dialog).getByText('Rảnh trong khung giờ')).toBeTruthy();
    fireEvent.click(within(dialog).getByText('Trần Bình'));
    expect(await within(dialog).findByText('Tiền công (x3 ngày)')).toBeTruthy();
    // Gán thẳng không qua tiền công thì không có.
    expect(mutation.mutate).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: /Xác nhận gán tài xế/ }));
    await waitFor(() => expect(mutation.mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutation.mutateAsync.mock.calls[0]![0]).toEqual({
      driverId: 'drv-2',
      wageAmount: '1500000',
    });
    expect(wageCalls.saveDefault).not.toHaveBeenCalled();
  });

  it('hộp gán: mức khác mức chung, chọn "các chuyến sau" ⇒ đổi mức chung rồi gán', async () => {
    wageData.assignable = [linkedCandidate()];
    wageData.quote = QUOTE;
    mutation.mutateAsync.mockResolvedValue({});
    renderSection(booking());
    fireEvent.click(screen.getByRole('button', { name: /Gán tài xế/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByText('Trần Bình'));
    fireEvent.change(await within(dialog).findByLabelText(/Tiền công\/ngày/), {
      target: { value: '650000' },
    });
    fireEvent.click(await within(dialog).findByText('Chuyến này và các chuyến gán sau'));
    fireEvent.click(within(dialog).getByRole('button', { name: /Xác nhận gán tài xế/ }));

    await waitFor(() => expect(mutation.mutateAsync).toHaveBeenCalledTimes(1));
    expect(wageCalls.saveDefault).toHaveBeenCalledWith({ dailyWage: '650000' });
    expect(mutation.mutateAsync.mock.calls[0]![0]).toEqual({
      driverId: 'drv-2',
      wageAmount: '1950000',
    });
  });

  it('chưa đặt mức chung: ô trống + gợi ý; người chưa xác minh bằng lái vẫn chọn được, có cảnh báo', async () => {
    wageData.assignable = [linkedCandidate({ licenceState: 'none', licenceClasses: [] })];
    wageData.quote = { ...QUOTE, dailyWage: null, suggestedAmount: null };
    mutation.mutateAsync.mockResolvedValue({});
    renderSection(booking());
    fireEvent.click(screen.getByRole('button', { name: /Gán tài xế/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByText('Chưa xác minh bằng lái').length).toBeGreaterThan(0);
    fireEvent.click(within(dialog).getByText('Trần Bình'));
    expect(await within(dialog).findByText(/đối chiếu giấy tờ trước khi giao xe/)).toBeTruthy();
    const input = within(dialog).getByLabelText(/Tiền công\/ngày/) as HTMLInputElement;
    expect(input.value).toBe('');
    expect(input.placeholder).toMatch(/Gợi ý 500\.000/);

    fireEvent.change(input, { target: { value: '600000' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Xác nhận gán tài xế/ }));
    await waitFor(() => expect(mutation.mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutation.mutateAsync.mock.calls[0]![0]).toEqual({
      driverId: 'drv-2',
      wageAmount: '1800000',
    });
    expect(wageCalls.saveDefault).not.toHaveBeenCalled();
  });
});

describe('BookingDriverSection - tài xế nội bộ (ADR 0108)', () => {
  it('hộp gán liệt kê cả tài xế nội bộ; người bận không chọn được; chọn người rảnh gán thẳng', async () => {
    wageData.assignable = [linkedCandidate()];
    wageData.internal = [
      { id: 'int-1', name: 'Lê Nội Bộ', phone: '0912000444', busy: false, photoUrl: null },
      { id: 'int-2', name: 'Phạm Bận', phone: '0912000555', busy: true, photoUrl: null },
    ];
    renderSection(booking());
    fireEvent.click(screen.getByRole('button', { name: /Gán tài xế/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Trùng chuyến')).toBeTruthy();
    const busyRadio = within(dialog)
      .getByText('Phạm Bận')
      .closest('label')
      ?.querySelector('input[type="radio"]') as HTMLInputElement;
    expect(busyRadio.disabled).toBe(true);

    fireEvent.click(within(dialog).getByText('Lê Nội Bộ'));
    expect(within(dialog).getByText(/gán thẳng, coi như đã nhận chuyến/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: /Xác nhận gán tài xế/ }));
    await waitFor(() => expect(mutation.mutate).toHaveBeenCalledTimes(1));
    expect(mutation.mutate.mock.calls[0]![0]).toEqual({ internalDriverId: 'int-1' });
  });

  it('"Thêm tài xế nội bộ" ở đáy danh sách mở hộp thêm nhanh', async () => {
    renderSection(booking());
    fireEvent.click(screen.getByRole('button', { name: /Gán tài xế/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Thêm tài xế nội bộ/ }));
    expect(screen.getByTestId('internal-driver-modal')).toBeTruthy();
  });

  it('đơn đang có tài xế nội bộ: nhãn nội bộ, không tiền công, không ghi chú "đơn cũ"', () => {
    renderSection(
      booking({
        driver: {
          ...EXTERNAL_DRIVER,
          source: DRIVER_SOURCE.INTERNAL,
          id: 'int-1',
          name: 'Lê Nội Bộ',
        },
      }),
    );
    expect(screen.getByText('Lê Nội Bộ')).toBeTruthy();
    expect(screen.getByText('Tài xế nội bộ')).toBeTruthy();
    expect(screen.getByText(/không ghi tiền công/)).toBeTruthy();
    expect(screen.queryByText(/XePrime không còn nhận cách này/)).toBeNull();
  });
});
