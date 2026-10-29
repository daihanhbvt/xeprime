import { PICKUP_PREFERENCE, ROUTE_TYPE, SERVICE_TYPE } from '@xeprime/types';
import { buildBookingRequestSchema, type BookingRequestSchemaLabels } from './booking-schema';

/** Nhãn = tên khoá, để bài kiểm đọc ra ĐÚNG câu nào được chọn mà không phụ thuộc bản dịch. */
const LABELS = new Proxy({} as BookingRequestSchemaLabels, {
  get: (_target, key) => String(key),
});

const schema = buildBookingRequestSchema(LABELS);

const BASE = {
  serviceType: SERVICE_TYPE.SELF_DRIVE,
  pickupAt: '2026-10-01T02:00:00.000Z',
  returnAt: '2026-10-03T02:00:00.000Z',
  longTermPackageMonths: null,
  pickupPreference: PICKUP_PREFERENCE.WITHIN_7_DAYS,
  requestedPickupDate: '',
  routeType: ROUTE_TYPE.IN_CITY,
  pickupAddressLine: '',
  destination: '',
  deliveryRequested: false,
  deliveryAddressLine: '',
  note: '',
  // Liên hệ của chuyến (ADR 0063) — màn điền sẵn từ tài khoản.
  customerName: 'Nguyễn Văn An',
  customerPhone: '0901234567',
};

async function firstError(values: Record<string, unknown>): Promise<string | null> {
  try {
    await schema.validate({ ...BASE, ...values });
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

/* Cùng bộ ràng buộc với `requestFormSchema` bên web (`apps/web/src/features/booking-requests/schema.ts`). */
describe('buildBookingRequestSchema — khớp schema web', () => {
  it('hợp lệ với giá trị mặc định mà web chọn sẵn (7 ngày · nội thành)', async () => {
    expect(await firstError({})).toBeNull();
  });

  it('địa chỉ giao xe / đón chỉ có CHỮ, không toạ độ ("dùng đúng địa chỉ đã nhập") vẫn hợp lệ — ADR 0061 điều 6', async () => {
    expect(
      await firstError({
        deliveryRequested: true,
        deliveryAddressLine: '12 Hẻm 34 Nguyễn Trãi',
        deliveryLatitude: null,
        deliveryLongitude: null,
      }),
    ).toBeNull();
    expect(
      await firstError({
        serviceType: SERVICE_TYPE.WITH_DRIVER,
        pickupAddressLine: '12 Hẻm 34 Nguyễn Trãi',
        pickupLatitude: null,
        pickupLongitude: null,
      }),
    ).toBeNull();
    // Chữ vẫn bắt buộc.
    expect(await firstError({ deliveryRequested: true, deliveryAddressLine: '' })).toBe(
      'deliveryAddressRequired',
    );
  });

  it('trả xe phải SAU nhận xe (`after-pickup`)', async () => {
    expect(await firstError({ returnAt: '2026-10-01T02:00:00.000Z' })).toBe('returnAfterPickup');
    expect(await firstError({ returnAt: '2026-09-30T02:00:00.000Z' })).toBe('returnAfterPickup');
  });

  it('địa chỉ và điểm đến quá dài có câu riêng, không rơi về câu tiếng Anh của yup', async () => {
    expect(
      await firstError({
        serviceType: SERVICE_TYPE.WITH_DRIVER,
        pickupAddressLine: 'x'.repeat(256),
      }),
    ).toBe('addressLineMax');
    expect(
      await firstError({
        serviceType: SERVICE_TYPE.WITH_DRIVER,
        routeType: ROUTE_TYPE.INTER_CITY,
        pickupAddressLine: '12 Lê Lợi',
        destination: 'x'.repeat(501),
      }),
    ).toBe('destinationMax');
  });
});

describe('liên hệ của chuyến (ADR 0063)', () => {
  it('bắt buộc họ tên và SĐT', async () => {
    await expect(schema.validate({ ...BASE, customerName: '  ' })).rejects.toThrow(
      'customerNameRequired',
    );
    await expect(schema.validate({ ...BASE, customerPhone: '' })).rejects.toThrow(
      'customerPhoneRequired',
    );
  });

  it('SĐT sai định dạng bị từ chối; dấu cách/chấm chép từ danh bạ được bỏ', async () => {
    await expect(schema.validate({ ...BASE, customerPhone: '12345' })).rejects.toThrow(
      'customerPhoneFormat',
    );
    const ok = await schema.validate({ ...BASE, customerPhone: '0901.234 567' });
    expect(ok.customerPhone).toBe('0901234567');
  });
});
