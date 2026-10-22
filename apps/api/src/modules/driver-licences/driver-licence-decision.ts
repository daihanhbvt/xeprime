import {
  licenceClassCoverage,
  normalizeLicenceClasses,
  VN_LICENCE_CLASS_REFORM_DATE,
} from '@xeprime/domain';
import {
  DRIVER_LICENCE_KIND,
  DRIVER_LICENCE_REJECT_REASON,
  DRIVER_LICENCE_STATUS,
  type DriverLicenceKind,
  type DriverLicenceRejectReason,
} from '@xeprime/types';
import { isValidDateOnly } from '../../common/date-only';
import type { DriverLicenceReading } from './reader/driver-licence-reader';

/**
 * Từ một lượt ĐỌC ẢNH ra một QUYẾT ĐỊNH — luật tự xác thực của ADR 0057 điều 2 (ADR 0070 gỡ nhánh
 * chờ duyệt tay), viết thuần để test đủ mọi nhánh mà không cần nhà cung cấp OCR.
 *
 * Nguyên tắc: MỌI lượt đọc được đều có quyết định ngay. Máy tự TỪ CHỐI khi lý do là thứ khách tự
 * sửa được (chụp lại, chụp mặt trước, nộp bằng còn hạn) — kể cả dữ liệu tự mâu thuẫn (hạn/ngày sinh
 * vô lý), vì đó gần như luôn là ảnh đọc lệch. Độ tin cậy thấp nhưng đủ trường và hợp lệ thì tự XÁC
 * THỰC — chủ xe đối chiếu bằng gốc lúc giao xe. Bằng quốc tế / nước ngoài: máy chỉ kiểm "đúng là
 * bằng lái".
 */

/** Trường đã chuẩn hoá — đúng dạng ghi vào các cột của `customer_driver_licences`. */
export interface ResolvedLicenceFields {
  kind: DriverLicenceKind | null;
  licenceNumber: string | null;
  fullName: string | null;
  dateOfBirth: string | null;
  classes: string[];
  issuedOn: string | null;
  expiresOn: string | null;
  noExpiry: boolean;
  issuingCountry: string | null;
  coversCar: boolean;
  coversMotorbike: boolean;
}

export type LicenceDecision =
  | { status: typeof DRIVER_LICENCE_STATUS.VERIFIED; fields: ResolvedLicenceFields }
  | {
      status: typeof DRIVER_LICENCE_STATUS.REJECTED;
      reason: DriverLicenceRejectReason;
      fields: ResolvedLicenceFields;
    };

/** Tuổi tối thiểu được cấp bằng lái xe máy/ô tô ở Việt Nam — dưới mức này là đọc sai ngày sinh. */
const MIN_LICENCE_AGE_YEARS = 18;
/**
 * Thời hạn dài nhất của một GPLX Việt Nam có hạn: 10 năm (B2 mẫu cũ, B mẫu 2025) — trừ `B1` mẫu cũ,
 * có hạn tới khi người lái đủ 55 (nữ) / 60 (nam) tuổi. Cộng thêm một năm cho chỗ lệch ngày cấp.
 */
const MAX_VALIDITY_YEARS = 10;
const LEGACY_B1_MAX_AGE_YEARS = 60;

export function decideFromReading(
  reading: DriverLicenceReading,
  /** Hôm nay theo giờ Việt Nam, `YYYY-MM-DD`. */
  today: string,
): LicenceDecision {
  const fields = resolveFields(reading);
  const reject = (reason: DriverLicenceRejectReason): LicenceDecision => ({
    status: DRIVER_LICENCE_STATUS.REJECTED,
    reason,
    fields,
  });

  if (!reading.isDriverLicence || reading.documentKind === 'not_a_licence' || !fields.kind) {
    return reject(DRIVER_LICENCE_REJECT_REASON.NOT_A_LICENCE);
  }

  // Bằng quốc tế / nước ngoài (chính sách 09/10/2026 của chủ sản phẩm): TỰ XÁC THỰC khi bộ đọc
  // nhận ra đúng là một tấm bằng lái (`readable`), không đòi đủ trường. Bố cục mỗi nơi một kiểu — IDP
  // đóng DẤU vào ô hạng, ngày mỗi nước một định dạng — nên máy không tách được hạng hay hạn tin cậy;
  // tấm bằng được coi là lái được cả ô tô lẫn xe máy, và CHỦ XE đối chiếu bằng gốc (hạng, hạn, IDP
  // Công ước 1968 kèm bằng quốc gia) lúc giao xe. Ảnh không nhận ra được là bằng lái thì đã bị
  // loại ở trên (`not_a_licence`).
  if (fields.kind !== DRIVER_LICENCE_KIND.VN) {
    if (!reading.readable) return reject(DRIVER_LICENCE_REJECT_REASON.UNREADABLE);
    if (fields.expiresOn !== null && fields.expiresOn < today) {
      return reject(DRIVER_LICENCE_REJECT_REASON.EXPIRED);
    }
    return {
      status: DRIVER_LICENCE_STATUS.VERIFIED,
      fields: { ...fields, coversCar: true, coversMotorbike: true },
    };
  }

  if (reading.side === 'back') return reject(DRIVER_LICENCE_REJECT_REASON.BACK_SIDE);
  if (!reading.readable) return reject(DRIVER_LICENCE_REJECT_REASON.UNREADABLE);

  const missing =
    !fields.licenceNumber ||
    !fields.fullName ||
    fields.classes.length === 0 ||
    (!fields.noExpiry && !fields.expiresOn);
  if (missing) {
    // Thiếu trường trên một ảnh có vấn đề chất lượng ⇒ lời khuyên đúng là "chụp lại cho rõ".
    return reject(
      reading.qualityIssues.length > 0 || reading.confidence === 'low'
        ? DRIVER_LICENCE_REJECT_REASON.UNREADABLE
        : DRIVER_LICENCE_REJECT_REASON.MISSING_FIELDS,
    );
  }

  // Hạn đọc được phải CÓ THỂ có với hạng đó: một chữ số đọc lệch không được biến bằng ô tô thành
  // bằng vô thời hạn, hay hạn 2031 thành 2081 — cả hai đều qua cổng đặt xe mãi mãi. Kiểm TRƯỚC
  // "hết hạn": hạn 2021 trên một tấm cấp năm 2021 là đọc sai, không phải bằng hết hạn ⇒ chụp lại.
  if (implausibleExpiry(fields, today)) return reject(DRIVER_LICENCE_REJECT_REASON.UNREADABLE);

  if (!fields.noExpiry && fields.expiresOn !== null && fields.expiresOn < today) {
    return reject(DRIVER_LICENCE_REJECT_REASON.EXPIRED);
  }

  if (!fields.coversCar && !fields.coversMotorbike) {
    return reject(DRIVER_LICENCE_REJECT_REASON.NO_DRIVABLE_CLASS);
  }

  if (fields.dateOfBirth && ageOn(fields.dateOfBirth, today) < MIN_LICENCE_AGE_YEARS) {
    return reject(DRIVER_LICENCE_REJECT_REASON.UNREADABLE);
  }

  return { status: DRIVER_LICENCE_STATUS.VERIFIED, fields };
}

