import { App } from 'antd';
import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { BOOKING_STATUS, PERMISSION, SERVICE_TYPE } from '@xeprime/types';
import viMessages from '../../../../messages/vi';
import type { BookingDetail } from '../types';
import { BookingDetailContent } from './BookingDetailContent';

const query = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  isError: false,
  error: undefined as unknown,
  refetch: vi.fn(),
}));

vi.mock('../hooks/use-booking', () => ({ useBooking: () => query }));
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (permission: string) => permission === PERMISSION.BOOKING_VIEW,
    hasAny: () => false,
    isLoading: false,
  }),
}));
vi.mock('./BookingActionBar', () => ({ BookingActionBar: () => null }));
vi.mock('./BookingDriverSection', () => ({ BookingDriverSection: () => null }));
vi.mock('./BookingOperationPanel', () => ({ BookingOperationPanel: () => null }));
vi.mock('@/features/settlement/components/SettlementCard', () => ({ SettlementCard: () => null }));

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
  longTermPackageMonths: null,
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
  priceSnapshot: null,
  customerTotalAmount: '477360',
  holdPaidAmount: '102960',
  payAtPickupAmount: '374400',
  actualPickupAt: null,
  actualReturnAt: null,
  note: null,
  updatedAt: '2026-09-18T07:44:00.000Z',
};

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

describe('BookingDetailContent — khoản giữ chỗ qua XePrime', () => {
  it('hiện số khách đã giữ chỗ và số còn trả chủ xe trên đơn đã duyệt', () => {
    renderDetail();

    const plan = screen.getByRole('region', { name: 'Thanh toán giữ chỗ' });
    expect(within(plan).getByText('Tổng khách trả')).toBeTruthy();
    expect(plan.textContent).toContain('477.360');
    expect(within(plan).getByText('Đã giữ chỗ qua XePrime')).toBeTruthy();
    expect(plan.textContent).toContain('102.960');
    expect(within(plan).getByText('Còn trả chủ xe khi nhận xe')).toBeTruthy();
    expect(plan.textContent).toContain('374.400');
  });

  it('đơn lập tay không có hold thì không hiện khối giữ chỗ', () => {
    renderDetail({
      ...BOOKING,
      customerTotalAmount: null,
      holdPaidAmount: null,
      payAtPickupAmount: null,
    });

    expect(screen.queryByRole('region', { name: 'Thanh toán giữ chỗ' })).toBeNull();
  });
});
