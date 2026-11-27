import { useTranslations } from 'use-intl';
import {
  absoluteMoney,
  isNegativeMoney,
  isZeroMoney,
  normalizeCollateral,
  payAtPickupAmount,
  type CollateralLike,
} from '@xeprime/domain';
import { COLLATERAL_MODE, PRICE_ROW, type PublicListingDetail } from '@xeprime/types';
import { useDescribeCollateral } from '@/features/rental-policies/collateral-text';
import type { PriceBreakdownFeesInput } from '@/components/ui/PriceBreakdown';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { customerFeeLines, visiblePriceRows } from '../customer-price-view';
import { useQuoteTotal } from './use-quote-total';
import { useLocalizePriceRows } from './use-localized-price-rows';

/** Những mảnh một bảng tiền phía khách cần — báo giá công khai và bảng kê tạm tính đều có đủ. */
export interface CustomerCostBreakdown {
  rows: ReadonlyArray<{ key: string; label: string; sublabel?: string | null; amount: string }>;
  totalAmount: string;
  depositAmount?: string | null;
  fees?: PriceBreakdownFeesInput | null;
  estimateNote?: string | null;
  longTerm?: {
    packageMonths: number;
    durationDiscountPercent?: number | null;
    durationDiscountAmount: string;
  } | null;
}

export interface CustomerDepositView {
  /** Miễn thế chấp. */
  none: boolean;
  /**
   * Chữ đứng ở cột số tiền: chỉ cọc tiền ⇒ số tiền; còn lại ⇒ câu `describeCollateral` ("Cọc tiền X
   * hoặc Cọc tài sản (…)", "Miễn thế chấp" - ADR 0112, web).
   */
  display: string;
  /**
   * `display` là một CÂU (cọc tài sản / kết hợp / miễn), không phải số tiền - dòng "nhãn ... giá trị"
   * xếp chồng để câu xuống dòng thay vì ép nhãn thành cột chữ dọc (web).
   */
  textual: boolean;
  note: string;
}

/**
 * MÔ HÌNH HIỂN THỊ của bảng tiền phía khách — bản native của `useCustomerCostView` web (#212).
 * CHỈ đọc báo giá / bảng kê của SERVER, không cộng trừ. Một nguồn cho thẻ "Thành tiền" ở trang
 * chi tiết xe và hai thẻ tiền của màn Xem lại / các màn chuyến (`BookingReviewCosts`).
 */
export function useCustomerCostView({
  listing,
  breakdown,
  isDelivery,
  frozen = false,
}: {
  listing: PublicListingDetail | null;
  breakdown: CustomerCostBreakdown | null;
  isDelivery: boolean;
  frozen?: boolean;
}) {
  const t = useTranslations('BookingRequests.flow');
  const tPrice = useTranslations('Common.components.price');
  const dl = useDomainLabel();
  const describeCollateral = useDescribeCollateral();
  const fmt = useAppFormat();
  const localizeRows = useLocalizePriceRows();

  /** Số âm (dòng giảm) viết bằng dấu trừ thật. */
  const signedMoney = (amount: string) =>
    isNegativeMoney(amount) ? `−${fmt.money(absoluteMoney(amount))}` : fmt.money(amount);

  const fees = breakdown?.fees ?? null;
  // Nhãn dòng tiền thuê: tiếng Việt giữ câu của server, tiếng Anh dịch theo mã (ADR 0012).
  const rentRows = localizeRows(
    breakdown ? visiblePriceRows(breakdown.rows, [PRICE_ROW.SUBTOTAL]) : [],
    Boolean(breakdown?.longTerm),
  );
  // Phí thu hộ bảo hiểm GỘP vào dòng IV, ⓘ tách hai số (ADR 0091 điều 3, web).
  const feeLines = customerFeeLines(fees?.lines ?? []);
  const promoDiscount = fees?.promoDiscountAmount ?? '0';
  const hasPromo = !isZeroMoney(promoDiscount);
  const longTerm = breakdown?.longTerm ?? null;
  const holdAmount = fees?.holdAmount ?? null;
  const payAtPickup = payAtPickupAmount(fees);

  /*
   * Cọc kết hợp (ADR 0112, web): hình thức từ hồ sơ xe; số tiền cọc ưu tiên báo giá. Hồ sơ xe vắng mà
   * báo giá có số cọc ⇒ cọc tiền. Không có gì để nói thì KHÔNG vẽ dòng.
   */
  const listed = listing?.collateral ?? null;
  const quotedDeposit =
    breakdown?.depositAmount && !isZeroMoney(breakdown.depositAmount)
      ? breakdown.depositAmount
      : null;
  const collateralInput: CollateralLike | null =
    listing?.noCollateral || listed?.mode === COLLATERAL_MODE.NONE
      ? { mode: COLLATERAL_MODE.NONE }
      : listed
        ? {
            mode: listed.mode,
            cashEnabled: listed.cashEnabled,
            assetEnabled: listed.assetEnabled,
            combination: listed.combination,
            assetTypes: listed.assetTypes,
            depositAmount: quotedDeposit ?? listed.depositAmount,
          }
        : quotedDeposit
          ? { mode: COLLATERAL_MODE.REQUIRED, cashEnabled: true, depositAmount: quotedDeposit }
          : null;
  const normalized = normalizeCollateral(collateralInput);
  const collateralText = describeCollateral(collateralInput);
  const cashOnly = normalized != null && normalized.cash && !normalized.asset;
  const deposit: CustomerDepositView | null =
    normalized && collateralText && (!cashOnly || normalized.depositAmount != null)
      ? {
          none: normalized.none,
          textual: !(cashOnly && normalized.depositAmount),
          display:
            cashOnly && normalized.depositAmount
              ? fmt.money(normalized.depositAmount)
              : collateralText,
          note: normalized.none
            ? t('reviewPage.others.noDepositBody')
            : normalized.asset && !normalized.cash && normalized.assetTypes.length
              ? t('reviewPage.others.assetBody', {
                  assets: normalized.assetTypes
                    .map((asset) => dl('collateralAssetType', asset))
                    .join(', '),
                })
              : tPrice('depositHint'),
        }
      : null;

  const total = useQuoteTotal(breakdown, { frozen });
  /** Câu "tạm tính" — luôn hiện thẳng cạnh tổng, KHÔNG vào hint (người dùng phải thấy). */
  const estimateNote = breakdown?.estimateNote ? `${breakdown.estimateNote}.` : null;
  /** Phần giải thích thuần của tổng — nằm trong dấu "i". */
  const costNote = [
    t('reviewPage.costs.totalNote'),
    isDelivery && !(frozen && rentRows.some((row) => row.key === PRICE_ROW.DELIVERY))
      ? t('price.deliveryNote')
      : null,
    frozen ? null : t('price.finalNote'),
  ]
    .filter(Boolean)
    .join(' ');

  return {
    signedMoney,
    fees,
    rentRows,
    feeLines,
    promoDiscount,
    hasPromo,
    longTerm,
    holdAmount,
    payAtPickup,
    deposit,
    total,
    costNote,
    estimateNote,
  };
}
