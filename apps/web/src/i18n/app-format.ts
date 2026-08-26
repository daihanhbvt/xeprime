import type { useFormatter, useTranslations } from 'next-intl';
import { PICKUP_PREFERENCE, type IsoDateTimeString, type MoneyString } from '@xeprime/types';
import { rentalDurationParts, toAppTz, type Dayjs } from '@/lib/datetime';
import { pickupWishParts, type PickupWish } from '@/lib/long-term';
import { compactMoneyParts, formatMoneyVnd, wholeUnits, type MoneySeparators } from '@/lib/money';
import { remainingKm as remainingKmParts } from '@/lib/odometer';
import { FORMAT_LOCALE, type AppLocale } from './config';
import type { DomainLabel } from './domain';

/**
 * MỌI chuỗi hiển thị được sinh ra từ dữ liệu — tiền, ngày giờ, quãng đường, thời lượng thuê,
 * gói dài hạn, nguyện vọng nhận xe — đi qua đúng một cửa này.
 *
 * Module này chỉ chứa kiểu và factory thuần, không chứa React hook hay chỉ thị `use client`.
 * Locale, formatter và translator được truyền tường minh từ adapter server hoặc client, nên
 * không có trạng thái toàn cục và không làm rò dữ liệu giữa các request render song song.
 * Phần TÍNH TOÁN (đếm ngày, chia bậc tiền, phân loại nguyện vọng) vẫn nằm ở `lib/`, thuần và
 * test được; factory này chỉ khoác chữ lên chúng.
 *
 * Múi giờ luôn `Asia/Ho_Chi_Minh` và tiền luôn VND ở cả hai ngôn ngữ — đổi ngôn ngữ không bao
 * giờ được làm một mốc giao xe hay một số tiền đổi nghĩa.
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
  /** Mốc gọn cho bảng vận hành: `08:00 · 17/08` — bỏ năm để không chiếm ngang. */
  shortDateTime: (value: IsoDateTimeString | null | undefined) => string;
  shortDateTimeRange: (
    from: IsoDateTimeString | null | undefined,
    to: IsoDateTimeString | null | undefined,
  ) => string;
  /** Ngày `YYYY-MM-DD` (không kèm giờ) — nguyện vọng nhận xe, hạn giấy tờ. */
  dateKey: (value: string | null | undefined) => string;
  /**
   * Ngày đầy đủ CÓ THỨ: `Thứ Ba, 19 tháng 8, 2026` · `Tuesday, 19 August 2026`.
   *
   * Thay cho `dayjs.format('dddd, …')` — Day.js chỉ in được thứ theo ngôn ngữ khi có ai đó
   * gọi `dayjs.locale()` toàn tiến trình, đúng thứ ADR 0012 cấm.
   */
  fullDate: (value: Dayjs) => string;
  /**
   * Tháng + năm, chữ đầu VIẾT HOA: `Tháng 8, 2026` · `August 2026`.
   *
   * CLDR `vi` trả `tháng 8, 2026` (chữ thường) — tiêu đề lịch theo Figma viết hoa. Hoa hoá
   * ở đây thay vì đẻ thêm một mẫu ngày trong message: mẫu ngày là việc của `Intl`.
   */
  monthYear: (value: Date) => string;

  /** Thứ viết tắt: `T6` (vi) · `Fri` (en). */
  weekdayShort: (value: Dayjs) => string;
  /** Thứ viết đầy đủ: `Chủ Nhật` · `Sunday` — tiêu đề thẻ một ngày trên lịch. */
  weekdayLong: (value: Dayjs) => string;
  /**
   * Một MỐC thuê xe: `T6, 08/08 · 10:00`.
   *
   * **Không có năm** là cố ý: đơn thuê xe gần như luôn trong vài tuần tới, nên "2026" chỉ là
   * nhiễu; còn THỨ mấy lại là thứ người ta nghĩ tới đầu tiên khi xếp lịch ("trả xe chủ nhật").
   */
  rentalPoint: (value: Dayjs, opts?: { withTime?: boolean }) => string;
  /** Thời lượng thuê dạng chữ: `3 ngày` · `2 ngày 4 giờ` · `5 hours`. */
  rentalDuration: (from: Dayjs, to: Dayjs) => string;

  /** `45.230 km`; thiếu số ⇒ "Chưa có" (không phải `0 km`). */
  km: (value: number | null | undefined) => string;
  /**
   * Quãng đường GIAO XE: `3,4 km` · `3.4 km`. Một chữ số thập phân, không ép `,0`.
   *
   * Tách khỏi {@link km} vì hai con số khác bản chất: `km` là số trên đồng hồ (hàng chục nghìn,
   * phần lẻ vô nghĩa), còn cái này cắt bậc phí ở đúng 3 km và 5 km nên phần lẻ là thông tin.
   */
  distanceKm: (value: number | null | undefined) => string;
  /** Số KM không kèm đơn vị — cho ô nhập và chỗ đã có nhãn "km" riêng. */
  kmNumber: (value: number | null | undefined) => string;
  /** `Còn 2.000 km` · `Quá hạn 500 km` · `Chưa đủ dữ liệu`. */
  remainingKm: (value: number | null | undefined) => string;

  /** Nhãn gói thuê dài hạn: `9 tháng` · `9 months`. Chỉ 1/2/3/6/9/12 (ADR 0011). */
  packageLabel: (months: number | null | undefined) => string | null;
  /** Câu mô tả nguyện vọng nhận xe của khách thuê dài hạn. */
  pickupWish: (wish: PickupWish) => string;

  /**
   * Danh sách dịch vụ của một xe: `Tự lái · Có tài xế` · `Self-drive · With driver`.
   *
   * Thay cho `serviceTypesLabel` của `@xeprime/types` ở phía web — hàm đó trả nhãn tiếng Việt
   * cố định (apps/api vẫn dùng nó cho email/thông báo). Mã trong mảng KHÔNG đổi, chỉ nhãn dịch.
   */
  serviceTypes: (values: readonly string[] | null | undefined) => string;

  /** Số nguyên có phân tách nhóm. */
  count: (value: number) => string;
  /** Điểm đánh giá một chữ số thập phân: `4,8` · `4.8`. */
  rating: (value: number) => string;
}

