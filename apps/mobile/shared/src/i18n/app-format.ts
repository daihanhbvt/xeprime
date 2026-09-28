import type { useFormatter, useTranslations } from 'use-intl';
import { PICKUP_PREFERENCE, type IsoDateTimeString, type MoneyString } from '@xeprime/types';
import {
  compactMoneyParts,
  formatMoneyVnd,
  nowInAppTz,
  pickupWishParts,
  remainingKm as remainingKmParts,
  rentalDurationParts,
  toAppTz,
  wholeUnits,
  LIST_SEPARATOR,
  type Dayjs,
  type MoneySeparators,
  type PickupWish,
} from '@xeprime/domain';
import { FORMAT_LOCALE, type AppLocale } from './config';
import type { DomainLabel } from './domain';

/**
 * MỌI chuỗi hiển thị sinh ra từ dữ liệu — tiền, ngày giờ, quãng đường, thời lượng thuê, gói
 * dài hạn, nguyện vọng nhận xe — đi qua đúng một cửa này.
 *
 * BẢN SAO của `apps/web/src/i18n/app-format.ts`, cố ý giữ nguyên từng khoá message và từng
 * quyết định định dạng: một số tiền hay một mốc giao xe phải đọc y hệt nhau trên web và trên
 * app. Khác web đúng một chỗ — `use-intl` thay `next-intl`, và đó chỉ là KIỂU.
 *
 * Sửa bên nào cũng phải sửa bên kia, cho tới khi cả cụm được đưa về `@xeprime/domain`.
 *
 * Phần TÍNH TOÁN (đếm ngày, chia bậc tiền, phân loại nguyện vọng) nằm ở `@xeprime/domain` và
 * đã dùng chung — file này chỉ khoác chữ lên chúng.
 */
export interface AppFormat {
  /** `1.200.000 ₫` (vi) · `1,200,000 ₫` (en). Không đi qua `Number` — ADR 0007. */
  money: (value: MoneyString | null | undefined) => string;
  /** Dạng rút gọn cho chỗ hẹp: `12,7tr` (vi) · `12.7M` (en). */
  /**
   * `price: true` cho HAI chữ số lẻ ở bậc triệu (`1,05tr` thay vì `1tr`) — bắt buộc khi con số là
   * GIÁ khách dùng để so hai lựa chọn.
   *
   * Một chữ số lẻ biến 1.050.000 thành "1tr" và 1.350.000 thành "1,3tr" — sai 50.000đ trên chính
   * cái số người ta quyết định mua bằng nó. Bậc nghìn không đổi: 600.000 vốn đã là "600k" chính
   * xác tuyệt đối ở mọi mức. Mặc định `1` dành cho TRỤC BIỂU ĐỒ và ô thống kê, nơi người đọc cần
   * độ lớn chứ không cần con số chính xác.
   */
  moneyCompact: (value: MoneyString | null | undefined, opts?: { price?: boolean }) => string;
  /** `1.200.000 ₫/ngày` · `1,200,000 ₫/day`. `null` ⇒ "Miễn phí"/"Free". */
  pricePerDay: (value: MoneyString | null | undefined) => string;
  pricePerHour: (value: MoneyString | null | undefined) => string;
  pricePerMonth: (value: MoneyString | null | undefined) => string;

