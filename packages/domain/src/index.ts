/**
 * `@xeprime/domain` — luật nghiệp vụ THUẦN, dùng chung cho web và app native.
 *
 * Điều kiện để một thứ được vào đây: nó không biết mình đang chạy ở đâu. Không React, không
 * Ant Design, không CSS, không `next/*`, không `File`/`XMLHttpRequest`, không đọc `process.env`.
 * Emit CommonJS (`packages/config/tsconfig/lib.json`) nên Metro đọc được trực tiếp.
 *
 * Vì sao gom lại: mấy phép tính này là **luật**, không phải tiện ích. Lịch bận
 * (`rental-busy.ts`) quyết định một khoảng thuê có khả thi không, và nó phải khớp từng chi tiết
 * với exclusion constraint ở tầng DB (ADR 0006). Nguyện vọng nhận xe (`long-term.ts`) là "một hàm
 * duy nhất" theo đúng chữ trong ADR 0011. Viết lại chúng lần thứ hai cho app native nghĩa là hai
 * client sẽ nói hai điều khác nhau về cùng một chiếc xe.
 *
 * Cái KHÔNG bao giờ vào đây (`docs/mobile-readiness-audit.md` §14.3):
 *  - hook filter sống ở URL — mobile không có URL, nó cần bản khác cùng interface (ADR 0004);
 *  - `uploadToR2` — dùng `File` + `XMLHttpRequest`; chỉ phần gọi presign là dùng chung được;
 *  - `apps/api/src/common/booking-money.ts` — server là nơi DUY NHẤT tính tiền có thẩm quyền,
 *    và nó dùng `Prisma.Decimal`/`Prisma.sql`.
 */

export {
  CURRENCY_SUFFIX,
  subtractMoney,
  absoluteMoney,
  isNegativeMoney,
  isZeroMoney,
  formatMoneyVnd,
  compactMoneyParts,
  wholeUnits,
  applyDiscountPercent,
  formatMoneyInput,
  parseMoneyInput,
  formatNumberInput,
  normalizeNumberInput,
  parseNumberInput,
  NUMBER_GROUP_SEPARATOR,
  NUMBER_DECIMAL_SEPARATOR,
  moneyToVietnameseWords,
  type CompactMoneyParts,
  type MoneyCompactUnit,
  type MoneySeparators,
} from './money';

export {
  APP_TIME_ZONE,
  chargedDays,
  TIME_FORMAT,
  MONTH_PARAM_FORMAT,
  DAY_PARAM_FORMAT,
  toAppTz,
  nowInAppTz,
  appWallClockToInstant,
  appWallClockToIso,
  appWallClockToCalendarDate,
  calendarDateToAppWallClock,
  startOfAppDay,
  rentalDurationParts,
  buildPeriodRange,
  dayjs,
  type Dayjs,
  type PeriodKey,
  type RentalDurationParts,
} from './datetime';

export {
  pickupWishParts,
  type PickupWish,
  type PickupWishKind,
  type PickupWishParts,
} from './long-term';

export { isSafeNextPath, safeNextPath } from './safe-path';

export { TEL_SCHEME, ZALO_PROFILE_BASE_URL, telHref, zaloHref } from './contact';

export {
  haversineKm,
  isValidGeoPoint,
  normalizeAddressKey,
  roundCoord,
  type GeoPoint,
} from './geo';

export {
  HOLIDAY_MAX_SPAN_DAYS,
  HOLIDAY_SYNC_YEARS_AFTER,
  HOLIDAY_SYNC_YEARS_BEFORE,
  classifyHolidayEventType,
  daysBetweenDateKeys,
  expandHolidaysByDay,
  googleAllDayEndToInclusive,
  holidayDateKeyOfInstant,
  holidaySyncWindow,
  normalizeGoogleHolidayEvent,
  normalizeGoogleHolidayEvents,
  planHolidaySync,
  shiftDateKey,
  type ExistingHolidayRow,
  type GoogleCalendarEventLike,
  type HolidayDateKey,
  type HolidayLike,
  type HolidaySyncPlan,
  type HolidaySyncWindow,
  type HolidayUpdate,
  type NormalizeHolidaysResult,
  type NormalizedHoliday,
  type SkippedHolidayEvent,
} from './holidays';

export {
  EMPTY_BUSY_INDEX,
  busyDayKey,
  buildBusyDayIndex,
  busyLevelOf,
  busyPeriodsOf,
  firstBusyDayAfter,
  rangeBusyConflict,
  type BusyDayIndex,
  type BusyDayInfo,
  type BusyLevel,
  type BusyPeriod,
  type VehicleBusyDay,
} from './rental-busy';

export {
  BULK_PRICE_MODE,
  PRICE_PERCENT_MAX,
  PRICE_PERCENT_MIN,
  PRICE_ROUND_STEPS,
  PRICE_ROUND_STEP_DEFAULT,
  PRICE_SPREAD_WARN_RATIO,
  applyPercentToPrice,
  holidayRunAround,
  isWeekendDateKey,
  listDateKeys,
  listedPriceForDay,
  planBulkDayPrices,
  priceSpreadRatio,
  roundPriceTo,
  type BulkPriceInput,
  type BulkPriceMode,
  type BulkPricePlanOptions,
  type BulkPriceRow,
  type DayHolidayLookup,
  type VehicleDayBasePrice,
} from './bulk-day';
/**
 * Ngữ cảnh tìm kiếm marketplace — luật "dịch vụ nào phát tham số nào", dùng chung web ↔ native.
 * Nằm ở domain vì nó là NGHIỆP VỤ (ADR 0011 nằm trong đó), không phải chuyện gọi HTTP.
 */
export {
  SEARCH_OWNED_KEYS,
  defaultRentalRange,
  draftFromFilters,
  draftToFilterPatch,
  resolveServiceType,
  serviceTypesFor,
  serviceUsesRentalRange,
  type RentalMode,
  type SearchDraft,
  type SearchFilterPatch,
} from './search-draft';

/** Ký hiệu trình bày dùng chung — không phải chữ, nên không nằm trong bó message. */
export { LIST_SEPARATOR } from './display';

export { remainingKm, type RemainingKm, type RemainingKmKind } from './odometer';
