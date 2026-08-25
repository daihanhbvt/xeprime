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
  moneyToVietnameseWords,
  type CompactMoneyParts,
  type MoneyCompactUnit,
  type MoneySeparators,
} from './money';

export {
  APP_TIME_ZONE,
  TIME_FORMAT,
  MONTH_PARAM_FORMAT,
  DAY_PARAM_FORMAT,
  toAppTz,
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

export {
  haversineKm,
  isValidGeoPoint,
  normalizeAddressKey,
  roundCoord,
  type GeoPoint,
} from './geo';

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