  date: (value: IsoDateTimeString | null | undefined) => string;
  time: (value: IsoDateTimeString | null | undefined) => string;
  dateTime: (value: IsoDateTimeString | null | undefined) => string;
  dateTimeRange: (
    from: IsoDateTimeString | null | undefined,
    to: IsoDateTimeString | null | undefined,
  ) => string;
  /** Mốc gọn: `08:00 · 17/08` — bỏ năm để không chiếm ngang. */
  shortDateTime: (value: IsoDateTimeString | null | undefined) => string;
  shortDateTimeRange: (
    from: IsoDateTimeString | null | undefined,
    to: IsoDateTimeString | null | undefined,
  ) => string;
  /** Ngày `YYYY-MM-DD` (không kèm giờ) — nguyện vọng nhận xe, hạn giấy tờ. */
  dateKey: (value: string | null | undefined) => string;
  /**
   * Ngày `YYYY-MM-DD` bỏ NĂM — `08/09` (vi) / `09/08` (en).
   *
   * Cho những chỗ bề ngang là tài nguyên khan hiếm nhất: nhãn trục X của biểu đồ ở 390dp. Thứ tự
   * ngày/tháng vẫn theo ngôn ngữ (`DATE_PATTERN`), không gõ cứng `DD/MM`.
   */
  dayMonth: (value: string | null | undefined) => string;
  fullDate: (value: Dayjs) => string;
  monthYear: (value: Date) => string;
  /**
   * Tháng ở dạng NGẮN — `09/2026`.
   *
   * Cùng lý do với {@link dayMonth}: nhãn trục X của biểu đồ chỉ có vài chục dp, mà bản đầy đủ
   * (`Tháng 9 năm 2026`) dài gấp ba lần chỗ đó và bị cắt thành `Tháng…` — một nhãn không nói ra
   * nó là tháng mấy thì thà không có. Bản đầy đủ vẫn hiện ở thẻ chi tiết khi chạm vào mốc.
   *
   * Không theo `DATE_PATTERN` của ngôn ngữ vì `MM/YYYY` không có thứ tự nào để nhầm.
   */
  monthYearShort: (value: Date) => string;
  weekdayShort: (value: Dayjs) => string;
  /** Thứ viết ĐẦY ĐỦ: `Chủ Nhật` · `Sunday` — tiêu đề thẻ một ngày trên lịch, y như web. */
  weekdayLong: (value: Dayjs) => string;
  rentalPoint: (value: Dayjs, opts?: { withTime?: boolean }) => string;
  /**
   * MỐC thuê bản GỌN: NGÀY + GIỜ, mẫu ngày theo ngôn ngữ (DD/MM ở vi, MM/DD ở en), giờ luôn 24h.
   *
   * Khác {@link rentalPoint} ở chỗ bỏ THỨ và dùng dấu cách thay vì dấu chấm giữa — dành cho ô
   * chọn thời gian thuê và dòng tóm tắt kết quả, nơi bề ngang không đủ cho "T4, 26/08 · 10:00".
   * Một hàm dựng cho cả hai bề mặt: đó là cách duy nhất để chúng nói về CÙNG một khoảng mà không
   * viết nó theo hai kiểu. Web có cùng hàm này trong `apps/web/src/i18n/app-format.ts`.
   */
  rentalPointCompact: (value: Dayjs, opts?: { withYear?: boolean }) => string;
  rentalDuration: (from: Dayjs, to: Dayjs) => string;
  /**
   * Dòng tóm tắt khoảng thuê: hai mốc gọn + thời lượng — `14/09 17:00 → 15/09 17:00 (1 ngày)`.
   *
   * Thay cho cách cũ là in hai NGÀY LỊCH rồi đếm ngày bằng phép trừ hai mốc: một chuyến 17:00
   * hôm nay → 17:00 hôm sau hiện ra hai ngày khác nhau mà không nói giờ nhận, còn một chuyến
   * 09:00 → 23:00 cùng ngày cũng "1 ngày" với đúng hai ngày khác nhau. GIỜ NHẬN là thứ quyết
   * định số ngày tính tiền, nên nó phải nằm ngay trong dòng này. Web đổi cùng lúc, cùng hàm.
   */
  rentalRangeSummary: (from: Dayjs, to: Dayjs) => string;

  km: (value: number | null | undefined) => string;
  distanceKm: (value: number | null | undefined) => string;
  kmNumber: (value: number | null | undefined) => string;
  /** Quãng đường tới mốc bảo dưỡng: `Còn 1.200 km` · `Quá hạn 300 km` · `Chưa đủ dữ liệu`. */
  remainingKm: (value: number | null | undefined) => string;

  packageLabel: (months: number | null | undefined) => string | null;
  pickupWish: (wish: PickupWish) => string;
  serviceTypes: (values: readonly string[] | null | undefined) => string;

  /** Số nguyên có phân tách nhóm. */
  count: (value: number) => string;
  /** Điểm đánh giá một chữ số thập phân: `4,8` · `4.8`. */
  rating: (value: number) => string;
}

/**
 * Mẫu ngày Day.js cho ô chọn ngày. Người đọc tiếng Anh gõ `08/17/2026` chứ không phải
 * `17/08/2026`, nên để nguyên mẫu Việt sẽ nhận nhầm ngày thành tháng ở đúng nửa đầu mỗi tháng.
 *
 * KHÔNG dùng cho tham số API: `DAY_PARAM_FORMAT`/`MONTH_PARAM_FORMAT` là dữ liệu, luôn ISO.
 */
export const DATE_PATTERN: Readonly<
  Record<
    AppLocale,
    {
      readonly date: string;
      readonly dateTime: string;
      readonly dayMonth: string;
      readonly monthYear: string;
    }
  >
> = {
  vi: { date: 'DD/MM/YYYY', dateTime: 'DD/MM/YYYY HH:mm', dayMonth: 'DD/MM', monthYear: 'MM/YYYY' },
  en: { date: 'MM/DD/YYYY', dateTime: 'MM/DD/YYYY HH:mm', dayMonth: 'MM/DD', monthYear: 'MM/YYYY' },
};

/** Hoa chữ cái đầu theo luật của chính chuỗi đó — `toLocaleUpperCase` an toàn với tiếng Việt. */
function capitalizeFirst(text: string): string {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}