/**
 * Hạn của một GPLX Việt Nam không thể đúng:
 *  - "không thời hạn" trên một bằng lái được ô tô (mọi hạng ô tô đều có hạn — chỉ A1/A2/A mô tô
 *    là vô thời hạn);
 *  - hạn không sau ngày cấp;
 *  - hạn xa hơn thời hạn dài nhất của hạng (`B1` mẫu cũ: tới 60 tuổi; còn lại: 10 năm).
 */
function implausibleExpiry(fields: ResolvedLicenceFields, today: string): boolean {
  if (fields.noExpiry) return fields.coversCar;
  const expires = fields.expiresOn;
  if (!expires) return false;
  if (fields.issuedOn && expires <= fields.issuedOn) return true;

  const legacyB1 =
    fields.classes.includes('B1') &&
    (fields.issuedOn === null || fields.issuedOn < VN_LICENCE_CLASS_REFORM_DATE);
  if (legacyB1) {
    return fields.dateOfBirth !== null
      ? expires > addYears(fields.dateOfBirth, LEGACY_B1_MAX_AGE_YEARS + 1)
      : false;
  }
  // Ngày cấp không thể sau hôm nay — không đọc được ngày cấp thì hôm nay là chặn trên của nó.
  return expires > addYears(fields.issuedOn ?? today, MAX_VALIDITY_YEARS + 1);
}

/** `YYYY-MM-DD` + n năm, dạng chuỗi — chỉ dùng để SO SÁNH (29/02 thành 29/02 năm khác vẫn so đúng). */
function addYears(dateKey: string, years: number): string {
  return `${Number(dateKey.slice(0, 4)) + years}${dateKey.slice(4)}`;
}

/** Chuẩn hoá những gì bộ đọc trả về thành giá trị ghi được vào cột — rác thành `null`. */
export function resolveFields(reading: DriverLicenceReading): ResolvedLicenceFields {
  const kind =
    reading.documentKind === 'not_a_licence' ? null : (reading.documentKind as DriverLicenceKind);
  const classes = normalizeLicenceClasses(reading.classes).slice(0, 12);
  const issuedOn = validDate(reading.issuedOn);
  const noExpiry = reading.noExpiry;

  let coversCar = false;
  let coversMotorbike = false;
  if (kind) {
    const coverage = licenceClassCoverage({ kind, classes, issuedOn });
    // Bằng nước ngoài: không có bảng tra ⇒ nhận định của bộ đọc, chỉ để gợi ý người duyệt.
    coversCar = coverage ? coverage.car : reading.coversCar;
    coversMotorbike = coverage ? coverage.motorbike : reading.coversMotorbike;
  }

  return {
    kind,
    licenceNumber: cleanLicenceNumber(reading.licenceNumber),
    fullName: cleanText(reading.fullName, 160),
    dateOfBirth: validDate(reading.dateOfBirth),
    classes,
    issuedOn,
    expiresOn: noExpiry ? null : validDate(reading.expiresOn),
    noExpiry,
    issuingCountry: kind === DRIVER_LICENCE_KIND.VN ? 'VN' : cleanCountry(reading.issuingCountry),
    coversCar,
    coversMotorbike,
  };
}

/** `YYYY-MM-DD` có thật trên lịch (không nhận 2026-02-30) — sai thì `null`. */
export function validDate(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return isValidDateOnly(trimmed) ? trimmed : null;
}

function cleanText(value: string | null, max: number): string | null {
  if (!value) return null;
  const text = value.replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
}

function cleanLicenceNumber(value: string | null): string | null {
  if (!value) return null;
  const compact = value.replace(/\s+/g, '').toUpperCase();
  return compact ? compact.slice(0, 40) : null;
}

function cleanCountry(value: string | null): string | null {
  if (!value) return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

/** Số năm tròn từ `birth` tới `on` (cả hai `YYYY-MM-DD`). */
function ageOn(birth: string, on: string): number {
  const [by, bm, bd] = birth.split('-').map(Number) as [number, number, number];
  const [oy, om, od] = on.split('-').map(Number) as [number, number, number];
  return oy - by - (om < bm || (om === bm && od < bd) ? 1 : 0);
}
