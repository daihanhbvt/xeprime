import { describe, expect, it } from 'vitest';
import { DRIVER_LICENCE_KIND, DRIVER_LICENCE_STATUS, VEHICLE_TYPE } from '@xeprime/types';
import {
  DRIVER_LICENCE_TRIP_GATE,
  evaluateDriverLicenceForTrip,
  licenceClassCoverage,
  licenceTripLastDayKey,
  licenceValidThrough,
  normalizeLicenceClass,
  normalizeLicenceClasses,
  type DriverLicenceGateInput,
} from './driver-licence';

/**
 * Luật bằng lái dùng chung API ↔ web (ADR 0057). Chỗ dễ sai nhất là hạng `B1`: mẫu cũ là ô tô,
 * mẫu 2025 là mô tô ba bánh — một bảng tra không xét ngày cấp sẽ cho người có bằng B1 mới thuê
 * ô tô, hoặc chặn oan cả triệu người cầm B1 cũ.
 */
describe('normalizeLicenceClass', () => {
  it('viết hoa, bỏ khoảng trắng và phần chú thích', () => {
    expect(normalizeLicenceClass(' b2 ')).toBe('B2');
    expect(normalizeLicenceClass('B1 (số tự động)')).toBe('B1');
    expect(normalizeLicenceClass('c1e')).toBe('C1E');
    expect(normalizeLicenceClass('F.B2')).toBe('FB2');
  });

  it('chú thích sau hạng không dính vào mã hạng', () => {
    expect(normalizeLicenceClass('B1 số tự động')).toBe('B1');
    expect(normalizeLicenceClass('B2 AT')).toBe('B2');
    expect(normalizeLicenceClass('B2(AT)')).toBe('B2');
  });

  it('chữ thừa không thành một hạng giả', () => {
    expect(normalizeLicenceClass('Class B')).toBeNull();
    expect(normalizeLicenceClass('B2AUTO')).toBeNull();
  });

  it('không phải mã hạng thì trả null', () => {
    expect(normalizeLicenceClass('hạng')).toBeNull();
    expect(normalizeLicenceClass('')).toBeNull();
    expect(normalizeLicenceClass('Z')).toBeNull();
  });

  it('danh sách bỏ trùng, bỏ rác, giữ thứ tự', () => {
    expect(normalizeLicenceClasses(['a1', 'B2', 'b2', '—'])).toEqual(['A1', 'B2']);
  });
});

describe('licenceClassCoverage', () => {
  it('GPLX mẫu cũ: B2 lái ô tô, không lái xe máy', () => {
    expect(
      licenceClassCoverage({
        kind: DRIVER_LICENCE_KIND.VN,
        classes: ['B2'],
        issuedOn: '2019-05-02',
      }),
    ).toEqual({ car: true, motorbike: false });
  });

  it('GPLX mẫu cũ: A1 + B2 lái được cả hai', () => {
    expect(
      licenceClassCoverage({
        kind: DRIVER_LICENCE_KIND.VN,
        classes: ['A1', 'B2'],
        issuedOn: '2020-01-01',
      }),
    ).toEqual({ car: true, motorbike: true });
  });

  it('B1 mẫu cũ là ô tô, B1 mẫu 2025 là mô tô ba bánh', () => {
    expect(
      licenceClassCoverage({
        kind: DRIVER_LICENCE_KIND.VN,
        classes: ['B1'],
        issuedOn: '2024-12-31',
      }),
    ).toEqual({ car: true, motorbike: false });
    expect(
      licenceClassCoverage({
        kind: DRIVER_LICENCE_KIND.VN,
        classes: ['B1'],
        issuedOn: '2025-01-01',
      }),
    ).toEqual({ car: false, motorbike: false });
  });

  it('không đọc được ngày cấp thì coi là mẫu cũ', () => {
    expect(
      licenceClassCoverage({ kind: DRIVER_LICENCE_KIND.VN, classes: ['B1'], issuedOn: null }),
    ).toEqual({ car: true, motorbike: false });
  });

  it('GPLX mẫu 2025: hạng A là xe máy, B là ô tô', () => {
    expect(
      licenceClassCoverage({
        kind: DRIVER_LICENCE_KIND.VN,
        classes: ['A', 'B'],
        issuedOn: '2025-06-10',
      }),
    ).toEqual({ car: true, motorbike: true });
  });

  it('A3/A4 không lái được xe cho thuê', () => {
    expect(
      licenceClassCoverage({
        kind: DRIVER_LICENCE_KIND.VN,
        classes: ['A4'],
        issuedOn: '2018-01-01',
      }),
    ).toEqual({ car: false, motorbike: false });
  });

  it('IDP theo Công ước Viên 1968', () => {
    expect(
      licenceClassCoverage({
        kind: DRIVER_LICENCE_KIND.INTERNATIONAL_PERMIT,
        classes: ['B'],
        issuedOn: null,
      }),
    ).toEqual({ car: true, motorbike: false });
  });

  it('bằng nước ngoài không suy được — người duyệt chốt', () => {
    expect(
      licenceClassCoverage({ kind: DRIVER_LICENCE_KIND.FOREIGN, classes: ['C'], issuedOn: null }),
    ).toBeNull();
  });
});

