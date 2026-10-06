import { describe, expect, it } from 'vitest';
import {
  TRANSMISSION_TYPE_EXT,
  fixedTransmissionFor,
  normalizeTransmissionFor,
  vehicleTransmissionTypesFor,
  vehicleTransmissionTypesForFuels,
} from './vehicle-profile';
import { FUEL_TYPE, VEHICLE_TYPE, vehicleFuelTypesFor } from './vehicle';

/**
 * Hộp số theo nguồn năng lượng (06/10/2026) — nguồn luật chung của form web, app native, Yup và
 * backend. Đổi một danh sách ở đây là đổi lựa chọn trên MỌI màn và luật từ chối của API.
 */
describe('vehicleTransmissionTypesFor', () => {
  it('xe điện (ô tô và xe máy) chỉ có 1 cấp (EV)', () => {
    expect(vehicleTransmissionTypesFor(VEHICLE_TYPE.CAR, FUEL_TYPE.ELECTRIC)).toEqual([
      TRANSMISSION_TYPE_EXT.DIRECT_DRIVE,
    ]);
    expect(vehicleTransmissionTypesFor(VEHICLE_TYPE.MOTORBIKE, FUEL_TYPE.ELECTRIC)).toEqual([
      TRANSMISSION_TYPE_EXT.DIRECT_DRIVE,
    ]);
  });

  it('ô tô hybrid và PHEV: AT · e-CVT · DCT · Khác', () => {
    const expected = [
      TRANSMISSION_TYPE_EXT.AUTOMATIC,
      TRANSMISSION_TYPE_EXT.E_CVT,
      TRANSMISSION_TYPE_EXT.DCT,
      TRANSMISSION_TYPE_EXT.OTHER,
    ];
    expect(vehicleTransmissionTypesFor(VEHICLE_TYPE.CAR, FUEL_TYPE.HYBRID)).toEqual(expected);
    expect(vehicleTransmissionTypesFor(VEHICLE_TYPE.CAR, FUEL_TYPE.PLUG_IN_HYBRID)).toEqual(
      expected,
    );
  });

  it('ô tô xăng/dầu: MT · AT · CVT · DCT · AMT · Khác', () => {
    for (const fuel of [FUEL_TYPE.GASOLINE, FUEL_TYPE.DIESEL]) {
      expect(vehicleTransmissionTypesFor(VEHICLE_TYPE.CAR, fuel)).toEqual([
        TRANSMISSION_TYPE_EXT.MANUAL,
        TRANSMISSION_TYPE_EXT.AUTOMATIC,
        TRANSMISSION_TYPE_EXT.CVT,
        TRANSMISSION_TYPE_EXT.DCT,
        TRANSMISSION_TYPE_EXT.AMT,
        TRANSMISSION_TYPE_EXT.OTHER,
      ]);
    }
  });

  it('PHEV chỉ có ở ô tô', () => {
    expect(vehicleFuelTypesFor(VEHICLE_TYPE.CAR)).toContain(FUEL_TYPE.PLUG_IN_HYBRID);
    expect(vehicleFuelTypesFor(VEHICLE_TYPE.MOTORBIKE)).not.toContain(FUEL_TYPE.PLUG_IN_HYBRID);
  });
});

describe('fixedTransmissionFor', () => {
  it('xe điện: cố định 1 cấp — form khoá ô, backend tự điền', () => {
    expect(fixedTransmissionFor(VEHICLE_TYPE.CAR, FUEL_TYPE.ELECTRIC)).toBe(
      TRANSMISSION_TYPE_EXT.DIRECT_DRIVE,
    );
    expect(fixedTransmissionFor(VEHICLE_TYPE.MOTORBIKE, FUEL_TYPE.ELECTRIC)).toBe(
      TRANSMISSION_TYPE_EXT.DIRECT_DRIVE,
    );
  });

  it('nguồn khác hoặc chưa chọn: người dùng tự chọn', () => {
    for (const fuel of [FUEL_TYPE.GASOLINE, FUEL_TYPE.HYBRID, FUEL_TYPE.PLUG_IN_HYBRID, null]) {
      expect(fixedTransmissionFor(VEHICLE_TYPE.CAR, fuel)).toBeNull();
    }
  });
});

describe('normalizeTransmissionFor — luật chung của form và backend', () => {
  it('Xăng (AT) → Điện: thành 1 cấp', () => {
    expect(normalizeTransmissionFor(VEHICLE_TYPE.CAR, FUEL_TYPE.ELECTRIC, 'automatic')).toBe(
      TRANSMISSION_TYPE_EXT.DIRECT_DRIVE,
    );
  });

  it('Điện (1 cấp) → Xăng: về trống để chọn lại', () => {
    expect(normalizeTransmissionFor(VEHICLE_TYPE.CAR, FUEL_TYPE.GASOLINE, 'direct_drive')).toBeNull();
  });

  it('Xăng (CVT) → Hybrid: về trống; Xăng (AT) → PHEV: giữ', () => {
    expect(normalizeTransmissionFor(VEHICLE_TYPE.CAR, FUEL_TYPE.HYBRID, 'cvt')).toBeNull();
    expect(normalizeTransmissionFor(VEHICLE_TYPE.CAR, FUEL_TYPE.PLUG_IN_HYBRID, 'automatic')).toBe(
      TRANSMISSION_TYPE_EXT.AUTOMATIC,
    );
  });

  it('chưa chọn gì thì vẫn là chưa chọn', () => {
    expect(normalizeTransmissionFor(VEHICLE_TYPE.CAR, FUEL_TYPE.GASOLINE, null)).toBeNull();
    expect(normalizeTransmissionFor(VEHICLE_TYPE.CAR, FUEL_TYPE.GASOLINE, '')).toBeNull();
  });
});

describe('vehicleTransmissionTypesForFuels (mẫu xe trong danh mục)', () => {
  it('mẫu xe điện: chỉ 1 cấp', () => {
    expect(vehicleTransmissionTypesForFuels(VEHICLE_TYPE.CAR, [FUEL_TYPE.ELECTRIC])).toEqual([
      TRANSMISSION_TYPE_EXT.DIRECT_DRIVE,
    ]);
  });

  it('mẫu có cả bản xăng và hybrid: hợp hai bộ, không trùng', () => {
    const union = vehicleTransmissionTypesForFuels(VEHICLE_TYPE.CAR, [
      FUEL_TYPE.GASOLINE,
      FUEL_TYPE.HYBRID,
    ]);
    expect(union).toContain(TRANSMISSION_TYPE_EXT.E_CVT);
    expect(union).toContain(TRANSMISSION_TYPE_EXT.MANUAL);
    expect(union).not.toContain(TRANSMISSION_TYPE_EXT.DIRECT_DRIVE);
    expect(new Set(union).size).toBe(union.length);
  });

  it('chưa khai nguồn năng lượng: mọi kiểu của loại xe — kể cả 1 cấp và e-CVT', () => {
    const all = vehicleTransmissionTypesForFuels(VEHICLE_TYPE.CAR, []);
    expect(all).toContain(TRANSMISSION_TYPE_EXT.DIRECT_DRIVE);
    expect(all).toContain(TRANSMISSION_TYPE_EXT.E_CVT);
    expect(all).not.toContain(TRANSMISSION_TYPE_EXT.MANUAL_CLUTCH);
  });
});