/**
 * Mẫu ngày cho Ô CHỌN của Ant Design (`DatePicker.format`).
 *
 * Khác `formats.dateTime`: đây là mẫu Day.js, và nó vừa HIỂN THỊ vừa PHÂN TÍCH thứ người dùng
 * gõ vào ô. Người đọc tiếng Anh gõ `08/17/2026` chứ không phải `17/08/2026`, nên để nguyên mẫu
 * Việt sẽ nhận nhầm ngày thành tháng ở đúng nửa đầu mỗi tháng — sai âm thầm, không báo lỗi.
 *
 * KHÔNG dùng cho tham số URL: `DAY_PARAM_FORMAT`/`MONTH_PARAM_FORMAT` là dữ liệu, luôn ISO.
 */
export const DATE_PATTERN: Readonly<
  Record<AppLocale, { readonly date: string; readonly dateTime: string; readonly dayMonth: string }>
> = {
  vi: { date: 'DD/MM/YYYY', dateTime: 'DD/MM/YYYY HH:mm', dayMonth: 'DD/MM' },
  en: { date: 'MM/DD/YYYY', dateTime: 'MM/DD/YYYY HH:mm', dayMonth: 'MM/DD' },
};

/**
 * Dấu ngăn giữa các nhãn dịch vụ. Là KÝ HIỆU, không phải chữ — giống nhau ở mọi ngôn ngữ, nên
 * nó nằm trong mã chứ không nằm trong bó message (dịch một dấu chấm giữa là việc vô nghĩa).
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

/** Bộ dịch của namespace `Common` — chữ ký chung cho cả `useTranslations` lẫn `getTranslations`. */
export type CommonTranslator = ReturnType<typeof useTranslations<'Common'>>;
/** Bộ định dạng của next-intl — chữ ký chung cho `useFormatter` và `getFormatter`. */
export type AppFormatter = ReturnType<typeof useFormatter>;

/**
 * Dựng bộ định dạng từ ba thứ next-intl cấp: ngôn ngữ, formatter, bộ dịch.
 *
 * Hàm THUẦN, không hook — nhờ vậy Server Component gọi được nó qua `getAppFormat()`
 * (`i18n/server-format.ts`) mà không phải chuyển sang client chỉ để in một mốc ngày.
 * Một hiện thực, hai lối vào; không có bản thứ hai để trôi khỏi bản này.
 */
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
   * Thứ viết tắt lấy từ MESSAGE, không từ `Intl`.
   *
   * CLDR trả `Thứ 7` cho vi-VN — dài gấp ba `T7` và làm vỡ đúng những chỗ đã cố ý bỏ năm
   * để tiết kiệm chiều ngang (mốc thuê, ô lịch). Chữ ở đây là quy ước GIAO DIỆN của sản
   * phẩm, nên nó thuộc về bó message chứ không thuộc về dữ liệu vùng miền.
   */
  const weekday = (value: Dayjs) => t(`weekdayShort.${value.day()}`);

  const money = (value: MoneyString | null | undefined) => formatMoneyVnd(value, separators, empty);

  /** `null`/rỗng ⇒ "Miễn phí": một dịch vụ không mất phí, khác hẳn "chưa có giá". */
  const priceWithSuffix = (
    value: MoneyString | null | undefined,
    key: 'perDay' | 'perHour' | 'perMonth',
  ) => {
    if (value === null || value === undefined || value === '') return t('labels.free');
    return t(`units.${key}`, { value: money(value) });
  };

  /**
   * `Date` cho next-intl. Chuỗi ISO từ API là mốc UTC; `format.dateTime` đã nhận múi giờ
   * `Asia/Ho_Chi_Minh` từ `i18n/request.ts` nên hiển thị luôn đúng giờ Việt Nam.
   */
  const asDate = (value: IsoDateTimeString) => new Date(value);

  /**
   * `YYYY-MM-DD` là NGÀY LỊCH, không phải mốc thời gian: dựng ở giữa trưa UTC để phép quy
   * đổi múi giờ của formatter không kéo nó lùi sang ngày hôm trước.
   */
  const asCalendarDate = (dateKey: string) => new Date(`${dateKey}T12:00:00Z`);

  /**
   * Mốc ngày + giờ đầy đủ, ghép TAY từ hai mảnh.
   *
   * Không dùng một preset `Intl` gộp sẵn: với `vi`, CLDR đặt GIỜ TRƯỚC NGÀY
   * (`14:30 17/08/2026`) — ngược với cách cả sản phẩm đọc một mốc thời gian, và ngược với
   * chính ô chọn ngày giờ ngay bên cạnh. Thứ tự ở đây là quyết định GIAO DIỆN nên nó nằm ở
   * message (`Common.units.dateTime`), không giao cho dữ liệu vùng miền.
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
      return t(`units.compact.${parts.unit}`, { value: parts.value });
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
      return values.map((value) => domainLabel('serviceType', value)).join(SERVICE_SEPARATOR);
    },

    count: (value) => format.number(value, 'integer'),
    rating: (value) => format.number(value, 'rating'),
  };
}
