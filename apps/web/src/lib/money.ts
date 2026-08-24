/**
 * Tiền — đã chuyển sang `@xeprime/domain`.
 *
 * Re-export ở đúng đường dẫn cũ để mọi `import … from '@/lib/money'` hiện có không phải sửa
 * (`docs/mobile-readiness-audit.md` §14.1: mỗi file chuyển đi để lại một dòng re-export).
 * Phép cộng trừ tiền chạy trên CHUỖI, không qua `number` — ADR 0007.
 */
export {
  CURRENCY_SUFFIX,
  absoluteMoney,
  applyDiscountPercent,
  compactMoneyParts,
  formatMoneyVnd,
  isNegativeMoney,
  isZeroMoney,
  moneyToVietnameseWords,
  subtractMoney,
  wholeUnits,
  type CompactMoneyParts,
  type MoneyCompactUnit,
  type MoneySeparators,
} from '@xeprime/domain';
