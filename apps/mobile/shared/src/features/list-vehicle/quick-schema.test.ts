import { VEHICLE_IMAGE_TYPE, VEHICLE_PUBLIC_MIN_IMAGES, VEHICLE_TYPE } from '@xeprime/types';
import { ValidationError } from 'yup';
import { QUICK_VEHICLE_DEFAULTS, missingEnergyFields, quickVehicleSchema } from './quick-schema';
import type { QuickVehicleValues } from './quick-schema';

/** Lỗi theo path — `abortEarly: false` để thấy MỌI lỗi một lượt. */
function errorsOf(values: QuickVehicleValues): Record<string, string> {
  try {
    quickVehicleSchema.validateSync(values, { abortEarly: false });
    return {};
  } catch (err) {
    const out: Record<string, string> = {};
    for (const inner of (err as ValidationError).inner) {
      if (inner.path && !(inner.path in out)) out[inner.path] = inner.message;
    }
    return out;
  }
}

const URLS = Array.from({ length: VEHICLE_PUBLIC_MIN_IMAGES }, (_, i) => `https://cdn.test/${i}.jpg`);

describe('quickVehicleSchema — điều kiện lên chợ (như web)', () => {
  it('bắt buộc biển số, hãng, dòng xe, năm, số chỗ (ô tô) và ảnh đại diện', () => {
    const errors = errorsOf({ ...QUICK_VEHICLE_DEFAULTS, vehicleType: VEHICLE_TYPE.CAR });
    expect(errors.plateNumber).toBe('plateNumberRequired');
    expect(errors.brand).toBe('brandRequired');
    expect(errors.vehicleCatalogModelId).toBe('modelRequired');
    expect(errors.manufactureYear).toBe('manufactureYearRequired');
    expect(errors.seatCount).toBe('seatCountRequired');
    expect(errors.mainImageUrl).toBe('mainImageRequired');
  });

  it('xe máy đòi phân khúc, không đòi số chỗ', () => {
    const errors = errorsOf({ ...QUICK_VEHICLE_DEFAULTS, vehicleType: VEHICLE_TYPE.MOTORBIKE });
    expect(errors.motorbikeCategory).toBe('motorbikeCategoryRequired');
    expect(errors.seatCount).toBeUndefined();
  });

  it(`photosMin gắn vào 'media' khi chưa đủ ${VEHICLE_PUBLIC_MIN_IMAGES} ảnh khác nhau`, () => {
    const errors = errorsOf({ ...QUICK_VEHICLE_DEFAULTS, mainImageUrl: URLS[0]! });
    expect(errors.media).toBe(`photosMin::${JSON.stringify({ min: VEHICLE_PUBLIC_MIN_IMAGES })}`);
  });

  it('đếm ảnh đại diện ∪ images ∪ media, khử trùng theo URL', () => {
    const values: QuickVehicleValues = {
      ...QUICK_VEHICLE_DEFAULTS,
      mainImageUrl: URLS[0]!,
      images: [URLS[0]!],
      media: URLS.slice(1).map((url) => ({ url, type: VEHICLE_IMAGE_TYPE.OTHER })),
    };
    expect(errorsOf(values).media).toBeUndefined();
  });

  it('mặc định có bodyType null và media rỗng', () => {
    expect(QUICK_VEHICLE_DEFAULTS.bodyType).toBeNull();
    expect(QUICK_VEHICLE_DEFAULTS.media).toEqual([]);
  });
});

describe('missingEnergyFields', () => {
  it('đòi dung tích động cơ khi ma trận năng lượng yêu cầu', () => {
    const missing = missingEnergyFields({
      ...QUICK_VEHICLE_DEFAULTS,
      vehicleType: VEHICLE_TYPE.MOTORBIKE,
      fuelType: 'gasoline' as never,
    });
    expect(missing).toContain('engineDisplacementCc');
  });
});
