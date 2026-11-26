import { App } from 'antd';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BOOKING_SOURCE,
  BOOKING_STATUS,
  HANDOVER_PREP_ITEM,
  PERMISSION,
  SERVICE_TYPE,
  VEHICLE_TYPE,
} from '@xeprime/types';
import viMessages from '../../../../messages/vi';
import type { BookingDetail } from '../types';
import { BookingDetailContent } from './BookingDetailContent';

/**
 * Chi tiết đơn theo design 02/11/2026 (Figma `23768:29928`). Khoá:
 *  1. Thẻ "Thanh toán" giữ đủ dòng tiền cũ — giữ chỗ qua XePrime, khách trả khi nhận xe — và chỉ
 *     hiện dòng phụ khi khác 0.
 *  2. "Lợi nhuận chuyến" là bảng cộng ví chủ xe; đơn không có bảng phí thì không có khối.
 *  3. "Chuẩn bị bàn giao" vẽ đúng các việc server suy; tuyến hoa hồng (không có gói Thu chi) không
 *     có hai dòng tiền.
 *  4. Stepper nói đúng chặng; đơn huỷ có bước đỏ.
 */

const query = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  isError: false,
  error: undefined as unknown,
  refetch: vi.fn(),
}));
const granted = vi.hoisted(() => ({ value: new Set<string>() }));
const finance = vi.hoisted(() => ({ visible: true }));

vi.mock('../hooks/use-booking', () => ({ useBooking: () => query }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (permission: string) => granted.value.has(permission),
    hasAny: () => false,
    isLoading: false,
  }),
}));
vi.mock('@/hooks/use-feature', () => ({
  useFeature: () => ({ isVisible: finance.visible, canWrite: finance.visible, state: 'enabled' }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/manage/bookings/BK1',
  useSearchParams: () => new URLSearchParams(),
}));
const handoverCtx = vi.hoisted(() => ({ value: undefined as unknown }));
vi.mock('@/features/handovers/hooks', () => ({
  useHandoverContext: () => ({ data: handoverCtx.value }),
  useInvalidateHandovers: () => vi.fn(),
  useHandoverPhotoPreviews: () => ({ data: undefined }),
}));
vi.mock('@/features/contracts/hooks/use-contract', () => ({
  useCreateContract: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/features/booking-requests/hooks/use-booking-request-mutations', () => ({
  useStartBookingRequestConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
const prepCheck = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
vi.mock('../hooks/use-booking-mutations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../hooks/use-booking-mutations')>()),
  useSetHandoverPrepCheck: () => prepCheck,
}));
vi.mock('./BookingDriverSection', () => ({ BookingDriverSection: () => null }));
// Thẻ Cọc & thế chấp (ADR 0109) có test riêng.
vi.mock('./detail/CollateralSideCard', () => ({ CollateralSideCard: () => null }));
vi.mock('./BookingFormDialog', () => ({ BookingFormDialog: () => null }));
vi.mock('./BookingExtensionsPanel', () => ({ BookingExtensionsPanel: () => null }));
vi.mock('./BookingInsuranceCertificatesPanel', () => ({
  BookingInsuranceCertificatesPanel: () => null,
}));
// Thẻ Phát sinh có test riêng; ở đây chỉ cần biết trang báo cho nó đơn còn nhận tiền hay không.
vi.mock('@/features/settlement/components/SettlementCard', () => ({
  SettlementCard: ({ moneyClosed }: { moneyClosed?: boolean }) => (
    <div data-testid="settlement-card" data-money-closed={moneyClosed ? 'true' : 'false'} />
  ),
}));

