import { PICKUP_PREFERENCE, ROUTE_TYPE, SERVICE_TYPE } from '@xeprime/types';
import type { BookingRequestFormValues } from './booking-schema';
import { toRequestBody } from './request-body';

function values(overrides: Partial<BookingRequestFormValues> = {}): BookingRequestFormValues {
  return {
    serviceType: SERVICE_TYPE.SELF_DRIVE,
    pickupAt: '2026-09-01T03:00:00.000Z',
    returnAt: '2026-09-03T03:00:00.000Z',
    longTermPackageMonths: null,
    pickupPreference: null,
    requestedPickupDate: '',
    routeType: null,
    pickupProvinceCode: '',
    pickupWardCode: '',
    pickupAddressLine: '',
    pickupPlaceId: null,
    pickupLatitude: null,
    pickupLongitude: null,
    pickupLocationSource: null,
    destination: '',
    deliveryRequested: false,
    deliveryProvinceCode: '',
    deliveryWardCode: '',
    deliveryAddressLine: '',
    deliveryPlaceId: null,
    deliveryLatitude: null,
    deliveryLongitude: null,
    deliveryLocationSource: null,
    note: '',
    acceptedTerms: false,
    ...overrides,
  } as BookingRequestFormValues;
}

/**
 * Bốn luật của backend mà không luật nào hiện thành lỗi biên dịch nếu làm sai — đó là lý do
 * chúng có test riêng thay vì chỉ có một docblock.
 */
describe('toRequestBody', () => {
  it('KHÔNG mang danh tính người thuê hay client/device — server đọc từ tài khoản (ADR 0060)', () => {
    const body = toRequestBody(values());
    for (const key of ['customerName', 'customerPhone', 'customerEmail', 'client', 'device']) {
      expect(body).not.toHaveProperty(key);
    }
  });

  it('không bao giờ mang tenantId — server suy từ xe', () => {
    expect(toRequestBody(values())).not.toHaveProperty('tenantId');
  });

  it('không có trường OTP nào — xác thực SĐT xảy ra TRƯỚC, server tự tra', () => {
    const body = toRequestBody(values()) as Record<string, unknown>;
    for (const key of Object.keys(body)) {
      expect(key.toLowerCase()).not.toContain('otp');
      expect(key.toLowerCase()).not.toContain('code');
      expect(key.toLowerCase()).not.toContain('token');
    }
  });

  it('dịch vụ theo ngày gửi khoảng nhận–trả', () => {
    const body = toRequestBody(values());
    expect(body.pickupAt).toBe('2026-09-01T03:00:00.000Z');
    expect(body.returnAt).toBe('2026-09-03T03:00:00.000Z');
    expect(body).not.toHaveProperty('longTermPackageMonths');
  });

  describe('thuê dài hạn (ADR 0011)', () => {
    const longTerm = values({
      serviceType: SERVICE_TYPE.LONG_TERM,
      longTermPackageMonths: 6,
      pickupPreference: PICKUP_PREFERENCE.WITHIN_7_DAYS,
    });

    it('KHÔNG gửi pickupAt/returnAt dù form còn giá trị cũ', () => {
      const body = toRequestBody(longTerm);
      expect(body).not.toHaveProperty('pickupAt');
      expect(body).not.toHaveProperty('returnAt');
    });

    it('gửi gói + nguyện vọng; "trong 7 ngày tới" KHÔNG kèm ngày cụ thể', () => {
      const body = toRequestBody(longTerm);
      expect(body.longTermPackageMonths).toBe(6);
      expect(body.pickupPreference).toBe(PICKUP_PREFERENCE.WITHIN_7_DAYS);
      expect(body).not.toHaveProperty('requestedPickupDate');
    });

    it('chọn ngày cụ thể thì kèm ngày đó', () => {
      const body = toRequestBody(
        values({
          serviceType: SERVICE_TYPE.LONG_TERM,
          longTermPackageMonths: 3,
          pickupPreference: PICKUP_PREFERENCE.SPECIFIC_DATE,
          requestedPickupDate: '2026-09-15',
        }),
      );
      expect(body.requestedPickupDate).toBe('2026-09-15');
    });
  });

  describe('xe có tài xế', () => {
    it('nội thành: có địa chỉ đón, KHÔNG có điểm đến (lộ trình tự do)', () => {
      const body = toRequestBody(
        values({
          serviceType: SERVICE_TYPE.WITH_DRIVER,
          routeType: ROUTE_TYPE.IN_CITY,
          pickupProvinceCode: '79',
          pickupWardCode: '27301',
          pickupAddressLine: '12 Nguyễn Huệ',
          destination: 'Đà Lạt',
        }),
      );
      // Gửi MÃ + phần chi tiết; chuỗi hiển thị do server ghép (ADR 0035 điều 3).
      expect(body.pickupProvinceCode).toBe('79');
      expect(body.pickupWardCode).toBe('27301');
      expect(body.pickupAddressLine).toBe('12 Nguyễn Huệ');
      expect(body).not.toHaveProperty('pickupAddress');
      expect(body).not.toHaveProperty('destination');
    });

    it('liên tỉnh: kèm điểm đến', () => {
      const body = toRequestBody(
        values({
          serviceType: SERVICE_TYPE.WITH_DRIVER,
          routeType: ROUTE_TYPE.INTER_CITY,
          pickupProvinceCode: '79',
          pickupWardCode: '27301',
          pickupAddressLine: '12 Nguyễn Huệ',
          destination: 'Đà Lạt',
        }),
      );
      expect(body.destination).toBe('Đà Lạt');
    });

    it('KHÔNG kèm giao tận nơi — xe đã đến đón thì không có khái niệm giao xe', () => {
      const body = toRequestBody(
        values({
          serviceType: SERVICE_TYPE.WITH_DRIVER,
          routeType: ROUTE_TYPE.IN_CITY,
          pickupProvinceCode: '79',
          pickupWardCode: '27301',
          pickupAddressLine: '12 Nguyễn Huệ',
          deliveryRequested: true,
          deliveryProvinceCode: '46',
          deliveryWardCode: '19789',
          deliveryAddressLine: '5 Lê Lợi',
        }),
      );
      expect(body).not.toHaveProperty('deliveryRequested');
      expect(body).not.toHaveProperty('deliveryProvinceCode');
      expect(body).not.toHaveProperty('deliveryAddressLine');
    });
  });

  it('giao tận nơi chỉ gửi khi khách thực sự chọn', () => {
    expect(toRequestBody(values())).not.toHaveProperty('deliveryRequested');

    const body = toRequestBody(
      values({
        deliveryRequested: true,
        deliveryProvinceCode: '46',
        deliveryWardCode: '19789',
        deliveryAddressLine: '5 Lê Lợi',
      }),
    );
    expect(body.deliveryRequested).toBe(true);
    expect(body.deliveryProvinceCode).toBe('46');
    expect(body.deliveryWardCode).toBe('19789');
    expect(body.deliveryAddressLine).toBe('5 Lê Lợi');
    expect(body).not.toHaveProperty('deliveryAddress');
  });

  it('trường rỗng không đi lên dây', () => {
    const body = toRequestBody(values());
    expect(body).not.toHaveProperty('note');
    expect(body).not.toHaveProperty('acceptedTerms');
  });

  it('đã tick điều khoản chủ xe thì gửi acceptedTerms: true — như web', () => {
    expect(toRequestBody(values({ acceptedTerms: true })).acceptedTerms).toBe(true);
  });
});
