import {
  DRIVER_LICENCE_KIND,
  DRIVER_LICENCE_QUALITY_ISSUE,
  DRIVER_LICENCE_REJECT_REASON,
  DRIVER_LICENCE_STATUS,
} from '@xeprime/types';
import {
  decideFromReading,
  validDate,
} from '../src/modules/driver-licences/driver-licence-decision';
import type { DriverLicenceReading } from '../src/modules/driver-licences/reader/driver-licence-reader';

/**
 * Luật TỰ XÁC THỰC bằng lái (ADR 0057 điều 2) — thuần, không DB, không nhà cung cấp OCR.
 *
 * Thứ cần khoá: máy chỉ tự xác thực khi mọi điều kiện rõ ràng; tự từ chối khi khách sửa được ngay;
 * còn lại sang người duyệt. Một nhánh sai ở đây là cho một người không có bằng đi thuê xe tự lái,
 * hoặc chặn oan một người có bằng hợp lệ.
 */
const TODAY = '2026-10-08';

function vnB2(overrides: Partial<DriverLicenceReading> = {}): DriverLicenceReading {
  return {
    isDriverLicence: true,
    documentKind: 'vn',
    side: 'front',
    readable: true,
    qualityIssues: [],
    confidence: 'high',
    licenceNumber: '7901 2345 6789',
    fullName: '  NGUYỄN   VĂN AN ',
    dateOfBirth: '1990-04-12',
    classes: ['b2'],
    issuedOn: '2021-03-15',
    expiresOn: '2031-03-15',
    noExpiry: false,
    issuingCountry: 'vn',
    coversCar: true,
    coversMotorbike: false,
    notes: null,
    ...overrides,
  };
}

describe('decideFromReading — tự xác thực', () => {
  it('GPLX Việt Nam rõ ràng, còn hạn ⇒ verified, trường đã chuẩn hoá', () => {
    const decision = decideFromReading(vnB2(), TODAY);
    expect(decision.status).toBe(DRIVER_LICENCE_STATUS.VERIFIED);
    expect(decision.fields).toMatchObject({
      kind: DRIVER_LICENCE_KIND.VN,
      licenceNumber: '790123456789',
      fullName: 'NGUYỄN VĂN AN',
      classes: ['B2'],
      issuingCountry: 'VN',
      coversCar: true,
      coversMotorbike: false,
    });
  });

  it('A1 không thời hạn ⇒ verified, lái được xe máy', () => {
    const decision = decideFromReading(
      vnB2({ classes: ['A1'], expiresOn: null, noExpiry: true }),
      TODAY,
    );
    expect(decision.status).toBe(DRIVER_LICENCE_STATUS.VERIFIED);
    expect(decision.fields).toMatchObject({
      noExpiry: true,
      expiresOn: null,
      coversMotorbike: true,
    });
  });

  it('hạng hết hạn ĐÚNG hôm nay vẫn còn dùng được', () => {
    expect(decideFromReading(vnB2({ expiresOn: TODAY }), TODAY).status).toBe(
      DRIVER_LICENCE_STATUS.VERIFIED,
    );
  });
});

describe('decideFromReading — tự từ chối (khách sửa được ngay)', () => {
  const reasonOf = (reading: DriverLicenceReading) => {
    const decision = decideFromReading(reading, TODAY);
    expect(decision.status).toBe(DRIVER_LICENCE_STATUS.REJECTED);
    return decision.status === DRIVER_LICENCE_STATUS.REJECTED ? decision.reason : null;
  };

  it('không phải bằng lái', () => {
    expect(reasonOf(vnB2({ isDriverLicence: false, documentKind: 'not_a_licence' }))).toBe(
      DRIVER_LICENCE_REJECT_REASON.NOT_A_LICENCE,
    );
  });

  it('mặt sau', () => {
    expect(reasonOf(vnB2({ side: 'back' }))).toBe(DRIVER_LICENCE_REJECT_REASON.BACK_SIDE);
  });

  it('ảnh không đọc được', () => {
    expect(
      reasonOf(vnB2({ readable: false, qualityIssues: [DRIVER_LICENCE_QUALITY_ISSUE.BLURRY] })),
    ).toBe(DRIVER_LICENCE_REJECT_REASON.UNREADABLE);
  });

  it('thiếu trường trên ảnh có vấn đề chất lượng ⇒ "chụp lại cho rõ"', () => {
    expect(
      reasonOf(vnB2({ licenceNumber: null, qualityIssues: [DRIVER_LICENCE_QUALITY_ISSUE.GLARE] })),
    ).toBe(DRIVER_LICENCE_REJECT_REASON.UNREADABLE);
  });

  it('thiếu trường trên ảnh rõ ⇒ missing_fields', () => {
    expect(reasonOf(vnB2({ expiresOn: null }))).toBe(DRIVER_LICENCE_REJECT_REASON.MISSING_FIELDS);
  });

  it('ngày hết hạn không có thật trên lịch coi như thiếu', () => {
    expect(reasonOf(vnB2({ expiresOn: '2031-02-30' }))).toBe(
      DRIVER_LICENCE_REJECT_REASON.MISSING_FIELDS,
    );
  });

  it('hết hạn', () => {
    expect(reasonOf(vnB2({ expiresOn: '2026-10-07' }))).toBe(DRIVER_LICENCE_REJECT_REASON.EXPIRED);
  });

  it('chỉ có hạng máy kéo ⇒ no_drivable_class', () => {
    expect(reasonOf(vnB2({ classes: ['A4'] }))).toBe(
      DRIVER_LICENCE_REJECT_REASON.NO_DRIVABLE_CLASS,
    );
  });

  it('B1 mẫu 2025 (mô tô ba bánh) ⇒ no_drivable_class', () => {
    expect(reasonOf(vnB2({ classes: ['B1'], issuedOn: '2025-03-01' }))).toBe(
      DRIVER_LICENCE_REJECT_REASON.NO_DRIVABLE_CLASS,
    );
  });
});