/** Dấu phân tách nhóm/thập phân của một ngôn ngữ, hỏi thẳng `Intl` thay vì gõ tay. */
function separatorsFor(locale: AppLocale): MoneySeparators {
  const parts = new Intl.NumberFormat(FORMAT_LOCALE[locale]).formatToParts(1234.5);
  return {
    group: parts.find((p) => p.type === 'group')?.value ?? ',',
    decimal: parts.find((p) => p.type === 'decimal')?.value ?? '.',
  };
}

export type CommonTranslator = ReturnType<typeof useTranslations<'Common'>>;
export type AppFormatter = ReturnType<typeof useFormatter>;

export function createAppFormat(
  locale: AppLocale,
  format: AppFormatter,
  t: CommonTranslator,
  /** Nhãn giá trị nghiệp vụ — nguyện vọng nhận xe lấy CHỮ từ đây, không viết lại ở Common. */
  domainLabel: DomainLabel,
): AppFormat {
  const separators = separatorsFor(locale);
  const empty = t('labels.emptyValue');
  const pattern = DATE_PATTERN[locale];

  /**
   * Thứ viết tắt lấy từ MESSAGE, không từ `Intl`: CLDR trả `Thứ 7` cho vi-VN — dài gấp ba `T7`
   * và làm vỡ đúng những chỗ đã cố ý bỏ năm để tiết kiệm chiều ngang.
   */
  const weekday = (value: Dayjs) => t(`weekdayShort.${value.day()}` as never);

  const money = (value: MoneyString | null | undefined) => formatMoneyVnd(value, separators, empty);

  /** `null`/rỗng ⇒ "Miễn phí": một dịch vụ không mất phí, khác hẳn "chưa có giá". */
  const priceWithSuffix = (
    value: MoneyString | null | undefined,
    key: 'perDay' | 'perHour' | 'perMonth',
  ) => {
    if (value === null || value === undefined || value === '') return t('labels.free');
    return t(`units.${key}` as never, { value: money(value) } as never);
  };

  /**
   * Chuỗi ISO từ API là mốc UTC; `format.dateTime` đã nhận múi giờ `Asia/Ho_Chi_Minh` từ
   * `IntlProvider` nên hiển thị luôn đúng giờ Việt Nam.
   */
  const asDate = (value: IsoDateTimeString) => new Date(value);

  /**
   * `YYYY-MM-DD` là NGÀY LỊCH, không phải mốc thời gian: dựng ở giữa trưa UTC để phép quy đổi
   * múi giờ của formatter không kéo nó lùi sang ngày hôm trước.
   */
  const asCalendarDate = (dateKey: string) => new Date(`${dateKey}T12:00:00Z`);

  /**
   * Mốc ngày + giờ ghép TAY từ hai mảnh: với `vi`, CLDR đặt GIỜ TRƯỚC NGÀY
   * (`14:30 17/08/2026`) — ngược với cách cả sản phẩm đọc một mốc thời gian.
   */
  const stamp = (value: IsoDateTimeString | null | undefined) =>
    value
      ? t('units.dateTime', {
          date: format.dateTime(asDate(value), 'short'),
          time: format.dateTime(asDate(value), 'time'),
        })
      : empty;

  /**
   * `14/09 17:00` — mẫu ngày theo NGÔN NGỮ (`DD/MM` ở vi, `MM/DD` ở en), giờ luôn 24h.
   *
   * Một hàm dựng cho cả ô chọn thời gian lẫn dòng tóm tắt kết quả: đó là cách duy nhất để hai bề
   * mặt nói về cùng một khoảng mà không viết nó theo hai kiểu. Cùng hàm với web.
   */
  const compactPoint = (value: Dayjs, withYear: boolean) =>
    t('units.rentalPointCompact', {
      date: value.format(withYear ? pattern.date : pattern.dayMonth),
      time: value.format('HH:mm'),
    });

  const duration = (from: Dayjs, to: Dayjs) => {
    const { days, hours } = rentalDurationParts(from, to);
    if (days <= 0) return t('units.hour', { count: hours });
    return hours > 0 ? t('units.dayAndHour', { days, hours }) : t('units.day', { count: days });
  };

  const shortStamp = (value: IsoDateTimeString | null | undefined) => {
    if (!value) return empty;
    return t('units.shortDateTime', {
      time: toAppTz(value).format('HH:mm'),
      date: toAppTz(value).format(pattern.dayMonth),
    });
  };

  return {
    money,
    moneyCompact: (value, opts) => {
      if (value === null || value === undefined || value === '') return empty;
      const parts = compactMoneyParts(value, separators, opts?.price === true ? 2 : 1);
      if (!parts) return money(wholeUnits(value));
      return t(`units.compact.${parts.unit}` as never, { value: parts.value } as never);
    },
    pricePerDay: (value) => priceWithSuffix(value, 'perDay'),
    pricePerHour: (value) => priceWithSuffix(value, 'perHour'),
    pricePerMonth: (value) => priceWithSuffix(value, 'perMonth'),

    date: (value) => (value ? format.dateTime(asDate(value), 'short') : empty),
    time: (value) => (value ? format.dateTime(asDate(value), 'time') : empty),
    dateTime: stamp,
    dateTimeRange: (from, to) => t('units.range', { from: stamp(from), to: stamp(to) }),
    fullDate: (value) => format.dateTime(value.toDate(), 'fullDate'),
    monthYear: (value) => capitalizeFirst(format.dateTime(value, 'monthYear')),
    monthYearShort: (value) => toAppTz(value).format(pattern.monthYear),
    shortDateTime: shortStamp,
    shortDateTimeRange: (from, to) =>
      t('units.range', { from: shortStamp(from), to: shortStamp(to) }),
    dateKey: (value) => (value ? format.dateTime(asCalendarDate(value), 'short') : empty),
    dayMonth: (value) => (value ? toAppTz(asCalendarDate(value)).format(pattern.dayMonth) : empty),

    weekdayShort: (value) => weekday(value),
    weekdayLong: (value) => format.dateTime(value.toDate(), 'weekdayLong'),
    rentalPoint: (value, opts) => {
      const base = t('units.rentalPoint', {
        weekday: weekday(value),
        date: value.format(pattern.dayMonth),
      });
      return opts?.withTime === false
        ? base
        : t('units.rentalPointWithTime', { point: base, time: value.format('HH:mm') });
    },
    rentalPointCompact: (value, opts) => compactPoint(value, opts?.withYear === true),
    rentalDuration: duration,
    rentalRangeSummary: (from, to) => {
      /*
       * Năm chỉ xuất hiện khi nó PHÂN BIỆT được điều gì: khoảng thuê không nằm trọn trong năm
       * hiện tại (chuyến đón giao thừa, hoặc một ngữ cảnh cũ mở lại sang năm sau). Mọi chuyến
       * còn lại — gần như toàn bộ — giữ dòng ngắn.
       */
      const thisYear = nowInAppTz().year();
      const withYear = from.year() !== thisYear || to.year() !== thisYear;
      return t('units.rentalRangeSummary', {
        from: compactPoint(from, withYear),
        to: compactPoint(to, withYear),
        duration: duration(from, to),
      });
    },

    km: (value) =>
      value == null
        ? t('labels.notAvailable')
        : t('units.km', { value: format.number(value, 'integer') }),
    distanceKm: (value) =>
      value == null
        ? t('labels.notAvailable')
        : t('units.km', { value: format.number(value, 'distance') }),
    kmNumber: (value) =>
      value == null ? t('labels.notAvailable') : format.number(value, 'integer'),
    remainingKm: (value) => {
      const parts = remainingKmParts(value);
      if (parts.kind === 'unknown' || parts.km === null) return t('labels.insufficientData');
      const km = format.number(parts.km, 'integer');
      return parts.kind === 'overdue'
        ? t('units.kmOverdue', { value: km })
        : t('units.kmRemaining', { value: km });
    },

    packageLabel: (months) => (months == null ? null : t('units.month', { count: months })),
    pickupWish: (wish) => {
      const parts = pickupWishParts(wish);
      // Phần NHÃN lấy từ `Domain.pickupPreference` — viết lại nó ở đây là tạo bản thứ hai của
      // cùng một từ, và hai bản đó sẽ trôi khỏi nhau ngay lần sửa câu chữ đầu tiên.
      if (parts.kind === 'specificDate' && parts.date) {
        return t('units.pickupWishDate', {
          label: domainLabel('pickupPreference', PICKUP_PREFERENCE.SPECIFIC_DATE),
          date: format.dateTime(asCalendarDate(parts.date), 'short'),
        });
      }
      if (parts.kind === 'window' && parts.start && parts.end) {
        return t('units.pickupWishWindow', {
          label: domainLabel('pickupPreference', PICKUP_PREFERENCE.WITHIN_7_DAYS),
          // Cả hai đầu đi qua CÙNG một đường dựng ngày lịch — không một bên `dayjs` thô.
          start: toAppTz(asCalendarDate(parts.start)).format(pattern.dayMonth),
          end: format.dateTime(asCalendarDate(parts.end), 'short'),
        });
      }
      return t('units.pickupWishShopDecides');
    },

    serviceTypes: (values) => {
      if (!values || values.length === 0) return t('labels.emptyValue');
      return values.map((value) => domainLabel('serviceType', value)).join(LIST_SEPARATOR);
    },

    count: (value) => format.number(value, 'integer'),
    rating: (value) => format.number(value, 'rating'),
  };
}
