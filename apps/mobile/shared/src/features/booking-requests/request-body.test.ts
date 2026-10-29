import { PICKUP_PREFERENCE, ROUTE_TYPE, SERVICE_TYPE } from '@xeprime/types';
import type { BookingRequestFormValues } from './booking-schema';
import { toRequestBody } from './request-body';

/** Mặc định của bài test: không mã khuyến mãi, ô đồng ý PHỦ điều khoản chủ xe (xe có điều khoản). */
function bodyOf(...args: [Parameters<typeof toRequestBody>[0], (string | null)?, boolean?]) {
  const [values, promoCode = null, coversHostTerms = true] = args;
  return toRequestBody(values, promoCode, coversHostTerms);
}

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
    customerName: '',
    customerPhone: '',
    acceptedTerms: false,
    vehicleProtectionSelected: false,
    personalAccidentSelected: false,
    ...overrides,
  } as BookingRequestFormValues;
}

/**
 * Bốn luật của backend mà không luật nào hiện thành lỗi biên dịch nếu làm sai — đó là lý do
 * chúng có test riêng thay vì chỉ có một docblock.
 */
describe('toRequestBody', () => {
  it('KHÔNG mang danh tính người thuê hay client/device — server đọc từ tài khoản (ADR 0060)', () => {
    const body = bodyOf(values());
    for (const key of ['customerName', 'customerPhone', 'customerEmail', 'client', 'device']) {
      expect(body).not.toHaveProperty(key);
    }
  });

  it('không bao giờ mang tenantId — server suy từ xe', () => {
    expect(bodyOf(values())).not.toHaveProperty('tenantId');
  });

  it('không có trường OTP nào — xác thực SĐT xảy ra TRƯỚC, server tự tra', () => {
    const body = bodyOf(values()) as Record<string, unknown>;
    for (const key of Object.keys(body)) {
      expect(key.toLowerCase()).not.toContain('otp');
      expect(key.toLowerCase()).not.toContain('code');
      expect(key.toLowerCase()).not.toContain('token');
    }
  });

  it('dịch vụ theo ngày gửi khoảng nhận–trả', () => {
    const body = bodyOf(values());
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
      const body = bodyOf(longTerm);
      expect(body).not.toHaveProperty('pickupAt');
      expect(body).not.toHaveProperty('returnAt');
    });

    it('gửi gói + nguyện vọng; "trong 7 ngày tới" KHÔNG kèm ngày cụ thể', () => {
      const body = bodyOf(longTerm);
      expect(body.longTermPackageMonths).toBe(6);
      expect(body.pickupPreference).toBe(PICKUP_PREFERENCE.WITHIN_7_DAYS);
      expect(body).not.toHaveProperty('requestedPickupDate');
    });

    it('chọn ngày cụ thể thì kèm ngày đó', () => {
      const body = bodyOf(
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
      const body = bodyOf(
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
      const body = bodyOf(
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
      const body = bodyOf(
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
    expect(bodyOf(values())).not.toHaveProperty('deliveryRequested');

    const body = bodyOf(
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
    const body = bodyOf(values());
    expect(body).not.toHaveProperty('note');
    expect(body).not.toHaveProperty('acceptedTerms');
  });

  it('bảo hiểm MIC chỉ gửi khi khách tích — như web #213', () => {
    expect(bodyOf(values())).not.toHaveProperty('vehicleProtectionSelected');
    expect(bodyOf(values())).not.toHaveProperty('personalAccidentSelected');
    const body = bodyOf(values({ vehicleProtectionSelected: true, personalAccidentSelected: true }));
    expect(body.vehicleProtectionSelected).toBe(true);
    expect(body.personalAccidentSelected).toBe(true);
  });

  it('đã tick điều khoản chủ xe thì gửi acceptedTerms: true — như web', () => {
    expect(bodyOf(values({ acceptedTerms: true })).acceptedTerms).toBe(true);
  });

  it('ô đồng ý KHÔNG phủ điều khoản chủ xe (xe không có điều khoản) ⇒ không gửi acceptedTerms', () => {
    expect(bodyOf(values({ acceptedTerms: true }), null, false)).not.toHaveProperty(
      'acceptedTerms',
    );
  });

  it('lời nhắn cắt khoảng trắng; chỉ toàn khoảng trắng thì không gửi', () => {
    expect(bodyOf(values({ note: '  cần ghế trẻ em  ' })).note).toBe('cần ghế trẻ em');
    expect(bodyOf(values({ note: '   ' }))).not.toHaveProperty('note');
  });
});
