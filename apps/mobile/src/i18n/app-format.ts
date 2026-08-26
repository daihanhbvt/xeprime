import type { useFormatter, useTranslations } from 'use-intl';
import { PICKUP_PREFERENCE, type IsoDateTimeString, type MoneyString } from '@xeprime/types';
import {
  compactMoneyParts,
  formatMoneyVnd,
  pickupWishParts,
  rentalDurationParts,
  toAppTz,
  wholeUnits,
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
 * app. Khác web đúng hai chỗ — `use-intl` thay `next-intl` (chỉ là KIỂU), và chưa có
 * `remainingKm` vì app chưa mở màn bảo dưỡng.
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
  moneyCompact: (value: MoneyString | null | undefined) => string;
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
  fullDate: (value: Dayjs) => string;
  monthYear: (value: Date) => string;
  weekdayShort: (value: Dayjs) => string;
  rentalPoint: (value: Dayjs, opts?: { withTime?: boolean }) => string;
  rentalDuration: (from: Dayjs, to: Dayjs) => string;

  km: (value: number | null | undefined) => string;
  distanceKm: (value: number | null | undefined) => string;
  kmNumber: (value: number | null | undefined) => string;

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
  Record<AppLocale, { readonly date: string; readonly dateTime: string; readonly dayMonth: string }>
> = {
  vi: { date: 'DD/MM/YYYY', dateTime: 'DD/MM/YYYY HH:mm', dayMonth: 'DD/MM' },
  en: { date: 'MM/DD/YYYY', dateTime: 'MM/DD/YYYY HH:mm', dayMonth: 'MM/DD' },
};

/**
 * Dấu ngăn giữa các nhãn dịch vụ. Là KÝ HIỆU, không phải chữ — giống nhau ở mọi ngôn ngữ, nên
 * nó nằm trong mã chứ không nằm trong bó message.
 */
const SERVICE_SEPARATOR = ' · ';

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

  const shortStamp = (value: IsoDateTimeString | null | undefined) => {
    if (!value) return empty;
    return t('units.shortDateTime', {
      time: toAppTz(value).format('HH:mm'),
      date: toAppTz(value).format(pattern.dayMonth),
    });
  };

  return {
    money,
    moneyCompact: (value) => {
      if (value === null || value === undefined || value === '') return empty;
      const parts = compactMoneyParts(value, separators);
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
    shortDateTime: shortStamp,
    shortDateTimeRange: (from, to) =>
      t('units.range', { from: shortStamp(from), to: shortStamp(to) }),
    dateKey: (value) => (value ? format.dateTime(asCalendarDate(value), 'short') : empty),

    weekdayShort: (value) => weekday(value),
    rentalPoint: (value, opts) => {
      const base = t('units.rentalPoint', {
        weekday: weekday(value),
        date: value.format(pattern.dayMonth),
      });
      return opts?.withTime === false
        ? base
        : t('units.rentalPointWithTime', { point: base, time: value.format('HH:mm') });
    },
    rentalDuration: (from, to) => {
      const { days, hours } = rentalDurationParts(from, to);
      if (days <= 0) return t('units.hour', { count: hours });
      return hours > 0 ? t('units.dayAndHour', { days, hours }) : t('units.day', { count: days });
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
      return values.map((value) => domainLabel('serviceType', value)).join(SERVICE_SEPARATOR);
    },

    count: (value) => format.number(value, 'integer'),
    rating: (value) => format.number(value, 'rating'),
  };
}
