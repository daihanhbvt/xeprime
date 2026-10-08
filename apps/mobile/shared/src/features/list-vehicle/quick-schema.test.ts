import { VEHICLE_IMAGE_TYPE, VEHICLE_TYPE } from '@xeprime/types';
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

const url = (n: number) => `https://cdn.test/${n}.jpg`;

/** Đủ năm góc ảnh bắt buộc của ô tô. */
const CAR_MEDIA = [
  { url: url(1), type: VEHICLE_IMAGE_TYPE.FRONT },
  { url: url(2), type: VEHICLE_IMAGE_TYPE.REAR },
  { url: url(3), type: VEHICLE_IMAGE_TYPE.LEFT },
  { url: url(4), type: VEHICLE_IMAGE_TYPE.RIGHT },
  { url: url(5), type: VEHICLE_IMAGE_TYPE.INTERIOR },
];

describe('quickVehicleSchema — điều kiện lên chợ (như web)', () => {
  it('bắt buộc biển số, hãng, dòng xe, năm, số chỗ (ô tô)', () => {
    const errors = errorsOf({ ...QUICK_VEHICLE_DEFAULTS, vehicleType: VEHICLE_TYPE.CAR });
    expect(errors.plateNumber).toBe('plateNumberRequired');
    expect(errors.brand).toBe('brandRequired');
    expect(errors.vehicleCatalogModelId).toBe('modelRequired');
    expect(errors.manufactureYear).toBe('manufactureYearRequired');
    expect(errors.seatCount).toBe('seatCountRequired');
  });

  it('xe máy đòi phân khúc, không đòi số chỗ', () => {
    const errors = errorsOf({ ...QUICK_VEHICLE_DEFAULTS, vehicleType: VEHICLE_TYPE.MOTORBIKE });
    expect(errors.motorbikeCategory).toBe('motorbikeCategoryRequired');
    expect(errors.seatCount).toBeUndefined();
  });

  it("ô tô thiếu ảnh nội thất: lỗi gắn vào 'media', đếm theo GÓC", () => {
    const errors = errorsOf({ ...QUICK_VEHICLE_DEFAULTS, media: CAR_MEDIA.slice(0, 4) });
    expect(errors.media).toBe(`photosRequired::${JSON.stringify({ count: 1 })}`);
  });

  it('ô tô đủ năm góc: không còn lỗi ảnh', () => {
    expect(errorsOf({ ...QUICK_VEHICLE_DEFAULTS, media: CAR_MEDIA }).media).toBeUndefined();
  });

  /*
   * Năm tấm ảnh "khác" KHÔNG thay được năm góc — đây chính là lỗ mà phép đếm cũ (tối thiểu 4 URL
   * khác nhau) để ngỏ.
   */
  it('năm ảnh loại "khác": vẫn thiếu đủ năm góc', () => {
    const media = [1, 2, 3, 4, 5].map((n) => ({ url: url(n), type: VEHICLE_IMAGE_TYPE.OTHER }));
    expect(errorsOf({ ...QUICK_VEHICLE_DEFAULTS, media }).media).toBe(
      `photosRequired::${JSON.stringify({ count: 5 })}`,
    );
  });

  it('xe máy: ĐÚNG hai ảnh trước/sau là đủ', () => {
    const values: QuickVehicleValues = {
      ...QUICK_VEHICLE_DEFAULTS,
      vehicleType: VEHICLE_TYPE.MOTORBIKE,
      media: CAR_MEDIA.slice(0, 2),
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
