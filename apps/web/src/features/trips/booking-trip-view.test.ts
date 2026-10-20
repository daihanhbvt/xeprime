import { describe, expect, it } from 'vitest';
import { PICKUP_PREFERENCE, ROUTE_TYPE, SERVICE_TYPE } from '@xeprime/types';
import { tripEstimateBreakdown, tripToBookingTrip } from './booking-trip-view';
import type { CustomerTripDetail, CustomerTripEstimate } from './types';

/**
 * Chuyến đã gửi → thẻ "Thông tin chuyến đi" của luồng đặt xe. Chỗ dễ sai nhất là MÚI GIỜ (thẻ đọc
 * mặt đồng hồ giờ VN), chế độ theo giờ/theo ngày (không lưu trên yêu cầu) và khoảng "nhận trong 7
 * ngày" (phải là khoảng server đã chốt, không phải tính lại từ hôm nay).
 */
const BASE = {
  serviceType: SERVICE_TYPE.SELF_DRIVE,
  routeType: null,
  pickupAt: '2026-10-05T00:00:00.000Z',
  returnAt: '2026-10-07T00:00:00.000Z',
  longTermPackageMonths: null,
  pickupPreference: null,
  requestedPickupDate: null,
  pickupWindowStartDate: null,
  pickupWindowEndDate: null,
  deliveryRequested: false,
  deliveryAddress: null,
  pickupAddress: null,
  destination: null,
} as unknown as CustomerTripDetail;

describe('tripToBookingTrip', () => {
  it('mốc UTC của server → mặt đồng hồ giờ Việt Nam', () => {
    const trip = tripToBookingTrip(BASE);
    expect(trip.pickupAt?.format('DD/MM/YYYY HH:mm')).toBe('05/10/2026 07:00');
    expect(trip.returnAt?.format('DD/MM/YYYY HH:mm')).toBe('07/10/2026 07:00');
  });

  it('trọn ngày ⇒ thuê theo ngày; chưa trọn một ngày ⇒ thuê theo giờ', () => {
    expect(tripToBookingTrip(BASE).rentalMode).toBe('daily');
    expect(
      tripToBookingTrip({ ...BASE, returnAt: '2026-10-05T05:00:00.000Z' }).rentalMode,
    ).toBe('hourly');
  });

  it('dài hạn: giữ khoảng nhận xe server đã chốt và tính ngày trả theo THÁNG LỊCH', () => {
    const trip = tripToBookingTrip({
      ...BASE,
      serviceType: SERVICE_TYPE.LONG_TERM,
      pickupAt: null,
      returnAt: null,
      longTermPackageMonths: 3,
      pickupPreference: PICKUP_PREFERENCE.SPECIFIC_DATE,
      requestedPickupDate: '2026-01-31',
      pickupWindowStartDate: '2026-01-20',
      pickupWindowEndDate: '2026-01-27',
    });
    expect(trip.pickupWindow).toEqual({ start: '2026-01-20', end: '2026-01-27' });
    expect(trip.requestedPickupDate?.format('YYYY-MM-DD')).toBe('2026-01-31');
    // 31/01 + 3 tháng lịch = 30/04 (tháng 4 không có ngày 31) — không phải 31/01 + 90 ngày.
    expect(trip.expectedReturnDate?.format('YYYY-MM-DD')).toBe('2026-04-30');
  });

  it('chuyến không có lịch / không phải dài hạn ⇒ không bịa ngày', () => {
    const trip = tripToBookingTrip({ ...BASE, pickupAt: null, returnAt: null });
    expect(trip.pickupAt).toBeNull();
    expect(trip.expectedReturnDate).toBeNull();
    expect(trip.pickupWindow).toBeNull();
    expect(trip.rentalMode).toBe('daily');
  });

  it('hình thức nhận xe đi nguyên từ chuyến', () => {
    const trip = tripToBookingTrip({
      ...BASE,
      serviceType: SERVICE_TYPE.WITH_DRIVER,
      routeType: ROUTE_TYPE.INTER_CITY_ONE_WAY,
      pickupAddress: '1 Lê Lợi, Quận 1',
      destination: 'Vũng Tàu',
      deliveryRequested: false,
    });
    expect(trip.routeType).toBe(ROUTE_TYPE.INTER_CITY_ONE_WAY);
    expect(trip.driverPickupAddress).toBe('1 Lê Lợi, Quận 1');
    expect(trip.destination).toBe('Vũng Tàu');
    expect(trip.isDelivery).toBe(false);
  });
});

describe('tripEstimateBreakdown', () => {
  it('tổng giá THUÊ đi vào `totalAmount`, phụ phí giữ nguyên ở `fees`', () => {
    const estimate = {
      rows: [],
      rentalTotal: '1740000',
      depositAmount: '3000000',
      fees: { customerTotalAmount: '1827000', holdAmount: '500000' },
    } as unknown as CustomerTripEstimate;
    expect(tripEstimateBreakdown(estimate)).toEqual({
      rows: [],
      totalAmount: '1740000',
      depositAmount: '3000000',
      fees: estimate.fees,
      estimateNote: null,
      longTerm: null,
    });
  });

  it('báo giá còn TẠM TÍNH ⇒ giữ ghi chú của server, thẻ không gọi nó là giá chốt', () => {
    const estimate = {
      rows: [],
      rentalTotal: '2000000',
      depositAmount: '0',
      fees: null,
      estimateNote: 'Giá lộ trình chưa niêm yết',
    } as unknown as CustomerTripEstimate;
    expect(tripEstimateBreakdown(estimate).estimateNote).toBe('Giá lộ trình chưa niêm yết');
  });
});