describe('licenceValidThrough', () => {
  it('so theo ngày, tính cả ngày hết hạn', () => {
    expect(licenceValidThrough({ expiresOn: '2026-10-10', noExpiry: false }, '2026-10-10')).toBe(
      true,
    );
    expect(licenceValidThrough({ expiresOn: '2026-10-09', noExpiry: false }, '2026-10-10')).toBe(
      false,
    );
  });

  it('không thời hạn luôn còn hiệu lực; GPLX Việt Nam thiếu ngày hết hạn thì không', () => {
    expect(licenceValidThrough({ expiresOn: null, noExpiry: true }, '2099-01-01')).toBe(true);
    expect(licenceValidThrough({ expiresOn: null, noExpiry: false }, '2026-01-01')).toBe(false);
    expect(
      licenceValidThrough(
        { expiresOn: null, noExpiry: false, kind: DRIVER_LICENCE_KIND.VN },
        '2026-01-01',
      ),
    ).toBe(false);
  });

  it('bằng quốc tế / nước ngoài: hạn chưa đọc được KHÔNG phải hết hạn — chủ xe đối chiếu bằng gốc', () => {
    for (const kind of [DRIVER_LICENCE_KIND.FOREIGN, DRIVER_LICENCE_KIND.INTERNATIONAL_PERMIT]) {
      expect(licenceValidThrough({ expiresOn: null, noExpiry: false, kind }, '2030-01-01')).toBe(
        true,
      );
      // Đọc được hạn thì hạn đó vẫn được soát như mọi bằng khác.
      expect(
        licenceValidThrough({ expiresOn: '2026-01-01', noExpiry: false, kind }, '2026-10-10'),
      ).toBe(false);
    }
  });
});

describe('evaluateDriverLicenceForTrip', () => {
  const carLicence: DriverLicenceGateInput = {
    status: DRIVER_LICENCE_STATUS.VERIFIED,
    kind: DRIVER_LICENCE_KIND.VN,
    expiresOn: '2030-01-01',
    noExpiry: false,
    coversCar: true,
    coversMotorbike: false,
  };
  const pending: DriverLicenceGateInput = {
    status: DRIVER_LICENCE_STATUS.PENDING_REVIEW,
    kind: null,
    expiresOn: null,
    noExpiry: false,
    coversCar: false,
    coversMotorbike: false,
  };
  const trip = { vehicleType: VEHICLE_TYPE.CAR, lastDayKey: '2026-10-20' };

  it('bằng hợp lệ ⇒ ok', () => {
    expect(evaluateDriverLicenceForTrip({ verified: carLicence, latest: carLicence }, trip)).toBe(
      DRIVER_LICENCE_TRIP_GATE.OK,
    );
  });

  it('chưa có gì ⇒ missing; đang chờ duyệt ⇒ pending_review', () => {
    expect(evaluateDriverLicenceForTrip({ verified: null, latest: null }, trip)).toBe(
      DRIVER_LICENCE_TRIP_GATE.MISSING,
    );
    expect(evaluateDriverLicenceForTrip({ verified: null, latest: pending }, trip)).toBe(
      DRIVER_LICENCE_TRIP_GATE.PENDING_REVIEW,
    );
  });

  it('bị từ chối ⇒ missing', () => {
    expect(
      evaluateDriverLicenceForTrip(
        { verified: null, latest: { ...pending, status: DRIVER_LICENCE_STATUS.REJECTED } },
        trip,
      ),
    ).toBe(DRIVER_LICENCE_TRIP_GATE.MISSING);
  });

  it('bằng ô tô đặt xe máy ⇒ class_mismatch', () => {
    expect(
      evaluateDriverLicenceForTrip(
        { verified: carLicence, latest: carLicence },
        { vehicleType: VEHICLE_TYPE.MOTORBIKE, lastDayKey: '2026-10-20' },
      ),
    ).toBe(DRIVER_LICENCE_TRIP_GATE.CLASS_MISMATCH);
  });

  it('hết hạn trước ngày trả xe ⇒ expired', () => {
    expect(
      evaluateDriverLicenceForTrip(
        { verified: { ...carLicence, expiresOn: '2026-10-19' }, latest: carLicence },
        trip,
      ),
    ).toBe(DRIVER_LICENCE_TRIP_GATE.EXPIRED);
  });

  it('bằng cũ hết hạn nhưng đã nộp bằng mới đang chờ ⇒ pending_review', () => {
    expect(
      evaluateDriverLicenceForTrip(
        { verified: { ...carLicence, expiresOn: '2026-01-01' }, latest: pending },
        trip,
      ),
    ).toBe(DRIVER_LICENCE_TRIP_GATE.PENDING_REVIEW);
  });

  it('bằng cũ còn dùng được thì không bị lượt nộp mới chặn', () => {
    expect(evaluateDriverLicenceForTrip({ verified: carLicence, latest: pending }, trip)).toBe(
      DRIVER_LICENCE_TRIP_GATE.OK,
    );
  });
});

describe('licenceTripLastDayKey', () => {
  it('trả xe lúc 00:00 giờ VN tính là hết ngày hôm trước', () => {
    expect(licenceTripLastDayKey({ returnAt: new Date('2026-10-20T00:00:00+07:00') })).toBe(
      '2026-10-19',
    );
    expect(licenceTripLastDayKey({ returnAt: new Date('2026-10-20T10:00:00+07:00') })).toBe(
      '2026-10-20',
    );
  });

  it('dài hạn: ngày nhận muộn nhất + số tháng LỊCH, kẹp cuối tháng', () => {
    expect(licenceTripLastDayKey({ latestPickupDateKey: '2026-08-31', packageMonths: 6 })).toBe(
      '2027-02-28',
    );
    expect(licenceTripLastDayKey({ latestPickupDateKey: '2026-10-15', packageMonths: 1 })).toBe(
      '2026-11-15',
    );
  });
});