const BOOKING: BookingDetail = {
  id: 'BK1',
  code: 'XP-001',
  vehicleId: 'V1',
  vehicleName: 'Hyundai Grand i10 2019',
  vehiclePlate: '43A-276.16',
  customerName: 'Khách 3123',
  customerPhone: '0123123123',
  status: BOOKING_STATUS.CONFIRMED,
  serviceType: SERVICE_TYPE.SELF_DRIVE,
  source: BOOKING_SOURCE.XEPRIME,
  sourceLabel: null,
  longTermPackageMonths: null,
  vehicleType: VEHICLE_TYPE.CAR,
  canMessageOnPlatform: false,
  pickupHandoverStatus: null,
  handoverPlaceKind: null,
  handoverPlace: null,
  pickupAt: '2026-09-24T10:00:00.000Z',
  returnAt: '2026-09-25T03:00:00.000Z',
  totalAmount: '468000',
  paidAmount: '0',
  surchargeTotal: '0',
  amountDue: '468000',
  otherCollected: '0',
  collectedAmount: '0',
  debtAmount: '468000',
  depositAmount: '5000000',
  driver: null,
  createdAt: '2026-09-18T07:44:00.000Z',
  tenantCustomerId: null,
  vehicleImageUrl: null,
  routeType: null,
  pickupAddress: null,
  pickupLocation: null,
  destination: null,
  destinationPin: null,
  baseAmount: '520000',
  deliveryFee: '0',
  discountAmount: '52000',
  extraChargesAmount: '0',
  collaterals: [],
  priceSnapshot: null,
  customerTotalAmount: '477360',
  holdPaidAmount: '102960',
  payAtPickupAmount: '374400',
  ownerShareOnlineAmount: '93600',
  counterDueAmount: '374400',
  ownerCommissionAmount: null,
  ownerTaxAmount: null,
  ownerNetAmount: null,
  ownerPayout: null,
  actualPickupAt: null,
  actualReturnAt: null,
  note: null,
  updatedAt: '2026-09-18T07:44:00.000Z',
  confirmedAt: '2026-09-18T07:40:00.000Z',
  holdPaidAt: '2026-09-18T07:44:00.000Z',
  handoverPrep: {
    documentsReady: false,
    rentDueAmount: '468000',
    depositRequired: '5000000',
    depositReceived: '0',
    contractId: null,
    contractSigned: false,
    pickupPhotoCount: 2,
    pickupPhotoRequired: 5,
    driverReady: null,
    manualChecks: [],
  },
} as BookingDetail;

function renderDetail(data: BookingDetail = BOOKING) {
  query.data = data;
  return render(
    <NextIntlClientProvider locale="vi" messages={viMessages} timeZone="Asia/Ho_Chi_Minh">
      <App>
        <BookingDetailContent bookingId="BK1" />
      </App>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  handoverCtx.value = undefined;
  granted.value = new Set([
    PERMISSION.BOOKING_VIEW,
    PERMISSION.PAYMENT_RECORD,
    PERMISSION.CONTRACT_MANAGE,
  ]);
  finance.visible = true;
});

describe('Thẻ "Thanh toán"', () => {
  /*
   * 06/11/2026: thẻ đọc như MỘT phép trừ — Tổng tiền chuyến − phần khách trả trước qua XePrime (`D`,
   * không phải cả khoản giữ chỗ) − gian hàng đã thu = "Còn lại (phải thu)" - 26/11 theo Figma
   * `23777:48877`: một dòng sau đường kẻ, câu "thu lúc nào" ở dấu ⓘ.
   */
  it('trừ đúng phần tiền thuê khách đã trả trước (D), và số cuối nổi bật là số còn phải thu', () => {
    renderDetail();
    const card = screen.getByRole('region', { name: 'Thanh toán' });
    expect(within(card).getByText('Tổng tiền chuyến')).toBeTruthy();
    expect(within(card).getByText('Khách trả trước qua XePrime')).toBeTruthy();
    expect(card.textContent).toContain('−93.600');
    // Cả khoản giữ chỗ (gồm phí đặt xe + bảo hiểm) không còn là một dòng trừ.
    expect(within(card).queryByText('Giữ chỗ (XePrime đã thu)')).toBeNull();
    const due = within(card).getByRole('status', { name: /Còn lại \(phải thu\)/ });
    expect(due.textContent).toContain('374.400');
  });

  it('đơn lập tay (không trả trước) ⇒ không có dòng trả trước; thu đủ ⇒ còn lại 0', () => {
    renderDetail({
      ...BOOKING,
      holdPaidAmount: null,
      payAtPickupAmount: null,
      ownerShareOnlineAmount: '0',
      counterDueAmount: '0',
    });
    const card = screen.getByRole('region', { name: 'Thanh toán' });
    expect(within(card).queryByText('Khách trả trước qua XePrime')).toBeNull();
    expect(
      within(card).getByRole('status', { name: /Còn lại \(phải thu\)/ }).textContent,
    ).toContain('0');
  });
});

