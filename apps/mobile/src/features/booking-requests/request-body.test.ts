import { PICKUP_PREFERENCE, ROUTE_TYPE, SERVICE_TYPE } from '@xeprime/types';
import type { BookingRequestFormValues } from './booking-schema';
import { toRequestBody } from './request-body';

const DEVICE = { devicePlatform: 'android', deviceName: 'Pixel 8' };

function values(overrides: Partial<BookingRequestFormValues> = {}): BookingRequestFormValues {
  return {
    customerName: '  Nguyễn Văn A  ',
    customerPhone: ' 0901234567 ',
    customerEmail: '',
    serviceType: SERVICE_TYPE.SELF_DRIVE,
    pickupAt: '2026-09-01T03:00:00.000Z',
    returnAt: '2026-09-03T03:00:00.000Z',
    longTermPackageMonths: null,
    pickupPreference: null,
    requestedPickupDate: '',
    routeType: null,
    pickupAddress: '',
    destination: '',
    deliveryRequested: false,
    deliveryAddress: '',
    note: '',
    ...overrides,
  } as BookingRequestFormValues;
}

/**
 * Bốn luật của backend mà không luật nào hiện thành lỗi biên dịch nếu làm sai — đó là lý do
 * chúng có test riêng thay vì chỉ có một docblock.
 */
describe('toRequestBody', () => {
  it('LUÔN gửi client native + device — thiếu nó là phiên vừa cấp rơi vào hư không', () => {
    const body = toRequestBody(values(), DEVICE);
    expect(body.client).toBe('native');
    expect(body.device).toEqual(DEVICE);
  });

  it('không bao giờ mang tenantId — server suy từ xe', () => {
    expect(toRequestBody(values(), DEVICE)).not.toHaveProperty('tenantId');
  });

  it('không có trường OTP nào — xác thực SĐT xảy ra TRƯỚC, server tự tra', () => {
    const body = toRequestBody(values(), DEVICE) as Record<string, unknown>;
    for (const key of Object.keys(body)) {
      expect(key.toLowerCase()).not.toContain('otp');
      expect(key.toLowerCase()).not.toContain('code');
      expect(key.toLowerCase()).not.toContain('token');
    }
  });

  it('cắt khoảng trắng ở tên và SĐT', () => {
    const body = toRequestBody(values(), DEVICE);
    expect(body.customerName).toBe('Nguyễn Văn A');
    expect(body.customerPhone).toBe('0901234567');
  });

  it('dịch vụ theo ngày gửi khoảng nhận–trả', () => {
    const body = toRequestBody(values(), DEVICE);
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
      const body = toRequestBody(longTerm, DEVICE);
      expect(body).not.toHaveProperty('pickupAt');
      expect(body).not.toHaveProperty('returnAt');
    });

    it('gửi gói + nguyện vọng; "trong 7 ngày tới" KHÔNG kèm ngày cụ thể', () => {
      const body = toRequestBody(longTerm, DEVICE);
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
        DEVICE,
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
          pickupAddress: '12 Nguyễn Huệ',
          destination: 'Đà Lạt',
        }),
        DEVICE,
      );
      expect(body.pickupAddress).toBe('12 Nguyễn Huệ');
      expect(body).not.toHaveProperty('destination');
    });

    it('liên tỉnh: kèm điểm đến', () => {
      const body = toRequestBody(
        values({
          serviceType: SERVICE_TYPE.WITH_DRIVER,
          routeType: ROUTE_TYPE.INTER_CITY,
          pickupAddress: '12 Nguyễn Huệ',
          destination: 'Đà Lạt',
        }),
        DEVICE,
      );
      expect(body.destination).toBe('Đà Lạt');
    });

    it('KHÔNG kèm giao tận nơi — xe đã đến đón thì không có khái niệm giao xe', () => {
      const body = toRequestBody(
        values({
          serviceType: SERVICE_TYPE.WITH_DRIVER,
          routeType: ROUTE_TYPE.IN_CITY,
          pickupAddress: '12 Nguyễn Huệ',
          deliveryRequested: true,
          deliveryAddress: '5 Lê Lợi',
        }),
        DEVICE,
      );
      expect(body).not.toHaveProperty('deliveryRequested');
      expect(body).not.toHaveProperty('deliveryAddress');
    });
  });

  it('giao tận nơi chỉ gửi khi khách thực sự chọn', () => {
    expect(toRequestBody(values(), DEVICE)).not.toHaveProperty('deliveryRequested');

    const body = toRequestBody(
      values({ deliveryRequested: true, deliveryAddress: '5 Lê Lợi' }),
      DEVICE,
    );
    expect(body.deliveryRequested).toBe(true);
    expect(body.deliveryAddress).toBe('5 Lê Lợi');
  });

  it('trường rỗng không đi lên dây', () => {
    const body = toRequestBody(values(), DEVICE);
    expect(body).not.toHaveProperty('customerEmail');
    expect(body).not.toHaveProperty('note');
  });
});