describe('decideFromReading — sang người duyệt', () => {
  const whyOf = (reading: DriverLicenceReading) => {
    const decision = decideFromReading(reading, TODAY);
    expect(decision.status).toBe(DRIVER_LICENCE_STATUS.PENDING_REVIEW);
    return decision.status === DRIVER_LICENCE_STATUS.PENDING_REVIEW ? decision.why : null;
  };

  it('hạn không thể có với hạng đó ⇒ người duyệt, không tự xác thực', () => {
    // Bằng ô tô "không thời hạn": đọc nhầm sẽ cho qua cổng đặt xe mãi mãi.
    expect(whyOf(vnB2({ expiresOn: null, noExpiry: true }))).toBe('implausible_expiry');
    // Hạn 2081 — một chữ số đọc lệch.
    expect(whyOf(vnB2({ expiresOn: '2081-03-15' }))).toBe('implausible_expiry');
    // Hạn trước ngày cấp.
    expect(whyOf(vnB2({ issuedOn: '2021-03-15', expiresOn: '2021-01-01' }))).toBe(
      'implausible_expiry',
    );
    // Không đọc được ngày cấp: hôm nay là chặn trên của ngày cấp.
    expect(whyOf(vnB2({ issuedOn: null, expiresOn: '2040-01-01' }))).toBe('implausible_expiry');
  });

  it('B1 mẫu cũ có hạn tới tuổi 60 — hạn xa vẫn hợp lệ, quá tuổi 60 thì không', () => {
    const b1 = { classes: ['B1'], issuedOn: '2015-06-01', dateOfBirth: '1990-04-12' };
    expect(decideFromReading(vnB2({ ...b1, expiresOn: '2050-04-12' }), TODAY).status).toBe(
      DRIVER_LICENCE_STATUS.VERIFIED,
    );
    expect(whyOf(vnB2({ ...b1, expiresOn: '2060-04-12' }))).toBe('implausible_expiry');
  });

  it('A1 không thời hạn là bình thường — không bị coi là hạn bất thường', () => {
    expect(
      decideFromReading(vnB2({ classes: ['A1'], expiresOn: null, noExpiry: true }), TODAY).status,
    ).toBe(DRIVER_LICENCE_STATUS.VERIFIED);
  });

  it('độ tin cậy thấp', () => {
    expect(whyOf(vnB2({ confidence: 'low' }))).toBe('low_confidence');
  });

  it('ngày sinh cho ra người dưới 18 tuổi — gần như chắc chắn đọc sai', () => {
    expect(whyOf(vnB2({ dateOfBirth: '2012-01-01' }))).toBe('implausible_birth_date');
  });
});

describe('decideFromReading — bằng quốc tế / nước ngoài (chủ xe đối chiếu khi giao xe)', () => {
  /** Đúng thứ bộ đọc Tesseract trả cho một bằng nước ngoài: chỉ biết "đây là bằng lái". */
  const foreign = (overrides: Partial<DriverLicenceReading> = {}) =>
    vnB2({
      documentKind: 'foreign',
      licenceNumber: null,
      fullName: null,
      dateOfBirth: null,
      classes: [],
      issuedOn: null,
      expiresOn: null,
      issuingCountry: null,
      confidence: 'low',
      ...overrides,
    });

  it.each(['foreign', 'international_permit'] as const)(
    '%s nhận ra là bằng lái ⇒ TỰ XÁC THỰC dù thiếu hạng/hạn/số, lái được ô tô lẫn xe máy',
    (documentKind) => {
      const decision = decideFromReading(foreign({ documentKind }), TODAY);
      expect(decision.status).toBe(DRIVER_LICENCE_STATUS.VERIFIED);
      expect(decision.fields).toMatchObject({
        kind: documentKind,
        classes: [],
        expiresOn: null,
        noExpiry: false,
        coversCar: true,
        coversMotorbike: true,
      });
    },
  );

  it('không đủ cấu trúc của một tấm bằng (vd ảnh trang web có chữ "driver license") ⇒ từ chối, không tự duyệt', () => {
    const decision = decideFromReading(foreign({ readable: false }), TODAY);
    expect(decision).toMatchObject({
      status: DRIVER_LICENCE_STATUS.REJECTED,
      reason: DRIVER_LICENCE_REJECT_REASON.UNREADABLE,
    });
  });

  it('bộ đọc ĐỌC ĐƯỢC hạn và hạn đã qua ⇒ từ chối hết hạn như mọi bằng khác', () => {
    expect(decideFromReading(foreign({ expiresOn: '2020-01-01' }), TODAY)).toMatchObject({
      status: DRIVER_LICENCE_STATUS.REJECTED,
      reason: DRIVER_LICENCE_REJECT_REASON.EXPIRED,
    });
  });
});

describe('validDate', () => {
  it('chỉ nhận ngày có thật dạng YYYY-MM-DD', () => {
    expect(validDate('2026-02-28')).toBe('2026-02-28');
    expect(validDate('2026-02-29')).toBeNull();
    expect(validDate('15/03/2031')).toBeNull();
    expect(validDate(' 2031-03-15 ')).toBe('2031-03-15');
    expect(validDate(null)).toBeNull();
  });
});
