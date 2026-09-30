import { PICKUP_PREFERENCE, ROUTE_TYPE, SERVICE_TYPE } from '@xeprime/types';
import { buildBookingRequestSchema, type BookingRequestSchemaLabels } from './booking-schema';

/** Nhãn = tên khoá, để bài kiểm đọc ra ĐÚNG câu nào được chọn mà không phụ thuộc bản dịch. */
const LABELS = new Proxy({} as BookingRequestSchemaLabels, {
  get: (_target, key) => String(key),
});

const schema = buildBookingRequestSchema(LABELS, { canConfirmLocation: false });

const BASE = {
  customerName: 'Nguyễn Văn An',
  customerPhone: '0901234567',
  customerEmail: '',
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