describe('"Lợi nhuận chuyến"', () => {
  it('là bảng cộng ví chủ xe khi snapshot có (ADR 0068 điều 5)', () => {
    renderDetail({
      ...BOOKING,
      ownerPayout: {
        rentAmount: '468000',
        rentalDays: 1,
        unitAmount: '468000',
        ownerCommissionAmount: '46800',
        commissionTiers: null,
        taxAmount: '0',
        vatAmount: '0',
        pitAmount: '0',
        vatPercent: null,
        pitPercent: null,
        taxTotalPercent: null,
        taxExemptReason: null,
        ownerNetAmount: '421200',
        payAtPickupRentAmount: '351000',
        ownerPayableAmount: '70200',
        collectsHold: true,
      },
    });
    expect(screen.getByText('Lợi nhuận chuyến')).toBeTruthy();
    expect(screen.getByText('Số tiền cộng ví (a − b)')).toBeTruthy();
  });

  it('đơn lập tay / đơn cũ không có bảng phí ⇒ không có khối', () => {
    renderDetail();
    expect(screen.queryByText('Lợi nhuận chuyến')).toBeNull();
  });
});

describe('"Chuẩn bị bàn giao"', () => {
  it('vẽ đúng việc server suy, đếm tiến độ, nút ở cuối dòng', () => {
    renderDetail();
    expect(screen.getByText('Chuẩn bị bàn giao')).toBeTruthy();
    // Xác nhận đơn (luôn xong) · giấy tờ · tiền thuê · cọc · hợp đồng · ảnh — 1/6.
    expect(screen.getByText('1/6 hoàn tất')).toBeTruthy();
    expect(screen.getByText('Chưa có GPLX / CCCD')).toBeTruthy();
    expect(screen.getByText('Ảnh xe trước khi giao (2/5)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tạo' })).toBeTruthy();
  });

  it('tuyến hoa hồng (không có gói Thu chi) không có hai dòng tiền', () => {
    finance.visible = false;
    renderDetail();
    expect(screen.queryByText('Thu tiền thuê')).toBeNull();
    expect(screen.queryByText('Thu cọc tài sản')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Thu tiền' })).toBeNull();
  });

  it('chủ xe cá nhân (không có cờ gói nào) VẪN có dòng hợp đồng thuê xe — SR-245', () => {
    // `useFeature` của mock trả `isVisible: false` cho MỌI cờ, kể cả `contracts`.
    finance.visible = false;
    renderDetail();
    expect(screen.getByText('Chưa tạo hợp đồng')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tạo' })).toBeTruthy();
  });

  it('đánh dấu tay: vòng tròn của việc ngoài-tiền bấm được, việc tiền thì không', () => {
    granted.value = new Set([...granted.value, PERMISSION.HANDOVER_MANAGE]);
    prepCheck.mutate.mockClear();
    renderDetail();
    fireEvent.click(screen.getByLabelText('Đánh dấu “Giấy tờ của khách” đã xong'));
    expect(prepCheck.mutate.mock.calls[0]![0]).toEqual({
      item: HANDOVER_PREP_ITEM.DOCUMENTS,
      checked: true,
    });
    expect(screen.queryByLabelText(/Đánh dấu “Thu tiền thuê”/)).toBeNull();
    expect(screen.queryByLabelText(/Đánh dấu “Thu cọc tài sản”/)).toBeNull();
  });

  it('dấu tay tính vào tiến độ, ghi rõ ai đánh dấu và bỏ được', () => {
    granted.value = new Set([...granted.value, PERMISSION.HANDOVER_MANAGE]);
    prepCheck.mutate.mockClear();
    renderDetail({
      ...BOOKING,
      handoverPrep: {
        ...BOOKING.handoverPrep!,
        manualChecks: [
          {
            item: HANDOVER_PREP_ITEM.DOCUMENTS,
            checkedAt: '2026-09-23T03:20:00.000Z',
            checkedByName: 'Chị Lan',
          },
        ],
      },
    });
    expect(screen.getByText('2/6 hoàn tất')).toBeTruthy();
    expect(screen.getByText(/Đánh dấu tay · Chị Lan/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Bỏ đánh dấu “Giấy tờ của khách”'));
    expect(prepCheck.mutate.mock.calls[0]![0]).toEqual({
      item: HANDOVER_PREP_ITEM.DOCUMENTS,
      checked: false,
    });
  });

  it('ảnh bàn giao không đánh dấu tay được - chỉ xong khi đủ ảnh (26/11/2026)', () => {
    granted.value = new Set([...granted.value, PERMISSION.HANDOVER_MANAGE]);
    renderDetail();
    expect(screen.queryByLabelText(/Đánh dấu “Ảnh bàn giao”/)).toBeNull();
  });

  it('không có quyền soạn bàn giao ⇒ không bấm được vòng tròn', () => {
    granted.value = new Set();
    renderDetail();
    expect(screen.queryByLabelText(/^Đánh dấu “/)).toBeNull();
  });

  it('đơn đã giao xe không còn khối chuẩn bị', () => {
    renderDetail({
      ...BOOKING,
      status: BOOKING_STATUS.ACTIVE,
      actualPickupAt: '2026-09-24T10:05:00.000Z',
      handoverPrep: null,
    });
    expect(screen.queryByText('Chuẩn bị bàn giao')).toBeNull();
  });
});

describe('Stepper', () => {
  it('đơn chờ giao: bước hiện tại là "Chờ giao xe"', () => {
    renderDetail();
    const steps = screen.getByRole('list', { name: 'Tiến trình đơn thuê' });
    expect(within(steps).getByText('Chờ giao xe').closest('li')?.getAttribute('aria-current')).toBe(
      'step',
    );
  });

  it('đơn huỷ: KHÔNG có thanh bước (design "Details - Failed"), banner nói lý do khi có', () => {
    renderDetail({ ...BOOKING, status: BOOKING_STATUS.CANCELLED, handoverPrep: null });
    expect(screen.queryByRole('list', { name: 'Tiến trình đơn thuê' })).toBeNull();
    expect(screen.getByText('Đơn đã huỷ - chuyến không diễn ra.')).toBeTruthy();
    cleanup();

    renderDetail({
      ...BOOKING,
      status: BOOKING_STATUS.CANCELLED,
      handoverPrep: null,
      cancellationReasonCategory: 'other',
      cancellationReason: 'Có việc đột xuất',
    });
    expect(screen.getByText(/Đơn hàng đã huỷ. Lý do: .*Có việc đột xuất./)).toBeTruthy();
  });
});

/**
 * 09/11/2026 — đơn huỷ / khách không đến là chuyến không diễn ra: không còn gì để thu, nên "Thu
 * tiền", ô "Còn phải thu" và hai link ghi tiền của thẻ Phát sinh vắng hẳn (server cũng từ chối —
 * `BOOKING_MONEY_CLOSED`). "Lịch sử thu tiền" vẫn còn để xem và hoàn phần đã thu.
 */
describe('Đơn huỷ / khách không đến: không ghi tiền mới', () => {
  it.each([BOOKING_STATUS.CANCELLED, BOOKING_STATUS.NO_SHOW])(
    '%s: không có Thu tiền, ô còn phải thu',
    (status) => {
      renderDetail({ ...BOOKING, status, handoverPrep: null });
      expect(screen.queryByRole('button', { name: 'Thu tiền' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Lịch sử thu tiền' })).toBeTruthy();
      const card = screen.getByRole('region', { name: 'Thanh toán' });
      expect(within(card).queryByRole('status', { name: /Còn lại \(phải thu\)/ })).toBeNull();
      // Các dòng tiền vẫn là bản ghi của đơn.
      expect(within(card).getByText('Tổng tiền chuyến')).toBeTruthy();
      expect(screen.getByTestId('settlement-card').dataset.moneyClosed).toBe('true');
    },
  );

  it('đơn còn chạy và đơn hoàn tất vẫn thu được', () => {
    renderDetail();
    expect(screen.getByRole('button', { name: 'Thu tiền' })).toBeTruthy();
    expect(screen.getByTestId('settlement-card').dataset.moneyClosed).toBe('false');
    cleanup();

    renderDetail({ ...BOOKING, status: BOOKING_STATUS.COMPLETED, handoverPrep: null });
    expect(screen.getByRole('button', { name: 'Thu tiền' })).toBeTruthy();
    expect(screen.getByTestId('settlement-card').dataset.moneyClosed).toBe('false');
  });
});

describe('Bấm "Xác nhận đã giao xe" khi còn thiếu (Figma 23845:51599)', () => {
  const ctx = (photos: { slot: string; fileId: string }[] = []) => ({
    bookingId: 'BK1',
    vehicleId: 'V1',
    bookingCode: 'XP-001',
    vehicleName: 'Hyundai Grand i10 2019',
    plateNumber: '43A-276.16',
    bookingPickupAt: '2026-09-24T10:00:00.000Z',
    bookingReturnAt: '2026-09-27T10:00:00.000Z',
    vehicleOdometerKm: null,
    pickup: photos.length > 0 ? { id: 'H1', rowVersion: 2, photos, confirmedAt: null } : null,
    return: null,
    canStartPickup: true,
    canStartReturn: false,
  });

  it('cảnh báo + nháy viền chỗ thiếu; "Vẫn tiếp tục" mới mở hộp xác nhận', async () => {
    granted.value = new Set([
      ...granted.value,
      PERMISSION.HANDOVER_VIEW,
      PERMISSION.HANDOVER_CONFIRM,
    ]);
    handoverCtx.value = ctx();
    renderDetail();

    fireEvent.click(screen.getByRole('button', { name: /Xác nhận đã giao xe/ }));
    expect(await screen.findByText('Có thông tin chưa bổ sung')).toBeTruthy();
    // Giấy tờ · tiền thuê · cọc · hợp đồng · ảnh còn thiếu + đủ 5 góc ảnh trống.
    expect(document.querySelectorAll('li[data-flagged]').length).toBe(5);
    expect(document.querySelectorAll('[data-slot][data-flagged]').length).toBe(5);
    expect(screen.queryByRole('heading', { name: 'Sẵn sàng giao xe' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Vẫn tiếp tục' }));
    expect(await screen.findByRole('heading', { name: 'Sẵn sàng giao xe' })).toBeTruthy();
    expect(document.querySelectorAll('[data-flagged]').length).toBe(0);
  });

  it('đủ hết thì mở thẳng hộp xác nhận, không cảnh báo', async () => {
    granted.value = new Set([
      PERMISSION.BOOKING_VIEW,
      PERMISSION.HANDOVER_VIEW,
      PERMISSION.HANDOVER_CONFIRM,
    ]);
    handoverCtx.value = ctx(
      ['front', 'rear', 'left', 'right', 'odometer'].map((slot) => ({ slot, fileId: `f-${slot}` })),
    );
    renderDetail({
      ...BOOKING,
      handoverPrep: {
        ...BOOKING.handoverPrep!,
        documentsReady: true,
        pickupPhotoCount: 5,
      },
    });

    fireEvent.click(screen.getByRole('button', { name: /Xác nhận đã giao xe/ }));
    expect(await screen.findByRole('heading', { name: 'Sẵn sàng giao xe' })).toBeTruthy();
    expect(screen.queryByText('Có thông tin chưa bổ sung')).toBeNull();
  });
});
